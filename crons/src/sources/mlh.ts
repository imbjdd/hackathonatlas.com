// MLH (mlh.com) source.
//
// MLH is an Inertia.js app: the whole season events list is server-rendered
// into a single `<script data-page="app" type="application/json">` blob, so one
// request to /seasons/<year>/events yields every event (name, dates, location,
// format, cover, and the hackathon's own website). We keep the upcoming events
// and, when descriptions are requested, pull an og:description from each
// hackathon's external site (MLH's payload carries no description of its own).

import { geocode } from "../lib/geocode.js";
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

/** Fetch a hackathon's own site and pull its og:description / description. */
async function fetchDescription(url: string): Promise<string> {
  try {
    const resp = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
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
 * Resolve the season year to scrape.
 *
 * MLH names a season after the year its academic cycle ends, rolling over
 * around August — so August 2026 belongs to the "2027" season. Override with
 * MLH_SEASON.
 */
function resolveSeason(): number {
  const raw = process.env.MLH_SEASON;
  if (raw && Number.isFinite(Number(raw))) return Number(raw);

  const now = new Date();
  return now.getMonth() >= 7 ? now.getFullYear() + 1 : now.getFullYear();
}

function resolveStatuses(): Set<string> {
  const raw = process.env.MLH_STATUSES;
  const list = raw
    ? raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
    : DEFAULT_STATUSES;
  return new Set(list);
}

export async function createMlhSource(): Promise<Source> {
  const season = resolveSeason();
  const statuses = resolveStatuses();
  const eventsUrl = `${MLH_ORIGIN}/seasons/${season}/events`;

  return {
    name: "mlh",
    async fetchEvents(ctx: SourceContext): Promise<NormalizedEvent[]> {
      ctx.log(`fetching ${eventsUrl}`);
      const resp = await fetch(eventsUrl, {
        headers: { "User-Agent": USER_AGENT },
      });
      if (!resp.ok) throw new Error(`[mlh] events page ${resp.status}`);

      const all = extractEvents(await resp.text());
      ctx.log(`parsed ${all.length} events from Inertia payload`);

      const query = ctx.query?.toLowerCase();
      const hackathons = all.filter((e) => {
        if (!statuses.has(e.status)) return false;
        const start = new Date(e.startsAt);
        if (ctx.after && start < ctx.after) return false;
        if (ctx.before && start > ctx.before) return false;
        if (query && !e.name.toLowerCase().includes(query)) return false;
        return true;
      });

      ctx.log(
        `kept ${hackathons.length} hackathons (season ${season}, statuses: ${[...statuses].join(", ")})`,
      );
      const selected = hackathons.slice(0, ctx.limit);
      const events: NormalizedEvent[] = [];

      for (let i = 0; i < selected.length; i++) {
        const e = selected[i]!;
        const online = e.formatType === "digital" || !e.venueAddress?.city;
        const cityName = e.venueAddress?.city ?? "";

        let latitude: number | null = null;
        let longitude: number | null = null;
        if (!online && cityName) {
          const parts = [
            cityName,
            e.venueAddress?.state ?? "",
            e.venueAddress?.country ?? "",
          ].filter(Boolean);
          const coords = await geocode(parts.join(", "));
          if (coords) {
            latitude = coords.lat;
            longitude = coords.lng;
          }
          await sleep(randomBetween(1000, 1500)); // be gentle with Nominatim
        }

        const link = e.websiteUrl || `${MLH_ORIGIN}/events/${e.slug}`;

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
          link,
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
