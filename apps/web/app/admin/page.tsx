import { desc, inArray, sql } from "drizzle-orm";
import { db } from "../../src/db";
import { events } from "../../src/db/schema";
import { isAdmin, adminSecret } from "../../src/lib/admin-auth";
import { AdminReviewList, type ReviewRow } from "./admin-review-list";

export const dynamic = "force-dynamic";

const REVIEW_LIMIT = 300;

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  // Config guard — without a secret the page can't be secured, so refuse.
  if (!adminSecret()) {
    return (
      <Shell>
        <p className="text-[15px] text-[#B45309]">
          ADMIN_SECRET is not configured. Set it in the environment to enable
          the admin.
        </p>
      </Shell>
    );
  }

  if (!(await isAdmin())) {
    return (
      <Shell>
        <form
          method="POST"
          action="/api/admin/login"
          className="flex max-w-[320px] flex-col gap-3"
        >
          <label className="text-[13px] font-medium text-[#3F3F46]">
            Admin secret
          </label>
          <input
            type="password"
            name="secret"
            autoComplete="off"
            className="rounded-md border border-[#E4E4E7] px-3 py-2 text-[14px] outline-none focus:border-[#A1A1AA]"
          />
          {error && (
            <p className="text-[13px] text-[#DC2626]">Incorrect secret.</p>
          )}
          <button
            type="submit"
            className="rounded-md bg-[#0A0A0A] px-4 py-2 text-[14px] font-medium text-white transition-opacity hover:opacity-90"
          >
            Sign in
          </button>
        </form>
      </Shell>
    );
  }

  const [rows, counts] = await Promise.all([
    db
      .select({
        id: events.id,
        title: events.title,
        description: events.description,
        link: events.link,
        city: events.city,
        country: events.country,
        startTime: events.startTime,
        status: events.classificationStatus,
        confidence: events.classificationConfidence,
        reason: events.classificationReason,
        model: events.classificationModel,
      })
      .from(events)
      .where(inArray(events.classificationStatus, ["needs_review", "rejected"]))
      // needs_review (the actionable queue) first, then most recent.
      .orderBy(
        sql`case when ${events.classificationStatus} = 'needs_review' then 0 else 1 end`,
        desc(events.classifiedAt),
      )
      .limit(REVIEW_LIMIT),
    db
      .select({
        status: events.classificationStatus,
        count: sql<number>`count(*)::int`,
      })
      .from(events)
      .groupBy(events.classificationStatus),
  ]);

  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c.count]));
  const reviewRows: ReviewRow[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description?.replace(/\s+/g, " ").trim().slice(0, 240) ?? null,
    link: r.link,
    location: [r.city, r.country].filter(Boolean).join(", ") || null,
    startTime: r.startTime ? r.startTime.toISOString() : null,
    status: r.status as "needs_review" | "rejected",
    confidence: r.confidence,
    reason: r.reason,
    model: r.model,
  }));

  return (
    <Shell>
      <div className="mb-6 flex flex-wrap gap-4 text-[13px] text-[#52525B]">
        <Stat label="Needs review" value={byStatus["needs_review"] ?? 0} />
        <Stat label="Rejected" value={byStatus["rejected"] ?? 0} />
        <Stat label="Kept" value={byStatus["kept"] ?? 0} />
        <Stat label="Pending" value={byStatus["pending"] ?? 0} />
      </div>
      <AdminReviewList rows={reviewRows} />
    </Shell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="font-semibold text-[#18181B] tabular-nums">
        {value.toLocaleString("en-US")}
      </span>
      <span className="text-[#A1A1AA]">{label}</span>
    </span>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex min-h-screen justify-center bg-white"
      style={{ fontFamily: "var(--font-geist), system-ui, sans-serif" }}
    >
      <div className="w-full max-w-[900px] px-8 py-12">
        <h1 className="mb-1 text-[24px] font-bold tracking-[-0.02em] text-[#0A0A0A]">
          Moderation
        </h1>
        <p className="mb-8 text-[14px] text-[#71717A]">
          Review hackathons the classifier was unsure about, and correct any bad
          auto-decisions.
        </p>
        {children}
      </div>
    </div>
  );
}
