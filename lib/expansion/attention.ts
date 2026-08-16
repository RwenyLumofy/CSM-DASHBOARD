/* =========================================================================
   Expansion — whether an opportunity needs attention.

   THE SINGLE DEFINITION. The board card, the header count, the `Needs
   attention` filter, the list column and the Action list all read `attention()`
   from here. A second definition anywhere is a bug: every number on the page
   depends on this one function agreeing with itself.

   Pure — no React, no DB, no clock. `today` is always passed in, resolved once
   on the server, so the whole page reads the same date and the tests can pin it.

   Two independent read-outs feed it:

     dueState(o)  — the timing of the next step   ("Due tomorrow", "5 days overdue")
     momentum(o)  — whether the deal itself is moving ("Waiting 6d", "Stalled 22d")

   They are separate on purpose. A proposal can be waiting on the client for a
   week while the next step is due tomorrow; one number cannot say both.

   Whole days, computed from calendar dates pinned to midnight UTC — the same
   discipline as lib/today/due.ts. A step due today must not flip to overdue
   because of the viewer's clock time.
   ========================================================================= */

import type { Outcome, Stage } from "@/lib/expansion/types";

/** Not updated for this many days → stalled. One threshold for every stage in
 *  Release 1 (decision D-1). */
export const STALE_DAYS = 14;
/** Proposed, and quiet for this many days → waiting on the client. */
export const WAITING_DAYS = 3;
/** Changed stage within this many days → recently progressed. */
export const PROGRESSED_DAYS = 5;

/** Today as "YYYY-MM-DD", UTC — the app's convention everywhere else too. */
export const todayIso = (now: Date = new Date()) => now.toISOString().slice(0, 10);

/** Days elapsed from `iso` to `from`. Positive means in the past. Accepts a
 *  date ("2026-08-13") or a full timestamp — only the calendar day is read. */
export const daysSince = (iso: string, from: string): number =>
  Math.round(
    (Date.parse(`${from.slice(0, 10)}T00:00:00Z`) - Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)) / 86_400_000,
  );

/* The minimum shape every read-out needs. Structural on purpose: the domain
   Opportunity satisfies it, and so does a test fixture or a raw DB row, so
   nothing has to assemble a full record to ask whether it needs attention. */

export interface StepLike {
  id: string;
  text: string;
  /** "YYYY-MM-DD". */
  dueDate: string;
}

export interface AttentionInput {
  stage: Stage;
  outcome: Outcome | null;
  /** ISO or "YYYY-MM-DD". Any change at all. */
  lastActivityAt: string;
  /** ISO or "YYYY-MM-DD". When it entered its current stage. */
  stageChangedAt: string;
  nextSteps: readonly StepLike[];
}

export const isClosed = (o: Pick<AttentionInput, "outcome">) => o.outcome !== null;

/** The step the card shows and attention reads: the soonest due. Ties break on
 *  id so the answer is stable across renders and between server and client. */
export function primaryStep<T extends StepLike>(o: { nextSteps: readonly T[] }): T | null {
  if (!o.nextSteps.length) return null;
  return [...o.nextSteps].sort((a, b) =>
    a.dueDate === b.dueDate ? a.id.localeCompare(b.id) : a.dueDate < b.dueDate ? -1 : 1,
  )[0]!;
}

/* ── Read-out 1: the timing of the next step ──────────────────────────────── */

export type DueState = "none" | "overdue" | "today" | "tomorrow" | "soon" | "later";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "13 Aug" — kept here rather than in the formatter so a due label is one
 *  string, produced in one place, for the card and the Action list alike. */
function shortDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? "—" : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function dueState(o: AttentionInput, today: string): { state: DueState; label: string; days: number } {
  const step = primaryStep(o);
  if (!step) return { state: "none", label: "No next step", days: 0 };
  const d = daysSince(step.dueDate, today);
  if (d > 0) return { state: "overdue", label: `${d} ${d === 1 ? "day" : "days"} overdue`, days: d };
  if (d === 0) return { state: "today", label: "Due today", days: 0 };
  if (d === -1) return { state: "tomorrow", label: "Due tomorrow", days: 1 };
  if (d >= -3) return { state: "soon", label: `Due in ${-d} days`, days: -d };
  return { state: "later", label: `Due ${shortDate(step.dueDate)}`, days: -d };
}

