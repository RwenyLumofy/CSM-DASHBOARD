/* =========================================================================
   Status — one lifecycle state, one review state, said once.

   The page previously carried four overlapping signals for the same fact: a
   "Described" chip, a red "Draft · not reviewed" chip, "Updated by drafted —
   needs review" in the metadata line, and another red warning further down.
   Four ways of saying one thing reads as noise and costs trust.

   So there are exactly two axes now, and they answer different questions:

     LIFECYCLE   Draft / Published / Archived — is this safe to rely on with a
                 client? Set deliberately by a person.

     REVIEW      Needs review / Reviewed / Review overdue — has anyone checked
                 the wording lately? DERIVED from lastReviewedAt, so it cannot
                 drift out of step with reality and nobody has to maintain it.

   "Described" is gone. Whether an entry has content is not a status; if the
   definition is incomplete the page names the missing fields instead (see
   missingFields), which is the actionable version of the same information.
   ========================================================================= */

import type { UseCaseEntry, LifecycleStatus } from "@/lib/use-case-library";

export { LIFECYCLE_STATUSES, type LifecycleStatus } from "@/lib/use-case-library";

export const STATUS_LABEL: Record<LifecycleStatus, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

export const STATUS_HELP: Record<LifecycleStatus, string> = {
  draft: "Being written. Usable, but not agreed — don't quote it to a client yet.",
  published: "Agreed. Safe to rely on in a client conversation.",
  archived: "No longer offered. Kept because accounts still reference it.",
};

/** Colour supports the label and never replaces it (WCAG 1.4.1). */
export const STATUS_TONE: Record<LifecycleStatus, string> = {
  draft: "border-[#C99A14]/30 bg-[#8A6D12]/[0.07] text-[#8A6D12]",
  published: "border-[#1F9D63]/25 bg-[#1F9D63]/10 text-[#1F9D63]",
  archived: "border-border bg-bg-muted text-fg-subtle",
};

export const REVIEW_STATES = ["needs_review", "reviewed", "overdue"] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

export const REVIEW_LABEL: Record<ReviewState, string> = {
  needs_review: "Needs review",
  reviewed: "Reviewed",
  overdue: "Review overdue",
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

/** "Draft · Needs review" — the whole state in one string. */
export function statusLine(entry: UseCaseEntry | undefined, today: string): string {
  const lifecycle = STATUS_LABEL[entry?.status ?? "draft"];
  const review = REVIEW_LABEL[reviewState(entry, today)];
  // Published-and-reviewed is the resting state; adding "· Reviewed" to it is
  // noise, so it's only shown when it needs attention.
  return entry?.status === "published" && reviewState(entry, today) === "reviewed"
    ? lifecycle
    : `${lifecycle} · ${review}`;
}
