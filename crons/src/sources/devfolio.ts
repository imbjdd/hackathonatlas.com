// Devfolio (devfolio.co) source.
//
// Devfolio's backend is a public Hasura GraphQL API. Its `hackathons` table is
// readable anonymously and carries the rich fields we need (name, dates, city,
// full description, ...) directly — so one paginated query walks the entire
// archive (~2k events, back to 2019) without any per-event page fetches. The
// anonymous role caps each request at 20 rows, so we page with limit/offset,
// ordered by `ends_at` descending (upcoming first, then most-recent past).
//
// The only field the GraphQL API does not expose is the cover image, so we
// optionally fetch it from each hackathon's microsite (`<slug>.devfolio.co`)
// when descriptions/enrichment are requested (INCLUDE_DESCRIPTIONS).

import { geocode, type Coordinates } from "../lib/geocode.js";
import { randomBetween, sleep, USER_AGENT } from "../lib/http.js";
import type { NormalizedEvent, Source, SourceContext } from "../types.js";

const GQL_URL = "https://api.devfolio.co/v1/graphql";
const PAGE_SIZE = 20; // anonymous role hard-caps rows per request at 20
const DEFAULT_MAX_PAGES = 200; // safety bound (~4k events)

/** Fields the anonymous role exposes on the `hackathons` table (subset). */
const GQL_FIELDS = [
  "uuid",
  "slug",
  "name",
  "type",
  "starts_at",
  "ends_at",
  "is_online",
  "city",
  "country",
  "location",
  "tagline",
  "desc",
  "participants_count",
].join(" ");

type GqlHackathon = {
  uuid: string;
  slug: string;
  name: string;
  type: string; // "HACKATHON" | ...
  starts_at: string | null;
  ends_at: string | null;
  is_online: boolean;
  city: string | null;
  country: string | null;
  location: string | null;
  tagline: string | null;
  desc: string | null;
  participants_count: number | null;
};

/** Fetch one page of hackathons ordered by end date (newest first). */
async function fetchPage(offset: number): Promise<GqlHackathon[]> {
  const query = `query Hackathons($limit:Int!,$offset:Int!){ hackathons(limit:$limit, offset:$offset, order_by:{ends_at:desc_nulls_last}){ ${GQL_FIELDS} } }`;
  const resp = await fetch(GQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
    body: JSON.stringify({ query, variables: { limit: PAGE_SIZE, offset } }),
  });
  if (!resp.ok) throw new Error(`[devfolio] graphql ${resp.status}`);
  const json = (await resp.json()) as {
    data?: { hackathons?: GqlHackathon[] };
    errors?: Array<{ message: string }>;
  };
  if (json.errors?.length) {
    throw new Error(`[devfolio] graphql: ${json.errors[0]!.message}`);
  }
  return json.data?.hackathons ?? [];
}

/** Geocoding cache keyed by location string — many events share a city. */
const geocodeCache = new Map<string, Coordinates | null>();

async function geocodeCached(location: string): Promise<Coordinates | null> {
  const key = location.trim().toLowerCase();
  if (geocodeCache.has(key)) return geocodeCache.get(key)!;
  const coords = await geocode(location);
  geocodeCache.set(key, coords);
  await sleep(randomBetween(1100, 1400)); // Nominatim: ~1 req/s, only on misses
  return coords;
}

/** Fetch a microsite page and pull the cover image (og:image / cover_img). */
async function fetchCover(slug: string): Promise<string> {
  try {
    const resp = await fetch(`https://${slug}.devfolio.co/`, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!resp.ok) return "";
    const html = await resp.text();
    return (
      html.match(/<meta property="og:image" content="([^"]*)"/i)?.[1] ?? ""
    );
  } catch {
    return "";
  }
}

export async function createDevfolioSource(): Promise<Source> {
  const maxPages = Math.max(
    1,
    Number(process.env.DEVFOLIO_MAX_PAGES) || DEFAULT_MAX_PAGES,
  );

  return {
    name: "devfolio",
    async fetchEvents(ctx: SourceContext): Promise<NormalizedEvent[]> {
      const query = ctx.query?.toLowerCase();
      const kept: GqlHackathon[] = [];

      // 1. Page through the archive until we have enough or run dry.
      for (let page = 0; page < maxPages && kept.length < ctx.limit; page++) {
        const rows = await fetchPage(page * PAGE_SIZE);
        if (!rows.length) break;

        for (const e of rows) {
          if (e.type && e.type !== "HACKATHON") continue;
          if (!e.starts_at) continue;
          const start = new Date(e.starts_at);
          if (ctx.after && start < ctx.after) continue;
          if (ctx.before && start > ctx.before) continue;
          if (query && !e.name.toLowerCase().includes(query)) continue;
          kept.push(e);
          if (kept.length >= ctx.limit) break;
        }

        ctx.log(`page ${page + 1}: ${kept.length} kept so far`);
        if (kept.length < ctx.limit) await sleep(randomBetween(200, 500));
      }

      ctx.log(`collected ${kept.length} hackathons`);
      const events: NormalizedEvent[] = [];

      // 2. Normalize (geocode physical events; optionally fetch cover images).
      for (let i = 0; i < kept.length; i++) {
        const e = kept[i]!;
        const online = e.is_online || !e.city;
        const cityName = e.city ?? "";
        const countryName = e.country ?? "";

        let latitude: number | null = null;
        let longitude: number | null = null;
        if (!online && cityName) {
          const q =
            e.location || (countryName ? `${cityName}, ${countryName}` : cityName);
          const coords = await geocodeCached(q);
          if (coords) {
            latitude = coords.lat;
            longitude = coords.lng;
          }
        }

        let coverUrl = "";
        if (ctx.includeDescriptions) {
          ctx.log(`enriching ${i + 1}/${kept.length}: ${e.name.slice(0, 50)}`);
          coverUrl = await fetchCover(e.slug);
          if (i < kept.length - 1) await sleep(randomBetween(600, 1200));
        }

        events.push({
          title: e.name,
          description: e.desc || e.tagline || "",
          city: online ? "Online" : cityName,
          latitude,
          longitude,
          startTime: e.starts_at ?? "",
          endTime: e.ends_at ?? "",
          link: `https://${e.slug}.devfolio.co`,
          cashPrize: -1, // prize amounts aren't exposed in the payload
          tags: ["devfolio", online ? "online" : "in-person"],
          participantsCount: Number(e.participants_count ?? 0),
          coverUrl,
        });
      }

      return events;
    },
  };
}
