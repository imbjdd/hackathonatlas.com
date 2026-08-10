// Source registry.
//
// To add a new data source (Devpost, MLH, ...):
//   1. Create `src/sources/<name>.ts` exporting a factory that returns a Source.
//   2. Register it below, keyed by its name.
// The runner will pick it up automatically. Select which sources run at a
// given time with the SOURCES env var (comma-separated); empty = all of them.

import type { Source } from "../types.js";
import { createEthGlobalSource } from "./ethglobal.js";
import { createLumaSource } from "./luma.js";

/** A factory builds a source, possibly doing async setup (e.g. geocoding). */
export type SourceFactory = () => Promise<Source>;

export const SOURCE_REGISTRY: Record<string, SourceFactory> = {
  luma: createLumaSource,
  ethglobal: createEthGlobalSource,
  // devpost: createDevpostSource,
  // mlh: createMlhSource,
};

/** Instantiate the sources selected by config (empty selection = all). */
export async function loadSources(selected: string[]): Promise<Source[]> {
  const names = selected.length ? selected : Object.keys(SOURCE_REGISTRY);
  const sources: Source[] = [];

  for (const name of names) {
    const factory = SOURCE_REGISTRY[name];
    if (!factory) {
      console.error(`[!] Unknown source '${name}', skipping.`);
      continue;
    }
    sources.push(await factory());
  }

  return sources;
}
