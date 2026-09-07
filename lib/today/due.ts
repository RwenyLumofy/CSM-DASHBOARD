/* =========================================================================
   Due-date language, in one place.

   "Overdue by 2 days" beats "31 Jul" on a work surface: the whole value of a
   task list is knowing what you have already missed, and a bare date makes the
   reader do the arithmetic.

   WHOLE DAYS, computed from date strings only. A task due today must not flip
   to overdue because of the viewer's clock time — both sides are pinned to
   midnight UTC before subtracting, so the answer depends on the calendar date
   and nothing else.

   Extracted from components/clients/AccountTasks.tsx, which had the only copy.
   ========================================================================= */

export type DueTone = "overdue" | "today" | "soon" | "later" | "none";

/** Whole-day difference between a due date and "today". Null when unparseable. */
export function daysUntil(due: string | null, today: string): number | null {
  if (!due) return null;
  const a = Date.parse(`${due.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${today.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((a - b) / 86_400_000);
}

/** Relative phrasing plus the tone it should carry. Text AND tone, because
 *  colour alone fails WCAG 1.4.1 — every caller renders the words. */
export function dueLabel(due: string | null, today: string): { text: string; tone: DueTone } {
  const d = daysUntil(due, today);
  if (d == null) return { text: "No date", tone: "none" };
  if (d < 0) return { text: `Overdue by ${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"}`, tone: "overdue" };
  if (d === 0) return { text: "Due today", tone: "today" };
  if (d === 1) return { text: "Due tomorrow", tone: "soon" };
  if (d <= 7) return { text: `Due in ${d} days`, tone: "soon" };
  return {
    text: `Due ${new Date(`${due!.slice(0, 10)}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`,
    tone: "later",
  };
}

/** Tailwind classes per tone. Kept beside the labels so the two never drift. */
export const DUE_TONE: Record<DueTone, string> = {
  overdue: "text-[#B23A57] font-semibold",
  today: "text-[#8A6D12] font-semibold",
  soon: "text-fg-muted",
  later: "text-fg-subtle",
  none: "text-fg-subtle",
};
