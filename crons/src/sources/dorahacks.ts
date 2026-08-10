// DoraHacks (dorahacks.io) source.
//
// DoraHacks exposes a clean public JSON API for its hackathon hub:
//   /api/v1/hub/hackathons?page=&page_size=   -> paginated list (all fields we need)
//   /api/v1/hub/hackathons/<uname>            -> full detail incl. markdown description
//
// The list is weight-sorted (it mixes finished and upcoming events), so we
// paginate and keep the events that haven't ended yet. The API sits behind AWS
// WAF, which serves a challenge page to non-browser User-Agents — so we send a
// browser UA for DoraHacks requests only (the shared scraper UA gets a 405).

import { geocode } from "../lib/geocode.js";
import { randomBetween, sleep } from "../lib/http.js";
import type { NormalizedEvent, Source, SourceContext } from "../types.js";

const API_BASE = "https://dorahacks.io/api/v1/hub/hackathons";
const SITE_BASE = "https://dorahacks.io/hackathon";
const PAGE_SIZE = 50;
const MAX_PAGES = 20;

// DoraHacks' AWS WAF blocks the shared "HackathonAtlasScraper/1.0" UA, so we
// present as a regular desktop browser for this source only.
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Shape of a hackathon entry in the DoraHacks list/detail payloads. */
type DoraHackathon = {
  id: number;
  uname: string | null; // some events have no slug; fall back to the id
  title: string;
  image_url: string | null;
  ecosystem: string | null; // comma-separated
  tags: string | null; // comma-separated
  owner?: { name?: string } | null;
  timeline_start: number; // unix seconds
  timeline_end: number; // unix seconds
  venue_form: string; // "Virtual" | "IRL"
  venue_name: string | null;
  venue_address: string | null;
  bonus_price: number | null;
  bonus_token: string | null; // e.g. "USD"
  hackers_count: number | null;
  winner_announced: boolean;
  description?: string | null; // markdown, detail endpoint only
};

type DoraListResponse = {
  count?: number;
  next?: string | null;
  results?: DoraHackathon[];
};

/** Fetch JSON from DoraHacks with a browser UA. Returns null on a non-OK response. */
async function fetchDora<T>(url: string): Promise<T | null> {
  const resp = await fetch(url, { headers: { "User-Agent": BROWSER_UA } });
  if (!resp.ok) return null;
  return (await resp.json()) as T;
}

/** Best-effort markdown -> plain text so descriptions read cleanly. */
function stripMarkdown(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links -> text
    .replace(/^#{1,6}\s+/gm, "") // headings
    .replace(/(\*\*|__|\*|_|`)/g, "") // emphasis / inline code
    .replace(/^\s*>\s?/gm, "") // block quotes
    .replace(/^\s*[-*+]\s+/gm, "") // list bullets
    .replace(/\n{3,}/g, "\n\n") // collapse blank runs
    .trim();
}

function splitCsv(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function toIso(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString();
}

/** Public slug for an event: its uname, or the numeric id when it has none. */
function slugOf(h: DoraHackathon): string {
  return h.uname ?? String(h.id);
}

export async function createDoraHacksSource(): Promise<Source> {
  return {
    name: "dorahacks",
    async fetchEvents(ctx: SourceContext): Promise<NormalizedEvent[]> {
      const nowSeconds = Date.now() / 1000;
      const query = ctx.query?.toLowerCase();
      const selected: DoraHackathon[] = [];

      // Paginate the weight-sorted list, keeping upcoming / ongoing hackathons.
      for (let page = 1; page <= MAX_PAGES && selected.length < ctx.limit; page++) {
        const url = `${API_BASE}?page=${page}&page_size=${PAGE_SIZE}`;
        ctx.log(`fetching page ${page}`);
        const data = await fetchDora<DoraListResponse>(url);
        if (!data) throw new Error(`[dorahacks] list page ${page} request failed`);

        const results = data.results ?? [];
        if (!results.length) break;

        for (const h of results) {
          if (h.winner_announced) continue; // already judged
          if (h.timeline_end && h.timeline_end < nowSeconds) continue; // ended
          const start = new Date(h.timeline_start * 1000);
          if (ctx.after && start < ctx.after) continue;
          if (ctx.before && start > ctx.before) continue;
          if (query && !h.title.toLowerCase().includes(query)) continue;
          selected.push(h);
          if (selected.length >= ctx.limit) break;
        }

        if (!data.next) break;
        await sleep(ctx.delay * 1000 + randomBetween(300, 800));
      }

      ctx.log(`kept ${selected.length} upcoming/ongoing hackathons`);
      const events: NormalizedEvent[] = [];

      for (let i = 0; i < selected.length; i++) {
        const h = selected[i]!;
        const online = h.venue_form !== "IRL";
        const cityName = online ? "Online" : h.venue_name || "In person";

        let latitude: number | null = null;
        let longitude: number | null = null;
        if (!online) {
          // The address usually carries a clean "street, city, region, country"
          // that Nominatim resolves; the venue name alone rarely does.
          const q = h.venue_address || h.venue_name || "";
          if (q) {
            const coords = await geocode(q);
            if (coords) {
              latitude = coords.lat;
              longitude = coords.lng;
            }
            await sleep(randomBetween(1000, 1500)); // be gentle with Nominatim
          }
        }

        const slug = slugOf(h);
        let description = "";
        if (ctx.includeDescriptions) {
          ctx.log(`enriching ${i + 1}/${selected.length}: ${h.title.slice(0, 50)}`);
          const detail = await fetchDora<DoraHackathon>(`${API_BASE}/${slug}`);
          if (detail?.description) description = stripMarkdown(detail.description);
          if (i < selected.length - 1) await sleep(randomBetween(600, 1200));
        }

        const prize =
          h.bonus_token === "USD" && typeof h.bonus_price === "number"
            ? h.bonus_price
            : -1;

        const tags = [
          ...splitCsv(h.tags),
          ...splitCsv(h.ecosystem),
          "dorahacks",
          online ? "online" : "in-person",
        ];

        events.push({
          title: h.title,
          description,
          city: cityName,
          latitude,
          longitude,
          startTime: toIso(h.timeline_start),
          endTime: toIso(h.timeline_end),
          link: `${SITE_BASE}/${slug}`,
          cashPrize: prize,
          tags,
          participantsCount: Number(h.hackers_count ?? 0),
          coverUrl: h.image_url ?? "",
        });
      }

      return events;
    },
  };
}
