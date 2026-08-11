import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "../../../../src/db";
import { events } from "../../../../src/db/schema";
import { isAdmin } from "../../../../src/lib/admin-auth";

// Apply a human moderation decision to one event. "keep" makes it visible,
// "reject" hides it. Records model = "manual" so it's clear a person decided.
export async function POST(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const action = body?.action;

  if (!id || (action !== "keep" && action !== "reject")) {
    return NextResponse.json(
      { error: "id and action ('keep' | 'reject') are required" },
      { status: 400 },
    );
  }

  const status = action === "keep" ? "kept" : "rejected";

  const [updated] = await db
    .update(events)
    .set({
      classificationStatus: status,
      classificationModel: "manual",
      classifiedAt: new Date(),
    })
    .where(eq(events.id, id))
    .returning({ id: events.id });

  if (!updated) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, status });
}
