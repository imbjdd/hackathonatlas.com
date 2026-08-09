// Delete events whose Luma link is dead (HTTP 404/410 — event removed at source).
//
// Usage:
//   bun run prune:dead-links            # dry run: list what would be deleted
//   bun run prune:dead-links --apply    # actually delete
//   bun run prune:dead-links --all      # scan every event, not just upcoming
//
// Only a definitive 404/410 marks a link dead; 429/timeouts are ignored so a
// transient rate-limit can never delete a live event.

import { and, gte, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { db } from "../src/db";
import { events } from "../src/db/schema";
import { isLumaUrl } from "../src/lib/luma";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const ALL = args.includes("--all");
const CONCURRENCY = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function statusOf(url: string, retries = 3): Promise<number> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { "user-agent": "Mozilla/5.0 (compatible; HackathonAtlas/1.0)" },
        redirect: "follow",
      });
      if (res.status === 429 && attempt < retries) {
        await sleep(Math.min(30000, 2000 * 2 ** attempt) + Math.random() * 750);
        continue;
      }
      return res.status;
    } catch {
      if (attempt >= retries) return 0; // network error → treat as "unknown", never delete
      await sleep(1500 * 2 ** attempt);
    }
  }
  return 0;
}

async function run() {
  const conds = [isNotNull(events.link)];
  // Default candidate set: upcoming events that never enriched (likely dead).
  if (!ALL) {
    conds.push(or(isNull(events.endTime), gte(events.endTime, new Date()))!);
    conds.push(isNull(events.enrichedAt));
  }
  const rows = (
    await db.select({ id: events.id, title: events.title, link: events.link }).from(events).where(and(...conds))
  ).filter((r) => isLumaUrl(r.link));

  console.log(`Checking ${rows.length} candidate link(s)…${APPLY ? " (will delete 404s)" : " (dry run)"}`);

  const dead: { id: string; title: string; link: string }[] = [];
  let cursor = 0;
  async function worker() {
    while (cursor < rows.length) {
      const r = rows[cursor++]!;
      const code = await statusOf(r.link!);
      if (code === 404 || code === 410) {
        dead.push({ id: r.id, title: r.title, link: r.link! });
        console.log(`  DEAD ${code}  ${(r.title || "").slice(0, 45)}  ${r.link}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log(`\n${dead.length} dead link(s) found.`);
  if (dead.length && APPLY) {
    await db.delete(events).where(inArray(events.id, dead.map((d) => d.id)));
    console.log(`Deleted ${dead.length} event(s).`);
  } else if (dead.length) {
    console.log("Dry run — re-run with --apply to delete.");
  }
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
