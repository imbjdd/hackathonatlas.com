// Enrich an event from its Luma (lu.ma) page.
//
// Luma renders the authoritative event data into the Next.js `__NEXT_DATA__`
// JSON island. We read `location_type` and `geo_address_info` from it — this is
// far more reliable than guessing the format/city from the title at render time.

export type EventMode = "online" | "in_person" | "hybrid";

export type LumaLocation = {
  mode: EventMode | null;
  city: string | null;
  country: string | null;
  countryCode: string | null;
  latitude: number | null;
  longitude: number | null;
  venue: string | null;
};

const NEXT_DATA_RE =
  /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/;

// Placeholder addresses organizers type when the venue isn't set yet.
function cleanText(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t || /^(tbd|tba|to be (determined|announced))$/i.test(t)) return null;
  return t;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function isLumaUrl(url: string | null | undefined): boolean {
  return !!url && /^https?:\/\/(www\.)?(lu\.ma|luma\.com)\//i.test(url);
}

const ONLINE_RE = /\(online\)|\b(online|virtual|remote)\b/i;
const IN_PERSON_RE = /in[-\s]?person|\birl\b/i;

/** Parse an already-fetched Luma page HTML into a location record. */
export function parseLumaHtml(html: string): LumaLocation | null {
  const json = html.match(NEXT_DATA_RE)?.[1];
  if (!json) return null;

  let event: Record<string, unknown> | undefined;
  try {
    const data = JSON.parse(json);
    event = data?.props?.pageProps?.initialData?.data?.event;
  } catch {
    return null;
  }
  if (!event) return null;

  const geoRaw = event.geo_address_info;
  const geo = (geoRaw ?? {}) as Record<string, unknown>;
  const coord = (event.coordinate ?? {}) as Record<string, unknown>;
  const name = typeof event.name === "string" ? event.name : "";
  const locationType = typeof event.location_type === "string" ? event.location_type : null;

  // Prefer the explicit city; else derive it from "city_state" ("Seoul, South
  // Korea" / "San Francisco, CA") which Luma fills even when city is null.
  let city = cleanText(geo.city);
  if (!city) {
    const cs = cleanText(geo.city_state);
    if (cs) city = cs.split(",")[0]!.trim() || null;
  }
  const latitude = num(coord.latitude);
  const longitude = num(coord.longitude);

  // `location_type` is unreliable (Luma tags many online events "offline"). The
  // trustworthy tell is whether the event has a location OBJECT at all: physical
  // events carry a `geo_address_info` (even an obfuscated or "TBD" placeholder),
  // whereas online ones have it null. Title markers settle hybrids/edge cases.
  const hasLocationObject = geoRaw != null && typeof geoRaw === "object" && Object.keys(geo).length > 0;
  const nameSaysOnline = ONLINE_RE.test(name);
  const nameSaysInPerson = IN_PERSON_RE.test(name);

  let mode: EventMode;
  if (nameSaysOnline && nameSaysInPerson) mode = "hybrid"; // e.g. "(In-Person + Online)"
  else if (locationType === "online") mode = "online";
  else if (hasLocationObject || city) mode = "in_person";
  else mode = "online"; // no physical location object → virtual

  return {
    mode,
    city,
    country: cleanText(geo.country),
    countryCode: cleanText(geo.country_code)?.toUpperCase() ?? null,
    latitude,
    longitude,
    venue: cleanText(geo.full_address) ?? cleanText(geo.address),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch a Luma URL and extract its location record. Returns null on any failure.
 * Luma sits behind Cloudflare and rate-limits bursts with 429s, so `retries`
 * enables exponential backoff (honouring `Retry-After`) — keep it 0 for
 * latency-sensitive callers like the ingestion route, higher for backfills.
 */
export async function enrichFromLuma(
  url: string,
  { timeoutMs = 15000, retries = 0 }: { timeoutMs?: number; retries?: number } = {},
): Promise<LumaLocation | null> {
  if (!isLumaUrl(url)) return null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { "user-agent": "Mozilla/5.0 (compatible; HackathonAtlas/1.0)" },
        signal: controller.signal,
        redirect: "follow",
      });
      if (res.status === 429 && attempt < retries) {
        const ra = Number(res.headers.get("retry-after"));
        const wait = (Number.isFinite(ra) && ra > 0 ? ra * 1000 : Math.min(30000, 2000 * 2 ** attempt));
        clearTimeout(timer);
        await sleep(wait + Math.random() * 750);
        continue;
      }
      if (!res.ok) return null;
      return parseLumaHtml(await res.text());
    } catch {
      if (attempt >= retries) return null;
      await sleep(Math.min(15000, 1500 * 2 ** attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}
