import { and, asc, gte, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../src/db";
import { events } from "../src/db/schema";
import { TopNav } from "./top-nav";
import { HackathonDirectory, type DirectoryEvent } from "./hackathon-directory";
import { SiteFooter } from "./site-footer";
import { thumbKeyForCover } from "../src/lib/thumb-key";

export const dynamic = "force-dynamic";

const GRID_LIMIT = 500;

function getCoverSrc(coverUrl: string | null): string | null {
  if (!coverUrl) return null;
  if (coverUrl.startsWith("http")) return coverUrl;
  // Serve the small pre-generated thumbnail; the images route falls back to
  // the original cover if a thumbnail doesn't exist yet.
  return `/api/images?key=${encodeURIComponent(thumbKeyForCover(coverUrl))}`;
}

export default async function Home() {
  const now = new Date();
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const upcoming = or(isNull(events.endTime), gte(events.endTime, now));

  const [rows, totals, allTotals, cityTotals, weekTotals] = await Promise.all([
    db
      .select({
        id: events.id,
        title: events.title,
        city: events.city,
        country: events.country,
        mode: events.mode,
        startTime: events.startTime,
        endTime: events.endTime,
        link: events.link,
        cashPrize: events.cashPrize,
        tags: events.tags,
        coverUrl: events.coverUrl,
        createdAt: events.createdAt,
      })
      .from(events)
      .where(upcoming)
      .orderBy(asc(events.startTime))
      .limit(GRID_LIMIT),
    db.select({ count: sql<number>`count(*)::int` }).from(events).where(upcoming),
    db.select({ count: sql<number>`count(*)::int` }).from(events),
    db
      .select({ count: sql<number>`count(distinct ${events.city})::int` })
      .from(events)
      .where(upcoming),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(events)
      .where(and(upcoming, gte(events.startTime, now), lte(events.startTime, weekEnd))),
  ]);

  const directoryEvents: DirectoryEvent[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    city: r.city,
    country: r.country,
    mode: r.mode,
    startTime: r.startTime.toISOString(),
    endTime: r.endTime ? r.endTime.toISOString() : null,
    link: r.link,
    cashPrize: r.cashPrize,
    tags: r.tags,
    cover: getCoverSrc(r.coverUrl),
    createdAt: r.createdAt ? r.createdAt.toISOString() : null,
  }));

  const totalEvents = totals[0]?.count ?? 0;
  const totalAll = allTotals[0]?.count ?? 0;
  const totalCities = cityTotals[0]?.count ?? 0;
  const thisWeek = weekTotals[0]?.count ?? 0;
  const fmt = (n: number) => n.toLocaleString("en-US");

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
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18M12 3c2.5 2.5 3.5 6 3.5 9s-1 6.5-3.5 9M12 3c-2.5 2.5-3.5 6-3.5 9s1 6.5 3.5 9" strokeWidth="1.6" />
            </svg>
            <span className="text-[13px] font-medium text-[#3F3F46]">Hackathon directory</span>
          </span>

          <h1 className="max-w-[820px] text-[64px] font-bold leading-[62px] tracking-[-0.035em] text-[#0A0A0A] max-[720px]:text-[44px] max-[720px]:leading-[44px]">
            Every hackathon, ready to join.
          </h1>

          <p className="max-w-[620px] text-[19px] leading-[28px] text-[#71717A]">
            {fmt(totalEvents)} upcoming hackathons for builders worldwide — search, filter by city,
            then apply in one click.
          </p>

          <div className="mt-1.5 flex flex-wrap items-center gap-7">
            <span className="flex items-center gap-2">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="2" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="3" />
              </svg>
              <span className="text-[15px] font-semibold text-[#18181B] tabular-nums">{fmt(totalAll)}</span>
              <span className="text-[15px] text-[#A1A1AA]">hackathons</span>
            </span>
            <span className="flex items-center gap-2">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="2" aria-hidden="true">
                <path d="M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>
              <span className="text-[15px] font-semibold text-[#18181B] tabular-nums">{fmt(totalCities)}</span>
              <span className="text-[15px] text-[#A1A1AA]">cities</span>
            </span>
            <span className="flex items-center gap-2">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              <span className="text-[15px] font-semibold text-[#18181B] tabular-nums">{fmt(thisWeek)}</span>
              <span className="text-[15px] text-[#A1A1AA]">this week</span>
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

        <HackathonDirectory events={directoryEvents} />

        <SiteFooter />
      </div>
    </div>
  );
}
