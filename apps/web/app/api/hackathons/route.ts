import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "../../../src/db";
import { events } from "../../../src/db/schema";
import { uploadImageFromUrl } from "../../../src/lib/media";
import { enrichFromLuma } from "../../../src/lib/luma";
import { classifyEvent, statusForResult } from "../../../src/lib/classifier";

// What the scrapers in crons/ POST; only title and startTime are required.
type HackathonInput = {
  title?: string;
  description?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  startTime?: string;
  endTime?: string | null;
  organizerId?: string | null;
  link?: string | null;
  cashPrize?: number | null;
  tags?: string[] | null;
  participantsCount?: number;
  coverUrl?: string | null;
  mode?: string | null;
  country?: string | null;
  countryCode?: string | null;
  venue?: string | null;
};

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.HACKATHONS_API_SECRET;

  if (!expectedSecret) {
    return NextResponse.json(
      { error: "HACKATHONS_API_SECRET is not configured" },
      { status: 500 }
    );
  }

  const providedSecret = request.headers.get("x-api-secret");

  if (providedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as HackathonInput;

  if (!body.title || !body.startTime) {
    return NextResponse.json(
      { error: "title and startTime are required" },
      { status: 400 }
    );
  }

  if (body.link) {
    const [existing] = await db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.link, body.link))
      .limit(1);

    if (existing) {
      return NextResponse.json(
        { error: "A hackathon with this link already exists" },
        { status: 409 }
      );
    }
  }

  let coverUrl: string | null = null;
  if (body.coverUrl) {
    coverUrl = await uploadImageFromUrl(body.coverUrl);
  }

  // Enrich attendance mode + location from the source (Luma). Best-effort: a
  // failure just leaves the fields null. Explicit body values take precedence.
  const loc = body.link ? await enrichFromLuma(body.link) : null;

  // Classify the entry as a real vs. fake/test hackathon. Best-effort: on any
  // failure (or no OPENAI_API_KEY) the row stays "pending" and the backfill
  // script classifies it later. High-confidence verdicts are applied here;
  // uncertain ones become "needs_review" and are hidden until an admin acts.
  const classification = await classifyEvent({
    title: body.title,
    description: body.description ?? null,
    link: body.link ?? null,
    city: body.city ?? loc?.city ?? null,
    country: body.country ?? loc?.country ?? null,
    startTime: body.startTime,
  }).catch(() => null);
  const classificationStatus = classification
    ? statusForResult(classification)
    : "pending";

  const [created] = await db
    .insert(events)
    .values({
      title: body.title,
      description: body.description ?? null,
      city: body.city ?? loc?.city ?? null,
      latitude: body.latitude ?? loc?.latitude ?? null,
      longitude: body.longitude ?? loc?.longitude ?? null,
      startTime: new Date(body.startTime),
      endTime: body.endTime ? new Date(body.endTime) : null,
      organizerId: body.organizerId ?? null,
      link: body.link ?? null,
      cashPrize: body.cashPrize ?? null,
      tags: body.tags ?? null,
      participantsCount: body.participantsCount ?? 0,
      coverUrl,
      mode: body.mode ?? loc?.mode ?? null,
      country: body.country ?? loc?.country ?? null,
      countryCode: body.countryCode ?? loc?.countryCode ?? null,
      venue: body.venue ?? loc?.venue ?? null,
      enrichedAt: loc ? new Date() : null,
      classificationStatus,
      classificationConfidence: classification?.confidence ?? null,
      classificationReason: classification?.reason ?? null,
      classificationModel: classification?.model ?? null,
      classifiedAt: classification ? new Date() : null,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
