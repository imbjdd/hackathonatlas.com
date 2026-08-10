// ETHGlobal (ethglobal.com) source.
//
// ETHGlobal is a Next.js App Router site. The full events list is embedded in
// the RSC "flight" payload of the /events page as a single `events` array — so
// one request yields every event (name, slug, type, medium, dates, city). We
// keep the hackathons, then fetch each event page once for a stable cover image
// and description (the list payload only carries expiring presigned URLs).

import { geocode } from "../lib/geocode.js";
import { randomBetween, sleep, USER_AGENT } from "../lib/http.js";
import type { NormalizedEvent, Source, SourceContext } from "../types.js";

const EVENTS_URL = "https://ethglobal.com/events";
const EVENT_BASE = "https://ethglobal.com/events";

/** Statuses to keep. Override with ETHGLOBAL_STATUSES (comma-separated). */
const DEFAULT_STATUSES = ["future"];

/** Shape of an event entry inside the ETHGlobal RSC payload (subset we use). */
type EthEvent = {
  name: string;
  slug: string;
  type: string; // "hackathon" | "summit" | "meetup" | ...
  medium: string; // "physical" | "virtual"
  status: string; // "future" | "finished" | "cancelled"
  startTime: string;
  endTime: string;
  tagline: string | null;
  banner?: { fullUrl?: string } | null;
  city?: { name?: string; country?: { name?: string } | null } | null;
};

/**
 * Pull the `events` array out of the ETHGlobal RSC flight payload.
 *
 * The payload is embedded inside a `self.__next_f.push([n,"<huge string>"])`
 * call, so every quote in the JSON appears escaped as `\"` in the HTML. We
 * locate `\"events\":[`, bracket-match the array in the *escaped* text (a `\"`
 * pair toggles string context), then reverse one level of escaping with
 * JSON.parse before parsing the array itself.
 */
function extractEvents(html: string): EthEvent[] {
  const key = '\\"events\\":['; // literal backslash-quote as it appears in HTML
  const start = html.indexOf(key);
  if (start < 0) return [];

  let depth = 0;
  let inStr = false;
  let esc = false;
  let end = -1;
  for (let i = start + key.length - 1; i < html.length; i++) {
    const c = html[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (c === "\\") {
      if (html[i + 1] === '"') {
        inStr = !inStr; // \" toggles JSON string context
        i++;
        continue;
      }
      esc = true; // some other escape (\\, \n, \uXXXX): skip next char
      continue;
    }
    if (inStr) continue;
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return [];

  try {
    const escaped = html.slice(start + key.length - 1, end + 1);
    const json = JSON.parse(`"${escaped}"`) as string; // reverse one escape level
    return JSON.parse(json) as EthEvent[];
  } catch {
    return [];
  }
}

/** Fetch an event page and pull the stable og:image / og:description. */
async function fetchMeta(
  slug: string,
): Promise<{ coverUrl: string; description: string }> {
  try {
    // ETHGlobal event pages currently return HTTP 500 for logged-out clients,
    // but the <head> (og:* meta) still renders — so we parse the body
    // regardless of status instead of bailing on a non-2xx response.
    const resp = await fetch(`${EVENT_BASE}/${slug}`, {
      headers: { "User-Agent": USER_AGENT },
    });
    const html = await resp.text();
    const og = (prop: string) =>
      html.match(
        new RegExp(`<meta property="og:${prop}" content="([^"]*)"`, "i"),
      )?.[1] ?? "";
    return { coverUrl: og("image"), description: og("description") };
  } catch {
    return { coverUrl: "", description: "" };
  }
}

function resolveStatuses(): string[] {
  const raw = process.env.ETHGLOBAL_STATUSES;
  if (!raw) return DEFAULT_STATUSES;
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export async function createEthGlobalSource(): Promise<Source> {
  const statuses = new Set(resolveStatuses());

  return {
    name: "ethglobal",
    async fetchEvents(ctx: SourceContext): Promise<NormalizedEvent[]> {
      ctx.log(`fetching ${EVENTS_URL}`);
      const resp = await fetch(EVENTS_URL, {
        headers: { "User-Agent": USER_AGENT },
      });
      if (!resp.ok) throw new Error(`[ethglobal] events page ${resp.status}`);

      const all = extractEvents(await resp.text());
      ctx.log(`parsed ${all.length} events from RSC payload`);

      const query = ctx.query?.toLowerCase();
      const hackathons = all.filter((e) => {
        if (e.type !== "hackathon") return false;
        if (!statuses.has(e.status)) return false;
        const start = new Date(e.startTime);
        if (ctx.after && start < ctx.after) return false;
        if (ctx.before && start > ctx.before) return false;
        if (query && !e.name.toLowerCase().includes(query)) return false;
        return true;
      });

      ctx.log(`kept ${hackathons.length} hackathons (statuses: ${[...statuses].join(", ")})`);
      const selected = hackathons.slice(0, ctx.limit);
      const events: NormalizedEvent[] = [];

      for (let i = 0; i < selected.length; i++) {
        const e = selected[i]!;
        const online = e.medium !== "physical" || !e.city?.name;
        const cityName = e.city?.name ?? "";
        const countryName = e.city?.country?.name ?? "";

        let latitude: number | null = null;
        let longitude: number | null = null;
        if (!online && cityName) {
          const q = countryName ? `${cityName}, ${countryName}` : cityName;
          const coords = await geocode(q);
          if (coords) {
            latitude = coords.lat;
            longitude = coords.lng;
          }
          await sleep(randomBetween(1000, 1500)); // be gentle with Nominatim
        }

        let coverUrl = e.banner?.fullUrl ?? "";
        let description = e.tagline ?? "";
        if (ctx.includeDescriptions) {
          ctx.log(`enriching ${i + 1}/${selected.length}: ${e.name.slice(0, 50)}`);
          const meta = await fetchMeta(e.slug);
          if (meta.coverUrl) coverUrl = meta.coverUrl;
          if (meta.description) description = meta.description;
          if (i < selected.length - 1) await sleep(randomBetween(800, 1500));
        }

        events.push({
          title: e.name,
          description,
          city: online ? "Online" : cityName,
          latitude,
          longitude,
          startTime: e.startTime,
          endTime: e.endTime,
          link: `${EVENT_BASE}/${e.slug}`,
          cashPrize: -1, // total prize pool isn't reliably in the payload
          tags: ["ethglobal", "web3", online ? "online" : "in-person"],
          participantsCount: 0,
          coverUrl,
        });
      }

      return events;
    },
  };
}
