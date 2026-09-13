/* =========================================================================
   Task due dates — the date arithmetic the account Tasks sidebar shows and
   edits with. Pure and date-string based: a task due "today" must not flip to
   overdue because of the viewer's clock time or timezone.
   ========================================================================= */

const DAY_MS = 86_400_000;

const dayStart = (iso: string): number => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);

/** Whole days from `today` until `due` (negative once missed), or null when
 *  there is no usable date. */
export function daysUntil(due: string | null, today: string): number | null {
  if (!due) return null;
  const a = dayStart(due);
  const b = dayStart(today);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((a - b) / DAY_MS);
}

/** Missed: due strictly before today. A task due today is not overdue. */
export const isOverdue = (due: string | null, today: string): boolean => {
  const d = daysUntil(due, today);
  return d != null && d < 0;
};

/**
 * The due date "Push a week" moves a task to, as YYYY-MM-DD.
 *
 * A week from the LATER of the current due date and today. A week from an
 * overdue date would usually still be in the past — a task ten days late
 * pushed a week is still three days late — which is not what anyone pressing
 * the button means, and the server refuses a past due date anyway. So a
 * missed task lands a week from today; a future one moves a week later.
 * An undated task gets a week from today.
 */
export function pushedAWeek(due: string | null, today: string): string {
  const from = dayStart(today);
  const current = due ? dayStart(due) : NaN;
  const base = Number.isFinite(current) && current > from ? current : from;
  return new Date(base + 7 * DAY_MS).toISOString().slice(0, 10);
}
