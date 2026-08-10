/**
 * Backfill descriptions for Devpost events that were bulk-imported without one.
 *
 * The Devpost archive backfill pushed `ended` hackathons with an empty
 * description (to keep the run fast). This fills them in from each hackathon
 * page's `og:description` tag — the same field the live scraper stores.
 *
 * Idempotent: only touches Devpost rows whose description is still empty.
 * Usage from apps/web:
 *   bun scripts/backfill-devpost-descriptions.ts            # all missing
 *   bun scripts/backfill-devpost-descriptions.ts --limit=20 # cap for a test
 */
import { and, eq, isNull, like, or } from "drizzle-orm";
import { db } from "../src/db";
import { events } from "../src/db/schema";

const USER_AGENT = "HackathonAtlasScraper/1.0";
const CONCURRENCY = 8;
const DELAY_MS = 150; // small per-request jitter; links are distinct subdomains

const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? Number(limitArg.split("=")[1]) : undefined;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** Fetch a hackathon page and pull its og:description. */
async function fetchDescription(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    const html = await resp.text();
    const m = html.match(
      /<meta property="og:description" content="([^"]*)"/i,
    );
    const desc = m?.[1] ? decodeEntities(m[1]).trim() : "";
    return desc || null;
  } catch {
    return null;
  }
}

async function main() {
  const rows = await db
    .select({ id: events.id, link: events.link })
    .from(events)
    .where(
      and(
        like(events.link, "%devpost%"),
        or(isNull(events.description), eq(events.description, "")),
      ),
    )
    .limit(LIMIT ?? 100000);

  const total = rows.length;
  console.log(
    `Enriching ${total} Devpost event(s) missing a description (concurrency ${CONCURRENCY})…`,
  );

  const counts = { updated: 0, empty: 0, failed: 0 };
  let done = 0;
  let next = 0;

  async function worker() {
    while (next < rows.length) {
      const { id, link } = rows[next++]!;
      if (!link) {
        counts.failed++;
        done++;
        continue;
      }
      await sleep(Math.random() * DELAY_MS);
      const desc = await fetchDescription(link);
      if (desc === null) {
        counts.empty++;
      } else {
        await db
          .update(events)
          .set({ description: desc })
          .where(eq(events.id, id));
        counts.updated++;
      }
      done++;
      if (done % 50 === 0 || done === total) {
        console.log(
          `  ${done}/${total} — updated ${counts.updated}, no-desc ${counts.empty}, failed ${counts.failed}`,
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
