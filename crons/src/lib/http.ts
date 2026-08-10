// Small HTTP helpers shared across sources.

export const USER_AGENT = "HackathonAtlasScraper/1.0";

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const randomBetween = (min: number, max: number): number =>
  Math.random() * (max - min) + min;

/** Fetch JSON with the shared User-Agent. Returns null on a non-OK response. */
export async function fetchJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T | null> {
  const resp = await fetch(url, {
    ...init,
    headers: {
      "User-Agent": USER_AGENT,
      ...(init?.headers ?? {}),
    },
  });
  if (!resp.ok) return null;
  return (await resp.json()) as T;
}
