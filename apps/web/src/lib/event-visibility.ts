// Single source of truth for which events are publicly visible.
//
// The LLM classifier (see lib/classifier.ts) can hide an event by setting its
// classification_status to "rejected" (judged fake/test) or "needs_review"
// (uncertain — awaiting a human in /admin). Everything else ("pending" and
// "kept") is shown. Apply `visibleEvents` to every public read query.

import { notInArray } from "drizzle-orm";
import { events } from "../db/schema";

// Statuses hidden from the public directory.
export const HIDDEN_STATUSES = ["rejected", "needs_review"] as const;

export const visibleEvents = notInArray(events.classificationStatus, [
  ...HIDDEN_STATUSES,
]);
