/**
 * Backfill square WebP thumbnails for every existing event cover.
 *
 * For each distinct `covers/<uuid>.<ext>` key stored on events, generate a
 * `thumbs/<uuid>.webp` thumbnail (if it doesn't already exist) and upload it.
 *
 * Idempotent: rerunning skips covers whose thumbnail already exists.
 * Run from apps/web:  bun scripts/backfill-thumbnails.ts
 */
import { isNotNull } from "drizzle-orm";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { db } from "../src/db";
import { events } from "../src/db/schema";
import { BUCKET, makeThumbnail, s3 } from "../src/lib/s3";
import { thumbKeyForCover } from "../src/lib/thumb-key";

const CONCURRENCY = 8;

async function thumbExists(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

type Outcome = "made" | "exists" | "skipped" | "failed";

async function processCover(coverKey: string): Promise<Outcome> {
  if (!coverKey.startsWith("covers/")) return "skipped";
  const thumbKey = thumbKeyForCover(coverKey);

  if (await thumbExists(thumbKey)) return "exists";

  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: coverKey }));
    const bytes = await obj.Body!.transformToByteArray();
    const thumb = await makeThumbnail(Buffer.from(bytes));
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: thumbKey,
        Body: thumb,
        ContentType: "image/webp",
      }),
    );
    return "made";
  } catch (err) {
    console.error(`  ✗ ${coverKey}:`, (err as Error).message);
    return "failed";
  }
}

async function main() {
  const rows = await db
    .select({ cover: events.coverUrl })
    .from(events)
    .where(isNotNull(events.coverUrl));

  const keys = [
    ...new Set(
      rows
        .map((r) => r.cover)
        .filter((k): k is string => !!k && k.startsWith("covers/")),
    ),
  ];

  const total = keys.length;
  console.log(`Backfilling thumbnails for ${total} covers (concurrency ${CONCURRENCY})…`);

  const counts: Record<Outcome, number> = { made: 0, exists: 0, skipped: 0, failed: 0 };
  let done = 0;
  let next = 0;

  async function worker() {
    while (next < keys.length) {
      const i = next++;
      const outcome = await processCover(keys[i]!);
      counts[outcome]++;
      done++;
      if (done % 50 === 0 || done === total) {
        console.log(
          `  ${done}/${total} — made ${counts.made}, exists ${counts.exists}, failed ${counts.failed}`,
        );
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log("Done:", counts);
  process.exit(counts.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
