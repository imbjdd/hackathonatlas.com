// Devpost (devpost.com) source.
//
// Devpost exposes a clean public JSON API at `/api/hackathons` that lists every
// hackathon with pagination (9 per page). One request per page yields title,
// location, dates (as a human string), prize, themes and registration counts.
// Cover image and full description come from each hackathon page's `og:*` tags.

import { geocode } from "../lib/geocode.js";
import { fetchJson, randomBetween, sleep, USER_AGENT } from "../lib/http.js";
import type { NormalizedEvent, Source, SourceContext } from "../types.js";

const API_URL = "https://devpost.com/api/hackathons";
const PER_PAGE = 9; // Devpost's fixed page size.
const MAX_PAGES = 30;

/** Open states to keep. Override with DEVPOST_STATUSES (comma-separated). */
const DEFAULT_STATUSES = ["upcoming", "open"];

/** Shape of a hackathon entry in the Devpost API (subset we use). */
type DevpostHackathon = {
  id: number;
  title: string;
  displayed_location?: { location?: string } | null;
  open_state: string; // "upcoming" | "open" | "ended"
  thumbnail_url?: string | null;
  url: string;
  submission_period_dates?: string | null; // e.g. "Aug 17 - Sep 03, 2026"
  themes?: Array<{ name: string }> | null;
  prize_amount?: string | null; // HTML: "$<span data-currency-value>40,500</span>"
  registrations_count?: number | null;
  organization_name?: string | null;
};

type DevpostResponse = {
  hackathons?: DevpostHackathon[];
  meta?: { total_count?: number; per_page?: number };
};

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** One side of a date, e.g. "Aug 14", "Sep 03, 2026", "16" or "Dec 31, 2026". */
type DatePart = { month?: number; day: number; year?: number };

/** Parse a single date component; month and year are optional. */
function parseDatePart(raw: string): DatePart | null {
  const toks = raw.replace(/,/g, "").trim().split(/\s+/).filter(Boolean);
  if (!toks.length) return null;

  let month: number | undefined;
  let idx = 0;
  const maybeMonth = MONTHS[toks[0]!.slice(0, 3).toLowerCase()];
  if (maybeMonth !== undefined) {
    month = maybeMonth;
    idx = 1;
  }

  const day = Number(toks[idx]);
  if (!Number.isFinite(day)) return null;

  let year: number | undefined;
  const yearTok = toks[idx + 1];
  if (yearTok && /^\d{4}$/.test(yearTok)) year = Number(yearTok);

  return { month, day, year };
}

/**
 * Parse Devpost's human date string into ISO start/end timestamps.
 *
 * Handles single dates ("Sep 27, 2026") and ranges, where the left side may
 * omit its month and/or year: "Aug 14 - 16, 2026", "Aug 17 - Sep 03, 2026",
 * "Sep 14 - Oct 01, 2026", "Jul 16, 2026 - Jan 15, 2027". When the left side
 * has no year, the trailing (end) year applies — minus one when the start month
 * is later than the end month (a range crossing New Year, e.g. "Dec 28 - Jan
 * 03, 2027").
 */
function parseDateRange(
  raw: string,
): { startTime: string; endTime: string } | null {
  const [leftRaw, rightRaw] = raw.split(" - ");
  if (!leftRaw) return null;

  const left = parseDatePart(leftRaw);
  if (!left || left.month === undefined) return null;

  // Single date: start and end are the same day.
  if (!rightRaw) {
    if (left.year === undefined) return null;
    return toRange(left.month, left.day, left.year, left.month, left.day, left.year);
  }

  const right = parseDatePart(rightRaw);
  if (!right) return null;

  const endMonth = right.month ?? left.month;
  const endYear = right.year ?? left.year;
  if (endYear === undefined) return null;

  const startMonth = left.month;
  const startYear =
    left.year ?? (startMonth > endMonth ? endYear - 1 : endYear);

  return toRange(startMonth, left.day, startYear, endMonth, right.day, endYear);
}

/** Build an ISO start/end range (start at 00:00:00, end at 23:59:59 UTC). */
function toRange(
  sm: number,
  sd: number,
  sy: number,
  em: number,
  ed: number,
  ey: number,
): { startTime: string; endTime: string } | null {
  const start = new Date(Date.UTC(sy, sm, sd, 0, 0, 0));
  const end = new Date(Date.UTC(ey, em, ed, 23, 59, 59));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { startTime: start.toISOString(), endTime: end.toISOString() };
}

/**
 * Parse the prize amount into USD. `prize_amount` is HTML like
 * `$<span data-currency-value>40,500</span>`. Only `$` amounts are treated as
 * USD; other currencies (€, £, ...) return -1 to avoid mislabelling.
 */
function parsePrize(raw: string | null | undefined): number {
  if (!raw) return -1;
  const text = raw.replace(/<[^>]*>/g, "").trim(); // strip tags -> "$40,500"
  if (!text.startsWith("$")) return -1;
  const digits = text.replace(/[^0-9]/g, "");
  if (!digits) return -1;
  const value = Number(digits);
  return Number.isFinite(value) && value > 0 ? value : -1;
}

