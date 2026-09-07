/* =========================================================================
   Which project tasks reach the Today board.

   Today is a queue of what needs attention now; Work holds the whole plan. So
   only a narrow slice of project tasks belongs on Today:

     · BLOCKED, whatever its date — blocked is a state that needs someone now,
       and the due date says when it was meant to land, not when it needs
       unblocking.
     · DUE TODAY or OVERDUE.

   Everything else stays in the Work tab. Applied to a realistic board this
   surfaces one or two rows, not the whole project plan — which is the point.

   WHOLE DAYS, UTC, date component only. A task due today must not flip to
   overdue because of the viewer's clock time — the same rule lib/today/due.ts
   already applies to standalone tasks.

   PURE. No I/O, no date construction from `now` inside the function: `today`
   is passed in so the caller decides, and so this is testable.
   ========================================================================= */

export type ProjectTaskStatus = "todo" | "in_progress" | "blocked" | "done";

/** The minimum a caller must supply. Deliberately structural, so both the
 *  prototype's shape and the real `project_tasks` row satisfy it. */
export interface TodayCandidate {
  id: string;
  status: ProjectTaskStatus;
  /** ISO date, or null when the task carries no date. */
  dueDate: string | null;
}

/** Why a task reached Today. `null` when it did not. */
export type SurfaceReason = "blocked" | "overdue" | "due_today";

export interface SurfaceVerdict {
  surfaces: boolean;
  reason: SurfaceReason | null;
  /** Whole days until the due date. Null when there is no date. */
  daysUntil: number | null;
}

/** Whole-day difference, date component only, both sides pinned to UTC midnight. */
export function daysUntilDue(dueDate: string | null, today: string): number | null {
  if (!dueDate) return null;
  const a = Date.parse(`${dueDate.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${today.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((a - b) / 86_400_000);
}

/**
 * Does this project task belong on the Today board?
 *
 * Order matters: `done` wins over everything — a completed task never surfaces,
 * even if it is overdue or was left flagged blocked. Then blocked, which does
 * not need a date. Then the date rules.
 */
export function surfacesOnToday(task: TodayCandidate, today: string): SurfaceVerdict {
  const daysUntil = daysUntilDue(task.dueDate, today);

  if (task.status === "done") return { surfaces: false, reason: null, daysUntil };
  if (task.status === "blocked") return { surfaces: true, reason: "blocked", daysUntil };
  if (daysUntil === null) return { surfaces: false, reason: null, daysUntil };
  if (daysUntil < 0) return { surfaces: true, reason: "overdue", daysUntil };
  if (daysUntil === 0) return { surfaces: true, reason: "due_today", daysUntil };
  return { surfaces: false, reason: null, daysUntil };
}

/** The subset of a board's tasks that reach Today, each with its reason. */
export function selectForToday<T extends TodayCandidate>(
  tasks: T[],
  today: string,
): { task: T; reason: SurfaceReason; daysUntil: number | null }[] {
  const out: { task: T; reason: SurfaceReason; daysUntil: number | null }[] = [];
  for (const task of tasks) {
    const v = surfacesOnToday(task, today);
    if (v.surfaces && v.reason) out.push({ task, reason: v.reason, daysUntil: v.daysUntil });
  }
  /* Blocked first — it needs a person, not a calendar. Then most overdue. */
  const rank: Record<SurfaceReason, number> = { blocked: 0, overdue: 1, due_today: 2 };
  return out.sort(
    (a, b) => rank[a.reason] - rank[b.reason] || (a.daysUntil ?? 0) - (b.daysUntil ?? 0),
  );
}

export const REASON_LABEL: Record<SurfaceReason, string> = {
  blocked: "Blocked",
  overdue: "Overdue",
  due_today: "Due today",
};