/* ── Read-out 2: whether the deal itself is moving ────────────────────────── */

export type MomentumState = "progressed" | "stalled" | "waiting" | "moving";

export function momentum(o: AttentionInput, today: string): { state: MomentumState; label: string; days: number } {
  const quiet = daysSince(o.lastActivityAt, today);
  const sinceStage = daysSince(o.stageChangedAt, today);

  if (quiet >= STALE_DAYS) return { state: "stalled", label: `Stalled ${quiet}d`, days: quiet };
  // Waiting is a PROPOSED-only reading: silence after a proposal means the ball
  // is with the client. Silence at Identified is just nobody doing anything.
  if (o.stage === "proposed" && quiet >= WAITING_DAYS) {
    return { state: "waiting", label: `Waiting on client ${quiet}d`, days: quiet };
  }
  if (sinceStage <= PROGRESSED_DAYS) {
    return { state: "progressed", label: sinceStage === 0 ? "Moved today" : `Moved ${sinceStage}d ago`, days: sinceStage };
  }
  return { state: "moving", label: "", days: sinceStage };
}

/* ── The one attention read-out ───────────────────────────────────────────── */

export type AttentionState =
  | "no_next_step" | "overdue" | "stalled" | "waiting" | "due_soon" | "progressed" | "normal" | "closed";

export type Tone = "danger" | "warning" | "info" | "muted" | "subtle";

export interface Attention {
  state: AttentionState;
  label: string;
  /** Quieter supporting explanation. Never a second warning. */
  secondary: string | null;
  tone: Tone;
  /** Whether this belongs in the Needs attention count. */
  needs: boolean;
}

/** Precedence, highest first. Also the list view's sort rank. */
export const ATTENTION_ORDER: AttentionState[] =
  ["no_next_step", "overdue", "stalled", "waiting", "due_soon", "progressed", "normal", "closed"];

/**
 * Exactly ONE primary state per opportunity, by the precedence above. Anything
 * else that is also true becomes quieter secondary context after a middot —
 * "5 days overdue · waiting 8d" reads as one fact with an explanation, never as
 * two competing warnings.
 */
export function attention(o: AttentionInput, today: string): Attention {
  // A closed opportunity is visible without competing for attention. It has no
  // next step to be late for and no momentum to lose.
  if (isClosed(o)) {
    return { state: "closed", label: "Closed", secondary: null, tone: "subtle", needs: false };
  }

  const d = dueState(o, today);
  const m = momentum(o, today);

  // Momentum, phrased for use as supporting context.
  const momentumAside =
    m.state === "stalled" ? `stalled ${m.days}d`
      : m.state === "waiting" ? `waiting ${m.days}d`
        : null;

  if (d.state === "none") {
    return { state: "no_next_step", label: "No next step", secondary: momentumAside, tone: "warning", needs: true };
  }
  if (d.state === "overdue") {
    return { state: "overdue", label: d.label, secondary: momentumAside, tone: "danger", needs: true };
  }
  if (m.state === "stalled") {
    return { state: "stalled", label: m.label, secondary: d.label.toLowerCase(), tone: "warning", needs: true };
  }
  if (m.state === "waiting") {
    return { state: "waiting", label: m.label, secondary: d.label.toLowerCase(), tone: "info", needs: false };
  }
  if (d.state === "today" || d.state === "tomorrow" || d.state === "soon") {
    return { state: "due_soon", label: d.label, secondary: null, tone: "warning", needs: false };
  }
  if (m.state === "progressed") {
    return { state: "progressed", label: d.label, secondary: m.label.toLowerCase(), tone: "muted", needs: false };
  }
  return { state: "normal", label: d.label, secondary: null, tone: "muted", needs: false };
}

/** Drives the header count and the Needs attention filter. One definition. */
export const needsAttention = (o: AttentionInput, today: string) => attention(o, today).needs;

/**
 * Whether an opportunity should surface on the Action list / Today.
 *
 * Deliberately NOT a second rule: it reads `attention()` and adds only the one
 * case the page itself treats as calm but a daily work surface should not —
 * a step due TODAY. (`due_soon` also covers tomorrow and the next three days,
 * which do not belong on today's list.)
 */
export function surfacesOnActionList(o: AttentionInput, today: string): boolean {
  const a = attention(o, today);
  if (a.needs) return true; // no next step · overdue · stalled
  return dueState(o, today).state === "today";
}
