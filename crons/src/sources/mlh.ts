// MLH (mlh.com) source.
//
// MLH is an Inertia.js app: a whole season's events list is server-rendered
// into a single `<script data-page="app" type="application/json">` blob, so one
// request to /seasons/<year>/events yields every event (name, dates, location,
// format, cover, and the hackathon's own website). We link to each event's own
// MLH page (unique per edition, so recurring hackathons don't collapse across
// seasons) and, when descriptions are requested, pull an og:description from the
// hackathon's external site (MLH's payload carries no description of its own).

import { geocode, type Coordinates } from "../lib/geocode.js";
import { randomBetween, sleep, USER_AGENT } from "../lib/http.js";
import type { NormalizedEvent, Source, SourceContext } from "../types.js";

const MLH_ORIGIN = "https://mlh.com";

/** Statuses to keep. Override with MLH_STATUSES (comma-separated). */
const DEFAULT_STATUSES = ["pending", "in_progress"];

/** Shape of an event entry inside the MLH Inertia payload (subset we use). */
type MlhEvent = {
  slug: string;
  name: string;
  status: string; // "pending" | "in_progress" | "ended"
  startsAt: string;
  endsAt: string;
  url: string; // e.g. "/events/<slug>/prizes"
  location: string; // e.g. "Davis, California" or "Everywhere, Worldwide"
  formatType: string; // "physical" | "hybrid_physical" | "digital"
  backgroundUrl?: string | null;
  websiteUrl?: string | null;
  region?: string | null;
  venueAddress?: {
    city?: string | null;
    state?: string | null;
    country?: string | null;
  } | null;
};

type InertiaPage = {
  props?: {
    upcomingEvents?: MlhEvent[];
    pastEvents?: MlhEvent[];
  };
};

/**
 * Pull the events out of MLH's Inertia `data-page` payload.
 *
 * The blob is a clean JSON document inside a dedicated `<script>` tag, so we
 * just isolate the tag's contents and `JSON.parse` it. Returns the concatenated
 * upcoming + past events (callers filter by status).
 */
function extractEvents(html: string): MlhEvent[] {
  const match = html.match(
    /<script data-page="app" type="application\/json">(.*?)<\/script>/s,
  );
  if (!match) return [];

  try {
    const page = JSON.parse(match[1]!) as InertiaPage;
    return [
      ...(page.props?.upcomingEvents ?? []),
      ...(page.props?.pastEvents ?? []),
    ];
  } catch {
    return [];
  }
}

/** The canonical, unique-per-edition MLH event page (returns HTTP 200). */
function eventLink(e: MlhEvent): string {
  return e.url ? `${MLH_ORIGIN}${e.url}` : `${MLH_ORIGIN}/events/${e.slug}`;
}

/** Fetch a hackathon's own site and pull its og:description / description. */
async function fetchDescription(url: string): Promise<string> {
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(8000), // old event sites may hang
    });
    const html = await resp.text();
    const meta = (attr: string, value: string) =>
      html.match(
        new RegExp(`<meta ${attr}="${value}" content="([^"]*)"`, "i"),
      )?.[1];
    return (
      meta("property", "og:description") ?? meta("name", "description") ?? ""
    );
  } catch {
    return "";
  }
}

/**
 * Resolve the season year(s) to scrape.
 *
 * MLH names a season after the year its academic cycle ends, rolling over
 * around August — so August 2026 belongs to the "2027" season. Override a
 * single season with MLH_SEASON, or scan several (e.g. a historical backfill)
 * with MLH_SEASONS=2021,2022,...
 */
function resolveSeasons(): number[] {
  const multi = process.env.MLH_SEASONS;
  if (multi) {
    const years = multi
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n));
    if (years.length) return years;
  }

  const single = process.env.MLH_SEASON;
  if (single && Number.isFinite(Number(single))) return [Number(single)];

  const now = new Date();
  return [now.getMonth() >= 7 ? now.getFullYear() + 1 : now.getFullYear()];
}

