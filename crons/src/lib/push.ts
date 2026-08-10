// Talks to the hackathons API: dedup (`/exists`) and insert (`POST`).

import type { Config } from "../config.js";
import type { NormalizedEvent } from "../types.js";

/** Returns true if an event with this link already exists in the directory. */
export async function eventExists(
  link: string,
  config: Config,
): Promise<boolean> {
  const url = `${config.existsApiUrl}?link=${encodeURIComponent(link)}`;
  try {
    const resp = await fetch(url, { headers: { Accept: "application/json" } });
    if (!resp.ok) return false;
    const data = (await resp.json()) as { exists?: boolean };
    return Boolean(data?.exists);
  } catch {
    return false;
  }
}

export type PushResult = { status: number; body: string };

/** POST a normalized event to the directory. Never throws. */
export async function pushEvent(
  event: NormalizedEvent,
  config: Config,
): Promise<PushResult> {
  const payload = {
    ...event,
    organizerId: config.organizerId,
  };

  try {
    const resp = await fetch(config.pushApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiSecret ? { "x-api-secret": config.apiSecret } : {}),
      },
      body: JSON.stringify(payload),
    });
    return { status: resp.status, body: await resp.text() };
  } catch (error) {
    return { status: 0, body: String(error) };
  }
}
