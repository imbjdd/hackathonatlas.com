"use client";

import { useState } from "react";

export interface ReviewRow {
  id: string;
  title: string;
  description: string | null;
  link: string | null;
  location: string | null;
  startTime: string | null;
  status: "needs_review" | "rejected";
  confidence: number | null;
  reason: string | null;
  model: string | null;
}

export function AdminReviewList({ rows }: { rows: ReviewRow[] }) {
  const [items, setItems] = useState(rows);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function moderate(id: string, action: "keep" | "reject") {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch("/api/admin/moderate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Request failed (${res.status})`);
      }
      // Remove from the queue — the decision is applied.
      setItems((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-[#EAEAEA] px-6 py-16 text-center text-[15px] text-[#A1A1AA]">
        Nothing to review. 🎉
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p className="rounded-md bg-[#FEF2F2] px-3 py-2 text-[13px] text-[#DC2626]">
          {error}
        </p>
      )}
      {items.map((r) => (
        <div
          key={r.id}
          className="flex flex-col gap-3 rounded-lg border border-[#EAEAEA] p-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={r.status} />
            {r.confidence != null && (
              <span className="text-[12px] text-[#A1A1AA] tabular-nums">
                confidence {r.confidence.toFixed(2)}
              </span>
            )}
            {r.model && (
              <span className="text-[12px] text-[#A1A1AA]">· {r.model}</span>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[16px] font-semibold text-[#18181B]">
              {r.title}
            </span>
            <span className="text-[13px] text-[#71717A]">
              {[r.location, formatDate(r.startTime)].filter(Boolean).join(" · ") ||
                "No location/date"}
            </span>
          </div>

          {r.reason && (
            <p className="text-[13px] italic text-[#52525B]">
              LLM: {r.reason}
            </p>
          )}
          {r.description && (
            <p className="line-clamp-2 text-[13px] text-[#3F3F46]">
              {r.description}
            </p>
          )}
          {r.link && (
            <a
              href={r.link}
              target="_blank"
              rel="noopener noreferrer"
              className="w-fit break-all text-[13px] text-[#18181B] underline underline-offset-2"
            >
              {r.link}
            </a>
          )}

          <div className="mt-1 flex gap-2">
            <button
              onClick={() => moderate(r.id, "keep")}
              disabled={busy === r.id}
              className="rounded-md bg-[#15803D] px-4 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Keep
            </button>
            <button
              onClick={() => moderate(r.id, "reject")}
              disabled={busy === r.id}
              className="rounded-md bg-[#DC2626] px-4 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: ReviewRow["status"] }) {
  const label = status === "needs_review" ? "Needs review" : "Rejected";
  const cls =
    status === "needs_review"
      ? "bg-[#FEF3C7] text-[#B45309]"
      : "bg-[#FEE2E2] text-[#DC2626]";
  return (
    <span
      className={`rounded-full px-2 py-[3px] text-[11px] font-semibold ${cls}`}
    >
      {label}
    </span>
  );
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
