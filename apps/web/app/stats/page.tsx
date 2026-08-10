import { sql } from "drizzle-orm";
import { db } from "../../src/db";
import { events } from "../../src/db/schema";
import { TopNav } from "../top-nav";
import { SiteFooter } from "../site-footer";
import { sourceInfoForHost } from "../../src/lib/sources";

export const dynamic = "force-dynamic";

type SourceRow = { label: string; host: string; logo: string | null; total: number; upcoming: number };

// Same emblem palette as the hackathon directory, so a source's monogram feels
// native to the rest of the site.
const EMBLEM_COLORS = [
  "#0A0A0A", "#10A37F", "#D97757", "#5B6EF5", "#3ECF8E", "#9945FF",
  "#FF7000", "#E11D48", "#7C3AED", "#1C3C3C", "#F55036", "#20808D",
];

function colorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return EMBLEM_COLORS[hash % EMBLEM_COLORS.length]!;
}

function monogram(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

export default async function StatsPage() {
  // Group events by the host of their link — the source is implied by the host
  // (see src/lib/sources.ts). Aggregating in SQL keeps this cheap regardless of
  // how many events (or sources) the directory grows to.
  const rows = await db
    .select({
      host: sql<string | null>`substring(${events.link} from '://([^/]+)')`,
      total: sql<number>`count(*)::int`,
      upcoming: sql<number>`count(*) filter (where ${events.endTime} is null or ${events.endTime} >= now())::int`,
    })
    .from(events)
    .groupBy(sql`substring(${events.link} from '://([^/]+)')`);

  // Collapse hosts into named sources (multiple hosts can map to one source).
  const bySource = new Map<string, SourceRow>();
  for (const r of rows) {
    const { label, domain, logo } = sourceInfoForHost(r.host);
    const existing = bySource.get(label);
    if (existing) {
      existing.total += r.total;
      existing.upcoming += r.upcoming;
    } else {
      bySource.set(label, { label, logo, host: domain, total: r.total, upcoming: r.upcoming });
    }
  }

  const sources = [...bySource.values()].sort((a, b) => b.total - a.total);
  const grandTotal = sources.reduce((n, s) => n + s.total, 0);
  const grandUpcoming = sources.reduce((n, s) => n + s.upcoming, 0);
  const fmt = (n: number) => n.toLocaleString("en-US");
  const pct = (n: number) => (grandTotal ? Math.round((n / grandTotal) * 100) : 0);

  return (
    <div
      className="flex min-h-screen flex-col items-center bg-white"
      style={{ fontFamily: "var(--font-geist), system-ui, sans-serif" }}
    >
      <TopNav />

      <div className="flex w-full max-w-[1320px] flex-col border-x border-[#EAEAEA]">
        {/* Hero */}
        <section className="relative flex flex-col gap-[22px] px-16 py-[76px] max-[720px]:px-8">
          <span className="inline-flex items-center gap-[7px] self-start rounded-full border border-[#E4E4E7] py-[5px] pl-2.5 pr-3">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#52525B" strokeWidth="2" aria-hidden="true">
              <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" strokeWidth="1.8" />
            </svg>
            <span className="text-[13px] font-medium text-[#3F3F46]">Coverage stats</span>
          </span>

          <h1 className="max-w-[820px] text-[64px] font-bold leading-[62px] tracking-[-0.035em] text-[#0A0A0A] max-[720px]:text-[44px] max-[720px]:leading-[44px]">
            Where the data comes from.
          </h1>

          <p className="max-w-[620px] text-[19px] leading-[28px] text-[#71717A]">
            {fmt(grandTotal)} hackathons aggregated across {fmt(sources.length)}{" "}
            {sources.length === 1 ? "source" : "sources"}. Add a scraper and it shows up here
            automatically.
          </p>

          <div className="mt-1.5 flex flex-wrap items-center gap-7">
            <span className="flex items-center gap-2">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="2" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="3" />
              </svg>
              <span className="text-[15px] font-semibold text-[#18181B] tabular-nums">{fmt(grandTotal)}</span>
              <span className="text-[15px] text-[#A1A1AA]">hackathons</span>
            </span>
            <span className="flex items-center gap-2">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="2" aria-hidden="true">
                <path d="M12 3v18M3 12h18" strokeWidth="1.8" />
              </svg>
              <span className="text-[15px] font-semibold text-[#18181B] tabular-nums">{fmt(sources.length)}</span>
              <span className="text-[15px] text-[#A1A1AA]">sources</span>
            </span>
            <span className="flex items-center gap-2">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              <span className="text-[15px] font-semibold text-[#18181B] tabular-nums">{fmt(grandUpcoming)}</span>
              <span className="text-[15px] text-[#A1A1AA]">upcoming</span>
            </span>
          </div>

          {/* Blueprint frame */}
          <div className="pointer-events-none absolute inset-x-0 top-8 h-px bg-[#EFEFEF]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-8 h-px bg-[#EFEFEF]" />
          {[
            "left-[-6px] top-[26px]",
            "right-[-6px] top-[26px]",
            "bottom-[26px] left-[-6px]",
            "bottom-[26px] right-[-6px]",
          ].map((pos) => (
            <div key={pos} className={`pointer-events-none absolute h-3 w-3 ${pos}`}>
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M6 0V12M0 6H12" stroke="#C9C9CE" />
              </svg>
            </div>
          ))}
        </section>

        {/* Sources — full-bleed rows, same language as the directory list view */}
        <section className="flex flex-col border-t border-[#EAEAEA]">
          {/* Section header row */}
          <div className="sticky top-[71px] z-20 flex items-center justify-between border-b border-[#EAEAEA] bg-white px-16 py-4 max-[720px]:px-8">
            <span className="flex items-center gap-[9px]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#18181B" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
              </svg>
              <span className="text-[15px] font-semibold text-[#0A0A0A]">Events by data source</span>
            </span>
            <span className="text-[13px] text-[#A1A1AA]">Updated live</span>
          </div>

          {/* Column labels */}
          <div className="flex items-center gap-4 border-b border-[#EAEAEA] px-16 py-2.5 max-[720px]:px-8">
            <span className="w-10 shrink-0" />
            <span className="min-w-0 flex-1 text-[11px] font-medium tracking-[0.07em] text-[#A1A1AA]">SOURCE</span>
            <span className="w-[300px] text-[11px] font-medium tracking-[0.07em] text-[#A1A1AA] max-[900px]:hidden">SHARE</span>
            <span className="w-20 text-right text-[11px] font-medium tracking-[0.07em] text-[#A1A1AA] max-[520px]:hidden">UPCOMING</span>
            <span className="w-20 text-right text-[11px] font-medium tracking-[0.07em] text-[#A1A1AA]">EVENTS</span>
          </div>

          {sources.length === 0 ? (
            <p className="px-6 py-16 text-center text-[15px] text-[#A1A1AA]">No events yet.</p>
          ) : (
            sources.map((s) => (
              <div
                key={s.label}
                className="flex items-center gap-4 border-b border-[#EAEAEA] px-16 py-4 transition-colors hover:bg-[#FAFAFA] max-[720px]:px-8"
              >
                {s.logo ? (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[11px] border border-[#EEEEEE] bg-white">
                    <img
                      src={s.logo}
                      alt={`${s.label} logo`}
                      width={40}
                      height={40}
                      className="h-full w-full object-contain"
                    />
                  </span>
                ) : (
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] text-[15px] font-bold tracking-[-0.02em] text-white"
                    style={{ backgroundColor: colorFor(s.label) }}
                  >
                    {monogram(s.label)}
                  </span>
                )}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="line-clamp-1 text-[15px] font-semibold text-[#18181B]">{s.label}</span>
                  <span className="text-[13px] text-[#A1A1AA]">{s.host}</span>
                </span>
                <span className="flex w-[300px] items-center gap-3 max-[900px]:hidden">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#F1F1F1]">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${pct(s.total)}%`, backgroundColor: "var(--foreground)" }}
                    />
                  </span>
                  <span className="w-9 shrink-0 text-right text-[13px] text-[#A1A1AA] tabular-nums">{pct(s.total)}%</span>
                </span>
                <span className="w-20 text-right text-[14px] text-[#71717A] tabular-nums max-[520px]:hidden">{fmt(s.upcoming)}</span>
                <span className="w-20 text-right text-[15px] font-semibold text-[#18181B] tabular-nums">{fmt(s.total)}</span>
              </div>
            ))
          )}

          {/* Total row */}
          {sources.length > 0 && (
            <div className="flex items-center gap-4 bg-[#FAFAFA] px-16 py-4 max-[720px]:px-8">
              <span className="w-10 shrink-0" />
              <span className="min-w-0 flex-1 text-[14px] font-semibold text-[#18181B]">
                Total · {fmt(sources.length)} {sources.length === 1 ? "source" : "sources"}
              </span>
              <span className="w-[300px] max-[900px]:hidden" />
              <span className="w-20 text-right text-[14px] text-[#71717A] tabular-nums max-[520px]:hidden">{fmt(grandUpcoming)}</span>
              <span className="w-20 text-right text-[15px] font-semibold text-[#18181B] tabular-nums">{fmt(grandTotal)}</span>
            </div>
          )}
        </section>

        <SiteFooter />
      </div>
    </div>
  );
}
