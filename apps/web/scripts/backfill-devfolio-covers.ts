/**
 * Backfill cover images for Devfolio events that were imported without one.
 *
 * The Devfolio GraphQL archive import doesn't carry cover images, so those
 * rows landed with `cover_url = NULL`. Each Devfolio hackathon microsite
 * (`<slug>.devfolio.co`) embeds a stable `cover_img` asset URL in its
 * `__NEXT_DATA__`; we fetch it, re-upload it to our bucket via the same
 * pipeline the API uses (`uploadImageFromUrl`, which also makes the thumbnail),
 * and store the resulting key.
 *
 * Idempotent: only touches Devfolio rows whose `cover_url` is still NULL.
 * Run from apps/web:  bun scripts/backfill-devfolio-covers.ts
 */
import { and, eq, isNull, like } from "drizzle-orm";
import { db } from "../src/db";
import { events } from "../src/db/schema";
import { uploadImageFromUrl } from "../src/lib/s3";

const CONCURRENCY = 6;

/** Pull `cover_img` out of a microsite's embedded `__NEXT_DATA__`. */
function extractCoverImg(html: string): string {
  const m = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s,
  );
  if (m) {
    try {
      const data = JSON.parse(m[1]!);
      const queries = data?.props?.pageProps?.dehydratedState?.queries ?? [];
      for (const q of queries) {
        const list = Array.isArray(q?.state?.data) ? q.state.data : [];
        for (const item of list) {
          const cover = item?.hackathons?.[0]?.cover_img;
          if (cover) return String(cover);
        }
      }
    } catch {
      // fall through to regex
    }
  }
  return html.match(/"cover_img":"([^"]*)"/)?.[1]?.replace(/\\u002F/g, "/") ?? "";
}

/** `https://<slug>.devfolio.co` -> `<slug>` */
function slugFromLink(link: string): string | null {
  const m = link.match(/^https?:\/\/([^.]+)\.devfolio\.co\/?$/i);
  return m?.[1] ?? null;
}

type Outcome = "updated" | "no-cover" | "failed";

async function processRow(row: { id: string; link: string | null }): Promise<Outcome> {
  const slug = row.link ? slugFromLink(row.link) : null;
  if (!slug) return "no-cover";
  try {
    const resp = await fetch(`https://${slug}.devfolio.co/`, {
      headers: { "User-Agent": "HackathonAtlasScraper/1.0" },
    });
    if (!resp.ok) return "no-cover";
    const coverImg = extractCoverImg(await resp.text());
    if (!coverImg) return "no-cover";

    const key = await uploadImageFromUrl(coverImg); // re-host + thumbnail
    await db.update(events).set({ coverUrl: key }).where(eq(events.id, row.id));
    return "updated";
  } catch (err) {
    console.error(`  ✗ ${slug}:`, (err as Error).message);
    return "failed";
  }
}

async function main() {
  const rows = await db
    .select({ id: events.id, link: events.link })
    .from(events)
    .where(and(isNull(events.coverUrl), like(events.link, "%.devfolio.co")));

  const total = rows.length;
  console.log(`Backfilling covers for ${total} Devfolio events (concurrency ${CONCURRENCY})…`);

  const counts: Record<Outcome, number> = { updated: 0, "no-cover": 0, failed: 0 };
  let done = 0;
  let next = 0;

  async function worker() {
    while (next < rows.length) {
      const i = next++;
      const outcome = await processRow(rows[i]!);
      counts[outcome]++;
      done++;
      if (done % 25 === 0 || done === total) {
        console.log(
          `  ${done}/${total} — updated ${counts.updated}, no-cover ${counts["no-cover"]}, failed ${counts.failed}`,
        );
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log("Done:", counts);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
