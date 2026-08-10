// Cron runner.
//
// For each selected source: fetch -> dedup against the directory -> push.
// Sends a Discord summary at the end. Configure entirely via env vars
// (see .env.example). Run with: `bun run start` (from the crons/ dir).

import { loadConfig } from "./config.js";
import { randomBetween, sleep } from "./lib/http.js";
import { notifyDiscordSummary, type RunSummary } from "./lib/notify.js";
import { eventExists, pushEvent } from "./lib/push.js";
import { loadSources } from "./sources/index.js";
import type { NormalizedEvent, SourceContext } from "./types.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const sources = await loadSources(config.sources);

  if (!sources.length) {
    throw new Error("No sources to run. Check the SOURCES env var / registry.");
  }

  console.error(`[*] Running sources: ${sources.map((s) => s.name).join(", ")}`);

  // 1. Fetch from every source.
  const bySource: Record<string, number> = {};
  const fetched: NormalizedEvent[] = [];

  for (const source of sources) {
    const ctx: SourceContext = {
      limit: config.limit,
      delay: config.delay,
      after: config.after,
      before: config.before,
      query: config.query,
      includeDescriptions: config.includeDescriptions,
      log: (msg) => console.error(`[${source.name}] ${msg}`),
    };

    try {
      const events = await source.fetchEvents(ctx);
      bySource[source.name] = events.length;
      fetched.push(...events);
      console.error(`[*] ${source.name}: fetched ${events.length}`);
    } catch (error) {
      bySource[source.name] = 0;
      console.error(`[!] ${source.name} failed: ${String(error)}`);
    }
  }

  // 2. Dedup: drop events already present in the directory.
  const toPush: NormalizedEvent[] = [];
  let filteredExisting = 0;

  for (const event of fetched) {
    if (event.link && (await eventExists(event.link, config))) {
      filteredExisting += 1;
      console.error(`[*] Skipping existing: ${event.title.slice(0, 50)}`);
      continue;
    }
    toPush.push(event);
  }

  if (config.outputFile) {
    await Bun.write(config.outputFile, JSON.stringify(toPush, null, 2));
    console.error(`[*] Exported ${toPush.length} events to ${config.outputFile}`);
  }

  // 3. Push (unless dry run).
  let success = 0;
  let failed = 0;

  for (let i = 0; i < toPush.length; i++) {
    const event = toPush[i]!;

    if (config.dryRun) {
      console.log(JSON.stringify({ ...event, organizerId: config.organizerId }));
      continue;
    }

    console.error(`[*] ${i + 1}/${toPush.length} pushing: ${event.title.slice(0, 50)}`);
    const result = await pushEvent(event, config);

    if (result.status >= 200 && result.status < 300) {
      success += 1;
      console.error(`  [OK] ${result.status}`);
    } else {
      failed += 1;
      console.error(`  [FAIL] ${result.status} ${result.body}`);
    }

    if (i < toPush.length - 1) await sleep(randomBetween(300, 800));
  }

  // 4. Summary + Discord.
  const summary: RunSummary = {
    totalFetched: fetched.length,
    filteredExisting,
    totalToPush: toPush.length,
    success,
    failed,
    dryRun: config.dryRun,
    bySource,
  };

  const notified = await notifyDiscordSummary(summary, config.discordWebhookUrl);

  if (!config.dryRun) {
    console.error(`[*] Done: ${success} OK, ${failed} failed`);
  }
  if (config.discordWebhookUrl) {
    console.error(notified ? "[*] Discord summary sent." : "[*] Discord summary failed.");
  }
}

await main();
