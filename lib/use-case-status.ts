/* =========================================================================
   Status — one lifecycle state, one review state, said once.

   DRAFT IS GONE. It was a hedge from when the library shipped empty and every
   entry was half-written. Now that all 28 carry a full definition, marking
   them "Draft" said nothing true — every page read "Draft · Needs review",
   which is two labels for one fact and trains people to ignore both.

   What is left is the distinction that actually matters operationally:

     LIFECYCLE   Active / Archived — is this still offered? Set deliberately.
                 Archived entries are kept because accounts reference them.

     REVIEW      Needs review / Reviewed / Review overdue — has anyone checked
                 the wording lately? DERIVED from lastReviewedAt, so it cannot
                 drift out of step with reality and nobody has to maintain it.

   An active, recently reviewed use case shows NO chip at all. A chip should
   mean "look at this", and if everything wears one, nothing does.
   ========================================================================= */

import type { UseCaseEntry, LifecycleStatus } from "@/lib/use-case-library";

export { LIFECYCLE_STATUSES, type LifecycleStatus } from "@/lib/use-case-library";

export const STATUS_LABEL: Record<LifecycleStatus, string> = {
  active: "Active",
  archived: "Archived",
};

export const STATUS_HELP: Record<LifecycleStatus, string> = {
  active: "Currently offered. Safe to rely on in a client conversation.",
  archived: "No longer offered. Kept because accounts still reference it.",
};

/** Colour supports the label and never replaces it (WCAG 1.4.1). */
export const STATUS_TONE: Record<LifecycleStatus, string> = {
  active: "border-[#1F9D63]/25 bg-[#1F9D63]/10 text-[#1F9D63]",
  archived: "border-border bg-bg-muted text-fg-subtle",
};

export const REVIEW_STATES = ["needs_review", "reviewed", "overdue"] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

export const REVIEW_LABEL: Record<ReviewState, string> = {
  needs_review: "Needs review",
  reviewed: "Reviewed",
  overdue: "Review overdue",
};

/** Amber for both attention states; neutral once reviewed. */
export const REVIEW_TONE: Record<ReviewState, string> = {
  needs_review: "border-[#C99A14]/30 bg-[#8A6D12]/[0.07] text-[#8A6D12]",
  overdue: "border-[#C99A14]/40 bg-[#8A6D12]/[0.10] text-[#8A6D12]",
  reviewed: "border-border bg-bg-muted text-fg-subtle",
};

/** A definition older than this is stale enough to be worth re-reading. Six
 *  months matches a typical half-yearly content cycle. */
export const REVIEW_INTERVAL_DAYS = 180;

/**
 * Derived from lastReviewedAt alone — never stored, so it can't go stale.
 * Never reviewed reads "Needs review", not "Reviewed by default".
 */
export function reviewState(entry: UseCaseEntry | undefined, today: string): ReviewState {
  if (!entry?.lastReviewedAt) return "needs_review";
  const a = Date.parse(`${entry.lastReviewedAt.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${today.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "needs_review";
  return (b - a) / 86_400_000 > REVIEW_INTERVAL_DAYS ? "overdue" : "reviewed";
}

/**
 * The one thing worth saying about this entry's state, or "" when there is
 * nothing to say. Archived wins — it changes whether you should use the entry
 * at all, which outranks whether its wording is fresh.
 */
export function statusLine(entry: UseCaseEntry | undefined, today: string): string {
  if (entry?.status === "archived") return "Archived";
  const review = reviewState(entry, today);
  return review === "reviewed" ? "" : REVIEW_LABEL[review];
}

/** Tone for whatever statusLine decided to show. */
export function statusTone(entry: UseCaseEntry | undefined, today: string): string {
  if (entry?.status === "archived") return STATUS_TONE.archived;
  return REVIEW_TONE[reviewState(entry, today)];
}
