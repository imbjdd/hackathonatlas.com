import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "../../../../src/db";
import { events } from "../../../../src/db/schema";
import { isAdminRequest } from "../../../../src/lib/admin-auth";

// Apply a moderation decision to one event. "keep" makes it visible, "reject"
// hides it, "review" hides it and queues it for a human in /admin. `model`
// records who decided — defaults to "manual" (a person in /admin); automated
// clients (e.g. the daily Claude routine) pass their own name so the review
// queue doesn't resurface events they already judged.
export async function POST(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const action = body?.action;
  const model =
    typeof body?.model === "string" && body.model.length <= 64 && body.model
      ? body.model
      : "manual";
  // Optional one-line rationale, shown in /admin next to the decision.
  const reason =
    typeof body?.reason === "string" && body.reason
      ? body.reason.slice(0, 500)
      : null;

  if (!id || (action !== "keep" && action !== "reject" && action !== "review")) {
    return NextResponse.json(
      { error: "id and action ('keep' | 'reject' | 'review') are required" },
      { status: 400 },
    );
  }

  const status =
    action === "keep" ? "kept" : action === "reject" ? "rejected" : "needs_review";

  const [updated] = await db
    .update(events)
    .set({
      classificationStatus: status,
      classificationModel: model,
      classifiedAt: new Date(),
      ...(reason ? { classificationReason: reason } : {}),
    })
    .where(eq(events.id, id))
    .returning({ id: events.id });

  if (!updated) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, status });
}
