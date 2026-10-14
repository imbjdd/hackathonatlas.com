import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { and, asc, gte, isNull, or } from "drizzle-orm";
import { db } from "../../../../src/db";
import { events } from "../../../../src/db/schema";
import { visibleEvents } from "../../../../src/lib/event-visibility";

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;

/*
 * A substring search can't use an index, so querying D1 per keystroke scanned
 * the whole events table each time (see the D1 note in app/page.tsx). Load the
 * searchable events once an hour instead and match in memory.
 */
const getSearchable = unstable_cache(
  async () => {
    const rows = await db
      .select({
        id: events.id,
        title: events.title,
        city: events.city,
        description: events.description,
        startTime: events.startTime,
        endTime: events.endTime,
        link: events.link,
      })
      .from(events)
      .where(
        and(visibleEvents, or(isNull(events.endTime), gte(events.endTime, new Date()))),
      )
      .orderBy(asc(events.startTime));

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      city: r.city,
      startTime: r.startTime.toISOString(),
      endTime: r.endTime ? r.endTime.toISOString() : null,
      link: r.link,
      haystack: [r.title, r.city, r.description].filter(Boolean).join("\n").toLowerCase(),
    }));
  },
  ["search-index"],
  { revalidate: 3600 },
);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const requestedLimit = Number(searchParams.get("limit") ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  if (q.length < 2) {
    return NextResponse.json([]);
  }

  const needle = q.toLowerCase();
  const now = new Date().toISOString();
  const matches = (await getSearchable())
    // The cache can be up to an hour old: drop events that ended since.
    .filter((e) => (e.endTime === null || e.endTime >= now) && e.haystack.includes(needle))
    .slice(0, limit)
    .map(({ id, title, city, startTime, endTime, link }) => ({
      id,
      title,
      city,
      startTime,
      endTime,
      link,
    }));

  return NextResponse.json(matches);
}
