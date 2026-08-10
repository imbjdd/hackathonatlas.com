// Central config, resolved once from the environment.

const DEFAULT_PUSH_API_URL =
  "https://hackathons-production-960c.up.railway.app/api/hackathons";

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

function parseDate(input: string): Date {
  const trimmed = input.trim();
  if (trimmed.length === 10) return new Date(`${trimmed}T00:00:00.000Z`);
  return new Date(trimmed);
}

/** Derive the `/exists` dedup endpoint from the push endpoint. */
function deriveExistsApiUrl(pushApiUrl: string): string {
  try {
    const url = new URL(pushApiUrl);
    if (url.pathname.endsWith("/api/hackathons")) {
      url.pathname = `${url.pathname}/exists`;
      return url.toString();
    }
  } catch {
    // Fall through to the default below.
  }
  const url = new URL(DEFAULT_PUSH_API_URL);
  url.pathname = `${url.pathname}/exists`;
  return url.toString();
}

export type Config = {
  limit: number;
  delay: number;
  includeDescriptions: boolean;
  dryRun: boolean;
  after?: Date;
  before?: Date;
  query?: string;
  /** Comma-separated source names to run; empty = run all registered. */
  sources: string[];
  pushApiUrl: string;
  existsApiUrl: string;
  apiSecret?: string;
  organizerId: string;
  discordWebhookUrl?: string;
  outputFile?: string;
};

export function loadConfig(): Config {
  const pushApiUrl = process.env.PUSH_API_URL ?? DEFAULT_PUSH_API_URL;
  const existsApiUrl =
    process.env.EXISTS_API_URL ?? deriveExistsApiUrl(pushApiUrl);

  const sources = (process.env.SOURCES ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  return {
    limit: Math.max(1, envNumber("LIMIT", 20)),
    delay: envNumber("DELAY", 2.0),
    includeDescriptions: envBool("INCLUDE_DESCRIPTIONS", true),
    dryRun: envBool("DRY_RUN", false),
    after: process.env.AFTER ? parseDate(process.env.AFTER) : undefined,
    before: process.env.BEFORE ? parseDate(process.env.BEFORE) : undefined,
    query: process.env.QUERY || undefined,
    sources,
    pushApiUrl,
    existsApiUrl,
    apiSecret: process.env.HACKATHONS_API_SECRET,
    organizerId:
      process.env.ORGANIZER_ID ?? "00000000-0000-0000-0000-000000000000",
    discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL,
    outputFile: process.env.OUTPUT_FILE,
  };
}
