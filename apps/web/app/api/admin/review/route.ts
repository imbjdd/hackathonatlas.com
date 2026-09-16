import { NextRequest, NextResponse } from "next/server";
import { and, asc, gte, isNull, notInArray, or } from "drizzle-orm";
import { db } from "../../../../src/db";
import { events } from "../../../../src/db/schema";
import { visibleEvents } from "../../../../src/lib/event-visibility";
import { isAdminRequest } from "../../../../src/lib/admin-auth";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

// Decisions from these models are final — such events are not resurfaced here.
// "manual" is a human in /admin; "claude-daily-review" is the daily routine.
const REVIEWED_MODELS = ["manual", "claude-daily-review"];

// Review queue for automated moderation: upcoming, publicly visible events
// whose classification hasn't been confirmed by a human or the daily routine.
// The ingest-time classifier's verdict (status/confidence/reason) is included
// as a hint, not a decision.
export async function GET(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requestedLimit = Number(
    request.nextUrl.searchParams.get("limit") ?? DEFAULT_LIMIT,
  );
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  const rows = await db
    .select({
      id: events.id,
      title: events.title,
      description: events.description,
      link: events.link,
      city: events.city,
      country: events.country,
      mode: events.mode,
      startTime: events.startTime,
      endTime: events.endTime,
      cashPrize: events.cashPrize,
      tags: events.tags,
      participantsCount: events.participantsCount,
      createdAt: events.createdAt,
      classificationStatus: events.classificationStatus,
      classificationConfidence: events.classificationConfidence,
      classificationReason: events.classificationReason,
      classificationModel: events.classificationModel,
    })
    .from(events)
    .where(
      and(
        visibleEvents,
        gte(events.startTime, new Date()),
        or(
          isNull(events.classificationModel),
          notInArray(events.classificationModel, REVIEWED_MODELS),
        ),
      ),
    )
    .orderBy(asc(events.startTime))
    .limit(limit);

  // Cap descriptions so a big queue stays a reasonable payload.
  return NextResponse.json(
    rows.map((r) => ({
      ...r,
      description: r.description?.slice(0, 4000) ?? null,
    })),
  );
}
