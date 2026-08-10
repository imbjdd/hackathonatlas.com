// Geocoding via Nominatim (OpenStreetMap). Shared by sources that only expose
// a free-text location and need coordinates.

import { fetchJson, USER_AGENT } from "./http.js";

const NOMINATIM_API = "https://nominatim.openstreetmap.org/search";

export type Coordinates = { lat: number; lng: number };

/** Resolve a free-text location to coordinates, or null if not found. */
export async function geocode(location: string): Promise<Coordinates | null> {
  const params = new URLSearchParams({ format: "json", q: location, limit: "1" });
  const data = await fetchJson<Array<{ lat: string; lon: string }>>(
    `${NOMINATIM_API}?${params.toString()}`,
    { headers: { "User-Agent": USER_AGENT } },
  );
  if (!data || !data.length) return null;
  return { lat: Number(data[0]!.lat), lng: Number(data[0]!.lon) };
}
