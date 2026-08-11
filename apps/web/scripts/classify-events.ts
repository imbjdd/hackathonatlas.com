// Backfill the fake/test-hackathon classifier over existing events.
//
// Usage:
//   bun run classify:events                 # only unclassified ("pending") rows
//   bun run classify:events --force         # re-classify everything
//   bun run classify:events --limit=50      # cap for a test run
//   bun run classify:events --dry-run       # print verdicts, write nothing
//
// Requires OPENAI_API_KEY. High-confidence verdicts are applied automatically
// (kept/rejected); uncertain ones become "needs_review" for /admin. Idempotent
// and resumable — safe to re-run.

import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "../src/db";
import { events } from "../src/db/schema";
import {
  classifyEvent,
  statusForResult,
  CLASSIFIER_MODEL,
} from "../src/lib/classifier";

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const DRY_RUN = args.includes("--dry-run");
const limitArg = args.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? Number(limitArg.split("=")[1]) : undefined;

// Keep the request rate modest so we don't trip OpenAI rate limits.
const CONCURRENCY = 5;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function run() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is not set — nothing to do.");
    process.exit(1);
  }

  const conds = [isNotNull(events.title)];
  // Only touch rows that haven't been decided yet unless --force. "pending"
  // means never classified; "needs_review" is left for a human, not re-run.
  if (!FORCE) conds.push(eq(events.classificationStatus, "pending"));

  const rows = await db
    .select({
      id: events.id,
      title: events.title,
      description: events.description,
      link: events.link,
      city: events.city,
      country: events.country,
      startTime: events.startTime,
    })
    .from(events)
    .where(and(...conds))
    .limit(LIMIT ?? 100000);

  console.log(
    `Classifying ${rows.length} event(s) with ${CLASSIFIER_MODEL}${
      FORCE ? " (force)" : ""
    }${DRY_RUN ? " (dry-run)" : ""}…`,
  );

  const stats = { kept: 0, rejected: 0, needsReview: 0, failed: 0 };
  let cursor = 0;

  async function worker() {
    while (cursor < rows.length) {
      const idx = cursor++;
      const row = rows[idx]!;
      const result = await classifyEvent(row).catch(() => null);

      if (!result) {
        stats.failed++;
      } else {
        const status = statusForResult(result);
        if (status === "kept") stats.kept++;
        else if (status === "rejected") stats.rejected++;
        else stats.needsReview++;

        if (DRY_RUN) {
          console.log(
            `  [${status}] ${result.confidence.toFixed(2)} — ${row.title} — ${result.reason}`,
          );
        } else {
          await db
            .update(events)
            .set({
              classificationStatus: status,
              classificationConfidence: result.confidence,
              classificationReason: result.reason,
              classificationModel: result.model,
              classifiedAt: new Date(),
            })
            .where(eq(events.id, row.id));
        }
      }

      if ((idx + 1) % 50 === 0) {
        console.log(`  …${idx + 1}/${rows.length}`);
        await sleep(200);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log("Done:", stats);
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