/** A location is "online" when Devpost has no venue or literally says "Online". */
function isOnline(location: string): boolean {
  return !location || location.trim().toLowerCase() === "online";
}

/** Normalize a protocol-relative Devpost image URL to an absolute https one. */
function absoluteUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (url.startsWith("//")) return `https:${url}`;
  return url;
}

/** Fetch a hackathon page and pull the stable og:image / og:description. */
async function fetchMeta(
  pageUrl: string,
): Promise<{ coverUrl: string; description: string }> {
  try {
    const resp = await fetch(pageUrl, { headers: { "User-Agent": USER_AGENT } });
    const html = await resp.text();
    const og = (prop: string) =>
      html.match(
        new RegExp(`<meta property="og:${prop}" content="([^"]*)"`, "i"),
      )?.[1] ?? "";
    const decode = (s: string) =>
      s
        .replace(/&amp;/g, "&")
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");
    return {
      coverUrl: og("image"),
      description: decode(og("description")),
    };
  } catch {
    return { coverUrl: "", description: "" };
  }
}

function resolveStatuses(): string[] {
  const raw = process.env.DEVPOST_STATUSES;
  if (!raw) return DEFAULT_STATUSES;
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

async function fetchPage(
  status: string,
  page: number,
  query?: string,
): Promise<DevpostResponse> {
  const params = new URLSearchParams({ page: String(page) });
  params.append("status[]", status);
  if (query) params.set("search", query);

  const data = await fetchJson<DevpostResponse>(
    `${API_URL}?${params.toString()}`,
    { headers: { "User-Agent": USER_AGENT } },
  );
  return data ?? {};
}

export async function createDevpostSource(): Promise<Source> {
  const statuses = resolveStatuses();

  return {
    name: "devpost",
    async fetchEvents(ctx: SourceContext): Promise<NormalizedEvent[]> {
      // 1. Collect raw hackathons across the selected statuses, deduped by id.
      const rawById = new Map<number, DevpostHackathon>();

      for (const status of statuses) {
        for (let page = 1; page <= MAX_PAGES; page++) {
          if (rawById.size >= ctx.limit) break;
          ctx.log(`fetching status='${status}' page ${page}`);
          const data = await fetchPage(status, page, ctx.query);
          const items = data.hackathons ?? [];
          if (!items.length) break;

          for (const h of items) {
            const dates = h.submission_period_dates
              ? parseDateRange(h.submission_period_dates)
              : null;
            const start = dates ? new Date(dates.startTime) : null;
            if (ctx.after && start && start < ctx.after) continue;
            if (ctx.before && start && start > ctx.before) continue;
            if (!rawById.has(h.id)) rawById.set(h.id, h);
          }

          const total = data.meta?.total_count ?? 0;
          if (page * PER_PAGE >= total) break;

          const jitter = ctx.delay + randomBetween(0.5, 1.5);
          await sleep(jitter * 1000);
        }
      }

      const selected = [...rawById.values()].slice(0, ctx.limit);
      ctx.log(`kept ${selected.length} hackathons (statuses: ${statuses.join(", ")})`);

      // 2. Normalize, enriching cover/description + geocoding as needed.
      const events: NormalizedEvent[] = [];
      for (let i = 0; i < selected.length; i++) {
        const h = selected[i]!;
        const location = h.displayed_location?.location ?? "";
        const online = isOnline(location);
        const dates = h.submission_period_dates
          ? parseDateRange(h.submission_period_dates)
          : null;

        let latitude: number | null = null;
        let longitude: number | null = null;
        if (!online && location) {
          const coords = await geocode(location);
          if (coords) {
            latitude = coords.lat;
            longitude = coords.lng;
          }
          await sleep(randomBetween(1000, 1500)); // be gentle with Nominatim
        }

        let coverUrl = absoluteUrl(h.thumbnail_url);
        let description = "";
        if (ctx.includeDescriptions) {
          ctx.log(`enriching ${i + 1}/${selected.length}: ${h.title.slice(0, 50)}`);
          const meta = await fetchMeta(h.url);
          if (meta.coverUrl) coverUrl = meta.coverUrl;
          if (meta.description) description = meta.description;
          if (i < selected.length - 1) await sleep(randomBetween(800, 1500));
        }

        const themeTags = (h.themes ?? []).map((t) => t.name);

        events.push({
          title: h.title,
          description,
          city: online ? "Online" : location,
          latitude,
          longitude,
          startTime: dates?.startTime ?? "",
          endTime: dates?.endTime ?? "",
          link: h.url,
          cashPrize: parsePrize(h.prize_amount),
          tags: ["devpost", online ? "online" : "in-person", ...themeTags],
          participantsCount: Number(h.registrations_count ?? 0),
          coverUrl,
        });
      }

      return events;
    },
  };
}
