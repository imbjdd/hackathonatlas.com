// Luma (lu.ma) source.
//
// Uses Luma's public discovery API, filtered by geolocation. Each candidate
// event is normalized into `NormalizedEvent`. Descriptions are fetched lazily
// from the per-event `api.lu.ma/url` endpoint (ProseMirror "mirror" format).

import { geocode } from "../lib/geocode.js";
import { fetchJson, randomBetween, sleep, USER_AGENT } from "../lib/http.js";
import type { NormalizedEvent, Source, SourceContext } from "../types.js";

const LUMA_API = "https://api.lu.ma/discover/get-paginated-events";
const MAX_PAGES = 20;

type LumaResponse = {
  entries?: Array<Record<string, any>>;
  has_more?: boolean;
  next_cursor?: string;
};

/** A geographic region to scan. Add entries to widen coverage. */
type Region = { label: string; lat: number; lng: number };

function eventStartDate(entry: Record<string, any>): Date | null {
  const start = entry?.event?.start_at;
  if (!start) return null;
  const d = new Date(start);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function fetchEventsPage(args: {
  lat: number;
  lng: number;
  query?: string;
  cursor?: string;
}): Promise<LumaResponse> {
  const params = new URLSearchParams({
    geo_latitude: String(args.lat),
    geo_longitude: String(args.lng),
    pagination_limit: "50",
  });
  if (args.cursor) params.set("pagination_cursor", args.cursor);
  if (args.query) params.set("query", args.query);

  const data = await fetchJson<LumaResponse>(
    `${LUMA_API}?${params.toString()}`,
    { headers: { "User-Agent": USER_AGENT } },
  );
  return data ?? {};
}

async function scrapeRegion(
  region: Region,
  ctx: SourceContext,
): Promise<Array<Record<string, any>>> {
  const collected: Array<Record<string, any>> = [];
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES && collected.length < ctx.limit; page++) {
    const data = await fetchEventsPage({
      lat: region.lat,
      lng: region.lng,
      query: ctx.query,
      cursor,
    });

    const entries = data.entries ?? [];
    if (!entries.length) break;

    for (const entry of entries) {
      const dt = eventStartDate(entry);
      if (ctx.after && dt && dt < ctx.after) continue;
      if (ctx.before && dt && dt > ctx.before) continue;
      collected.push(entry);
      if (collected.length >= ctx.limit) break;
    }

    if (collected.length >= ctx.limit || !data.has_more) break;

    cursor = data.next_cursor || entries[entries.length - 1]?.api_id;
    if (!cursor) break;

    const jitter = ctx.delay + randomBetween(0.5, 1.5);
    ctx.log(`[${region.label}] waiting ${jitter.toFixed(1)}s before next page`);
    await sleep(jitter * 1000);
  }

  return collected.slice(0, ctx.limit);
}

function extractTextFromMirror(node: any): string {
  if (Array.isArray(node)) {
    return node.map((n) => extractTextFromMirror(n)).join("");
  }
  if (node && typeof node === "object") {
    if (node.type === "hard_break") return "\n";
    let text = String(node.text ?? "");
    if (node.content) text = extractTextFromMirror(node.content);
    if (node.type === "paragraph") text += "\n";
    return text;
  }
  return "";
}

async function fetchDescription(slug: string): Promise<string> {
  const url = `https://api.lu.ma/url?url=${encodeURIComponent(slug)}`;
  const data = await fetchJson<{ data?: { description_mirror?: unknown } }>(url, {
    headers: { "User-Agent": USER_AGENT },
  });
  const mirror = data?.data?.description_mirror;
  return mirror ? extractTextFromMirror(mirror) : "";
}

function normalize(entry: Record<string, any>): NormalizedEvent {
  const ev = entry?.event ?? {};
  const geo = ev?.geo_address_info ?? {};

  return {
    title: String(ev?.name ?? ""),
    description: "",
    city: String(geo?.city ?? ""),
    latitude: ev?.coordinate?.latitude ?? null,
    longitude: ev?.coordinate?.longitude ?? null,
    startTime: String(ev?.start_at ?? ""),
    endTime: String(ev?.end_at ?? ""),
    link: `https://lu.ma/${String(ev?.url ?? "")}`,
    cashPrize: -1,
    tags: [],
    participantsCount: Number(entry?.guest_count ?? 0),
    coverUrl: String(ev?.cover_url ?? ""),
  };
}

/**
 * Build the Luma source.
 *
 * Regions default to the location resolved from `LOCATION` or `LAT`/`LNG`.
 * To scan several cities, pass them here or extend this list.
 */
export async function createLumaSource(): Promise<Source> {
  const regions = await resolveRegions();

  return {
    name: "luma",
    async fetchEvents(ctx: SourceContext): Promise<NormalizedEvent[]> {
      const rawByLink = new Map<string, Record<string, any>>();

      for (const region of regions) {
        ctx.log(`scanning region '${region.label}' (${region.lat}, ${region.lng})`);
        const raw = await scrapeRegion(region, ctx);
        for (const entry of raw) {
          const link = `https://lu.ma/${String(entry?.event?.url ?? "")}`;
          if (!rawByLink.has(link)) rawByLink.set(link, entry);
        }
      }

      const entries = [...rawByLink.values()].slice(0, ctx.limit);
      const events: NormalizedEvent[] = [];

      for (let i = 0; i < entries.length; i++) {
        const event = normalize(entries[i]!);
        const slug = String(entries[i]?.event?.url ?? "");

        if (ctx.includeDescriptions && slug) {
          ctx.log(`description ${i + 1}/${entries.length}: ${event.title.slice(0, 50)}`);
          event.description = await fetchDescription(slug);
          if (i < entries.length - 1) await sleep(randomBetween(1000, 2000));
        }

        events.push(event);
      }

      return events;
    },
  };
}

/** Resolve the regions to scan from the environment. */
async function resolveRegions(): Promise<Region[]> {
  const latEnv = process.env.LAT ? Number(process.env.LAT) : NaN;
  const lngEnv = process.env.LNG ? Number(process.env.LNG) : NaN;

  if (Number.isFinite(latEnv) && Number.isFinite(lngEnv)) {
    return [{ label: process.env.LOCATION ?? "custom", lat: latEnv, lng: lngEnv }];
  }

  const location = process.env.LOCATION;
  if (!location) {
    throw new Error("[luma] Set LOCATION or both LAT and LNG.");
  }

  const coords = await geocode(location);
  if (!coords) throw new Error(`[luma] Could not geocode '${location}'.`);
  return [{ label: location, lat: coords.lat, lng: coords.lng }];
}
