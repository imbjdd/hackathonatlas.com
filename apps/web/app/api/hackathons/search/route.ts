import { NextRequest, NextResponse } from "next/server";
import { and, asc, gte, ilike, isNull, or } from "drizzle-orm";
import { db } from "../../../../src/db";
import { events } from "../../../../src/db/schema";
import { visibleEvents } from "../../../../src/lib/event-visibility";

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;

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

  const matches = await db
    .select({
      id: events.id,
      title: events.title,
      city: events.city,
      startTime: events.startTime,
      endTime: events.endTime,
      link: events.link,
    })
    .from(events)
    .where(
      and(
        visibleEvents,
        or(isNull(events.endTime), gte(events.endTime, new Date())),
        or(
          ilike(events.title, `%${q}%`),
          ilike(events.city, `%${q}%`),
          ilike(events.description, `%${q}%`)
        )
      )
    )
    .orderBy(asc(events.startTime))
    .limit(limit);

  return NextResponse.json(matches);
}