function resolveStatuses(): Set<string> {
  const raw = process.env.MLH_STATUSES;
  const list = raw
    ? raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
    : DEFAULT_STATUSES;
  return new Set(list);
}

export async function createMlhSource(): Promise<Source> {
  const seasons = resolveSeasons();
  const statuses = resolveStatuses();

  return {
    name: "mlh",
    async fetchEvents(ctx: SourceContext): Promise<NormalizedEvent[]> {
      // 1. Fetch every requested season, deduping by canonical link.
      const byLink = new Map<string, MlhEvent>();
      for (const season of seasons) {
        const eventsUrl = `${MLH_ORIGIN}/seasons/${season}/events`;
        ctx.log(`fetching ${eventsUrl}`);
        const resp = await fetch(eventsUrl, {
          headers: { "User-Agent": USER_AGENT },
        });
        if (!resp.ok) {
          ctx.log(`season ${season} returned ${resp.status}, skipping`);
          continue;
        }
        const parsed = extractEvents(await resp.text());
        ctx.log(`season ${season}: parsed ${parsed.length} events`);
        for (const e of parsed) {
          const link = eventLink(e);
          if (!byLink.has(link)) byLink.set(link, e);
        }
      }

      // 2. Filter by status / date / query.
      const query = ctx.query?.toLowerCase();
      const hackathons = [...byLink.values()].filter((e) => {
        if (!statuses.has(e.status)) return false;
        const start = new Date(e.startsAt);
        if (ctx.after && start < ctx.after) return false;
        if (ctx.before && start > ctx.before) return false;
        if (query && !e.name.toLowerCase().includes(query)) return false;
        return true;
      });

      ctx.log(
        `kept ${hackathons.length} hackathons (seasons: ${seasons.join(",")}, statuses: ${[...statuses].join(", ")})`,
      );
      const selected = hackathons.slice(0, ctx.limit);

      // Cache geocoding by location so recurring venues (universities show up
      // every season) only hit Nominatim once, and we only rate-limit on a miss.
      const geoCache = new Map<string, Coordinates | null>();
      const cachedGeocode = async (q: string): Promise<Coordinates | null> => {
        if (geoCache.has(q)) return geoCache.get(q)!;
        const coords = await geocode(q);
        geoCache.set(q, coords);
        await sleep(randomBetween(1000, 1500)); // be gentle with Nominatim
        return coords;
      };

      const events: NormalizedEvent[] = [];
      for (let i = 0; i < selected.length; i++) {
        const e = selected[i]!;
        const online = e.formatType === "digital" || !e.venueAddress?.city;
        const cityName = e.venueAddress?.city ?? "";

        let latitude: number | null = null;
        let longitude: number | null = null;
        if (!online && cityName) {
          const q = [
            cityName,
            e.venueAddress?.state ?? "",
            e.venueAddress?.country ?? "",
          ]
            .filter(Boolean)
            .join(", ");
          const coords = await cachedGeocode(q);
          if (coords) {
            latitude = coords.lat;
            longitude = coords.lng;
          }
        }

        let description = "";
        if (ctx.includeDescriptions && e.websiteUrl) {
          ctx.log(`enriching ${i + 1}/${selected.length}: ${e.name.slice(0, 50)}`);
          description = await fetchDescription(e.websiteUrl);
          if (i < selected.length - 1) await sleep(randomBetween(800, 1500));
        }

        events.push({
          title: e.name.trim(),
          description,
          city: online ? "Online" : cityName,
          latitude,
          longitude,
          startTime: e.startsAt,
          endTime: e.endsAt,
          link: eventLink(e),
          cashPrize: -1, // prize pool isn't in the payload
          tags: ["mlh", "student", online ? "online" : "in-person"],
          participantsCount: 0,
          coverUrl: e.backgroundUrl ?? "",
        });
      }

      return events;
    },
  };
}
