// Backfill event attendance mode + location from Luma.
//
// Usage:
//   bun run backfill:locations              # only rows not yet enriched
//   bun run backfill:locations --force      # re-enrich everything
//   bun run backfill:locations --limit=50   # cap for a test run
//
// Reads each event's Luma link, extracts location_type/geo, and stores
// mode/city/country/countryCode/lat/lng/venue so the UI never has to guess.

import { and, eq, gte, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "../src/db";
import { events } from "../src/db/schema";
import { enrichFromLuma, isLumaUrl } from "../src/lib/luma";

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const UPCOMING = args.includes("--upcoming");
// Luma is behind Cloudflare and rate-limits bursts — stay gentle.
const CONCURRENCY = 3;
const DELAY_MS = 350;
const limitArg = args.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? Number(limitArg.split("=")[1]) : undefined;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function run() {
  const conds = [isNotNull(events.link)];
  if (!FORCE) conds.push(isNull(events.enrichedAt));
  if (UPCOMING) conds.push(or(isNull(events.endTime), gte(events.endTime, new Date()))!);

  const rows = await db
    .select({ id: events.id, link: events.link })
    .from(events)
    .where(and(...conds))
    .limit(LIMIT ?? 100000);

  const targets = rows.filter((r) => isLumaUrl(r.link));
  console.log(`Enriching ${targets.length} event(s) from Luma${FORCE ? " (force)" : ""}…`);

  const stats = { inPerson: 0, online: 0, unknownMode: 0, cityFound: 0, failed: 0, updated: 0 };
  let cursor = 0;

  async function worker() {
    while (cursor < targets.length) {
      const idx = cursor++;
      const { id, link } = targets[idx]!;
      await sleep(DELAY_MS + Math.random() * DELAY_MS);
      const loc = await enrichFromLuma(link!, { retries: 4 });
      if (!loc) {
        stats.failed++;
      } else {
        // Only overwrite a field when Luma gives us a value; keep existing data
        // (e.g. a previously-known city) when Luma omits it.
        await db
          .update(events)
          .set({
            mode: loc.mode ?? sql`${events.mode}`,
            city: loc.city ?? sql`${events.city}`,
            country: loc.country ?? sql`${events.country}`,
            countryCode: loc.countryCode ?? sql`${events.countryCode}`,
            latitude: loc.latitude ?? sql`${events.latitude}`,
            longitude: loc.longitude ?? sql`${events.longitude}`,
            venue: loc.venue ?? sql`${events.venue}`,
            enrichedAt: new Date(),
          })
          .where(eq(events.id, id));
        stats.updated++;
        if (loc.mode === "in_person") stats.inPerson++;
        else if (loc.mode === "online") stats.online++;
        else stats.unknownMode++;
        if (loc.city) stats.cityFound++;
      }
      if ((idx + 1) % 50 === 0) console.log(`  …${idx + 1}/${targets.length}`);
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
