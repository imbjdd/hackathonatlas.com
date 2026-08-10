// Devfolio (devfolio.co) source.
//
// Devfolio is a Next.js site. The /hackathons page ships its full listing in the
// `__NEXT_DATA__` payload, bucketed into open / upcoming / past arrays — so one
// request yields every listed hackathon (name, slug, dates, online flag,
// participants). Those listing entries are sparse (no city, cover or
// description), so we enrich each kept hackathon once from its microsite
// (`<slug>.devfolio.co`), whose `__NEXT_DATA__` header carries city, cover image
// and description.

import { geocode } from "../lib/geocode.js";
import { randomBetween, sleep, USER_AGENT } from "../lib/http.js";
import type { NormalizedEvent, Source, SourceContext } from "../types.js";

const LISTING_URL = "https://devfolio.co/hackathons";

/** Listing buckets to keep. Override with DEVFOLIO_STATUSES (comma-separated). */
const DEFAULT_STATUSES = ["open", "upcoming"];

/** Maps a status name to its array key in the listing payload. */
const STATUS_KEYS: Record<string, string> = {
  open: "open_hackathons",
  upcoming: "upcoming_hackathons",
  past: "past_hackathons",
  featured: "featured_hackathons",
};

/** Shape of a listing entry inside the /hackathons payload (subset we use). */
type ListEntry = {
  uuid: string;
  slug: string;
  name: string;
  type: string; // "HACKATHON" | ...
  starts_at: string;
  ends_at: string;
  is_online: boolean;
  participants_count?: number;
};

/** Shape of a microsite header hackathon (subset we use). */
type MicrositeHackathon = {
  city?: string | null;
  country?: string | null;
  location?: string | null;
  tagline?: string | null;
  desc?: string | null;
  cover_img?: string | null;
  is_online?: boolean;
};

/** Pull and parse the `__NEXT_DATA__` JSON blob out of a Devfolio HTML page. */
function parseNextData(html: string): any {
  const m = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s,
  );
  if (!m) return null;
  try {
    return JSON.parse(m[1]!);
  } catch {
    return null;
  }
}

/** Find the query whose data holds the hackathon listing buckets. */
function findListingData(nextData: any): Record<string, ListEntry[]> | null {
  const queries = nextData?.props?.pageProps?.dehydratedState?.queries ?? [];
  for (const q of queries) {
    const data = q?.state?.data;
    if (data && typeof data === "object" && Array.isArray(data.open_hackathons)) {
      return data as Record<string, ListEntry[]>;
    }
  }
  return null;
}

/** Fetch a microsite page and pull the enriched hackathon header. */
async function fetchMicrosite(slug: string): Promise<MicrositeHackathon | null> {
  try {
    const resp = await fetch(`https://${slug}.devfolio.co/`, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!resp.ok) return null;
    const nextData = parseNextData(await resp.text());
    const queries = nextData?.props?.pageProps?.dehydratedState?.queries ?? [];
    for (const q of queries) {
      const data = q?.state?.data;
      const list = Array.isArray(data) ? data : [];
      for (const item of list) {
        const hk = item?.hackathons?.[0];
        if (hk) return hk as MicrositeHackathon;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function resolveStatuses(): string[] {
  const raw = process.env.DEVFOLIO_STATUSES;
  if (!raw) return DEFAULT_STATUSES;
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export async function createDevfolioSource(): Promise<Source> {
  const statuses = resolveStatuses();

  return {
    name: "devfolio",
    async fetchEvents(ctx: SourceContext): Promise<NormalizedEvent[]> {
      ctx.log(`fetching ${LISTING_URL}`);
      const resp = await fetch(LISTING_URL, {
        headers: { "User-Agent": USER_AGENT },
      });
      if (!resp.ok) throw new Error(`[devfolio] listing page ${resp.status}`);

      const listing = findListingData(parseNextData(await resp.text()));
      if (!listing) throw new Error("[devfolio] could not parse listing payload");

      // Collect entries from the selected buckets, deduped by slug (a hackathon
      // can appear in more than one bucket, e.g. featured + open).
      const bySlug = new Map<string, ListEntry>();
      for (const status of statuses) {
        const key = STATUS_KEYS[status];
        if (!key) {
          ctx.log(`unknown status '${status}', skipping`);
          continue;
        }
        for (const e of listing[key] ?? []) {
          if (e?.slug && !bySlug.has(e.slug)) bySlug.set(e.slug, e);
        }
      }
      ctx.log(`parsed ${bySlug.size} hackathons (statuses: ${statuses.join(", ")})`);

      const query = ctx.query?.toLowerCase();
      const kept = [...bySlug.values()].filter((e) => {
        if (e.type && e.type !== "HACKATHON") return false;
        const start = new Date(e.starts_at);
        if (ctx.after && start < ctx.after) return false;
        if (ctx.before && start > ctx.before) return false;
        if (query && !e.name.toLowerCase().includes(query)) return false;
        return true;
      });

      ctx.log(`kept ${kept.length} after filtering`);
      const selected = kept.slice(0, ctx.limit);
      const events: NormalizedEvent[] = [];

      for (let i = 0; i < selected.length; i++) {
        const e = selected[i]!;
        ctx.log(`enriching ${i + 1}/${selected.length}: ${e.name.slice(0, 50)}`);
        const meta = await fetchMicrosite(e.slug);

        const online = e.is_online || meta?.is_online || !meta?.city;
        const cityName = meta?.city ?? "";
        const countryName = meta?.country ?? "";

        let latitude: number | null = null;
        let longitude: number | null = null;
        if (!online && cityName) {
          const q =
            meta?.location || (countryName ? `${cityName}, ${countryName}` : cityName);
          const coords = await geocode(q);
          if (coords) {
            latitude = coords.lat;
            longitude = coords.lng;
          }
          await sleep(randomBetween(1000, 1500)); // be gentle with Nominatim
        }

        const description =
          (ctx.includeDescriptions ? meta?.desc : null) ?? meta?.tagline ?? "";

        events.push({
          title: e.name,
          description,
          city: online ? "Online" : cityName,
          latitude,
          longitude,
          startTime: e.starts_at,
          endTime: e.ends_at,
          link: `https://${e.slug}.devfolio.co`,
          cashPrize: -1, // prize amounts aren't exposed in the payload
          tags: ["devfolio", online ? "online" : "in-person"],
          participantsCount: Number(e.participants_count ?? 0),
          coverUrl: meta?.cover_img ?? "",
        });

        if (i < selected.length - 1) await sleep(randomBetween(800, 1500));
      }

      return events;
    },
  };
}
