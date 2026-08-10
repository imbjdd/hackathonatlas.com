// Discord webhook notifications for run summaries.

export type RunSummary = {
  totalFetched: number;
  filteredExisting: number;
  totalToPush: number;
  success: number;
  failed: number;
  dryRun: boolean;
  /** Per-source counts, for visibility as sources are added. */
  bySource: Record<string, number>;
};

/** Post a run summary to Discord. Returns false if no webhook / on error. */
export async function notifyDiscordSummary(
  summary: RunSummary,
  webhookUrl: string | undefined,
): Promise<boolean> {
  if (!webhookUrl) return false;

  const status = summary.failed > 0 ? "PARTIAL" : "OK";
  const bySource = Object.entries(summary.bySource)
    .map(([name, count]) => `  - ${name}: ${count}`)
    .join("\n");

  const content = [
    `Cron scrapers -> Hackathons: ${status}`,
    `- fetched: ${summary.totalFetched}`,
    `- filtered_existing: ${summary.filteredExisting}`,
    `- to_push: ${summary.totalToPush}`,
    `- added_ok: ${summary.success}`,
    `- failed: ${summary.failed}`,
    `- dry_run: ${summary.dryRun ? "yes" : "no"}`,
    bySource ? `- fetched_by_source:\n${bySource}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}
