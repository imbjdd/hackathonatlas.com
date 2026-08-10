// Geocoding for sources that only expose a free-text location.
//
// Two providers, both OpenStreetMap-based and keyless:
//   - nominatim (default): OSM's own server. Strict — max ~1 req/s, bulk use
//     is against its usage policy. Fine for the small per-run cron.
//   - photon (komoot): tolerates higher throughput and resolves venue names
//     better; use it for large backfills. Select with GEOCODER=photon.

import { fetchJson, USER_AGENT } from "./http.js";

const NOMINATIM_API = "https://nominatim.openstreetmap.org/search";
const PHOTON_API = "https://photon.komoot.io/api/";

export type Coordinates = { lat: number; lng: number };

/** Which geocoding provider to use (GEOCODER env, default nominatim). */
function provider(): "nominatim" | "photon" {
  return process.env.GEOCODER?.trim().toLowerCase() === "photon"
    ? "photon"
    : "nominatim";
}

async function geocodeNominatim(location: string): Promise<Coordinates | null> {
  const params = new URLSearchParams({ format: "json", q: location, limit: "1" });
  const data = await fetchJson<Array<{ lat: string; lon: string }>>(
    `${NOMINATIM_API}?${params.toString()}`,
    { headers: { "User-Agent": USER_AGENT } },
  );
  if (!data || !data.length) return null;
  return { lat: Number(data[0]!.lat), lng: Number(data[0]!.lon) };
}

type PhotonResponse = {
  features?: Array<{ geometry?: { coordinates?: [number, number] } }>;
};

async function geocodePhoton(location: string): Promise<Coordinates | null> {
  const params = new URLSearchParams({ q: location, limit: "1" });
  const data = await fetchJson<PhotonResponse>(
    `${PHOTON_API}?${params.toString()}`,
    { headers: { "User-Agent": USER_AGENT } },
  );
  // Photon returns GeoJSON: coordinates are [longitude, latitude].
  const coords = data?.features?.[0]?.geometry?.coordinates;
  if (!coords || coords.length < 2) return null;
  return { lat: Number(coords[1]), lng: Number(coords[0]) };
}

/** Resolve a free-text location to coordinates, or null if not found. */
export async function geocode(location: string): Promise<Coordinates | null> {
  return provider() === "photon"
    ? geocodePhoton(location)
    : geocodeNominatim(location);
}
