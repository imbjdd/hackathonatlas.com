// Data-source attribution.
//
// Events don't carry an explicit "source" column — the source is implied by the
// host of their `link` (a lu.ma URL came from Luma, an ethglobal.com URL from
// ETHGlobal, and so on). Deriving it from the host keeps this fully dynamic:
// the moment a new scraper starts inserting events with a new host, that host
// shows up in the stats without any code change. Known hosts get a friendly
// label; anything else is prettified from the host itself.

// `domain` is the canonical registrable domain a source is displayed and
// aggregated under. `match` intentionally allows subdomains (`(^|\.)`), so e.g.
// every `*.devfolio.co` host collapses into a single `devfolio.co` source.
const KNOWN_SOURCES: { match: RegExp; label: string; domain: string; logo?: string }[] = [
  { match: /(^|\.)lu\.ma$/i, label: "Luma", domain: "lu.ma", logo: "/sources/luma.png" },
  { match: /(^|\.)ethglobal\.com$/i, label: "ETHGlobal", domain: "ethglobal.com", logo: "/sources/ethglobal.png" },
  { match: /(^|\.)devfolio\.co$/i, label: "Devfolio", domain: "devfolio.co", logo: "/sources/devfolio.png" },
  { match: /(^|\.)devpost\.com$/i, label: "Devpost", domain: "devpost.com" },
  { match: /(^|\.)mlh\.io$/i, label: "MLH", domain: "mlh.io" },
];

/** Strip a leading `www.` and lowercase a host. */
function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/^www\./, "");
}

/** Turn a bare host into a readable name, e.g. `dorahacks.io` -> `Dorahacks`. */
function prettifyHost(host: string): string {
  const bare = normalizeHost(host);
  const name = bare.split(".")[0] || bare;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export type SourceInfo = {
  label: string;
  /** Canonical domain the source is displayed and aggregated under. */
  domain: string;
  /** Real brand logo. Known sources ship a local asset; anything else falls
   *  back to the host's favicon so a new scraper still gets a real logo. */
  logo: string | null;
};

/** Human-friendly source name for a host (`lu.ma` -> `Luma`). */
export function sourceLabelForHost(host: string | null): string {
  return sourceInfoForHost(host).label;
}

/** Name + canonical domain + logo for a host. Subdomains of a known source
 *  (e.g. `ethindia.devfolio.co`) collapse onto its canonical domain. */
export function sourceInfoForHost(host: string | null): SourceInfo {
  if (!host) return { label: "Unknown", domain: "—", logo: null };
  const bare = normalizeHost(host);
  const known = KNOWN_SOURCES.find((s) => s.match.test(bare));
  if (known) {
    return { label: known.label, domain: known.domain, logo: known.logo ?? faviconFor(known.domain) };
  }
  return { label: prettifyHost(bare), domain: bare, logo: faviconFor(bare) };
}

/** Dynamic favicon URL for an arbitrary host. */
function faviconFor(host: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
}
