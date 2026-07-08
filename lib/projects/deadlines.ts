/* =========================================================================
   Project/task deadline detection — the shared pure layer behind both the
   Action List signals (lib/actions/signals.ts) and the deadline notifications
   (lib/notifications/project-deadline-sync.ts). Given a client's assembled
   project board + the option config, it returns the incomplete projects/tasks
   that are overdue or coming due soon.
   ========================================================================= */

import { isProjectComplete, isTaskDone, type ProjectConfig } from "@/lib/projects/config";
import type { ProjectDetail } from "@/lib/projects/types";

/** How far ahead of the delivery date something counts as "due soon". */
export const PROJECT_DUE_SOON_DAYS = 7;
export const TASK_DUE_SOON_DAYS = 2;

export interface ProjectDeadlineItem {
  kind: "project" | "task";
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  deliveryDate: string; // ISO
  state: "overdue" | "due_soon";
  /** Whole days until delivery (negative = overdue, 0 = due today). */
  daysUntil: number;
  /** Task owner (falling back to the project owner), or project owner. */
  ownerEmail: string | null;
}

/** Whole-day difference between `from` (today) and an ISO date, date-only. */
function daysUntil(from: Date, iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const a = new Date(from);
  a.setHours(0, 0, 0, 0);
  const b = new Date(d);
  b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * Incomplete projects/tasks that are overdue or due soon, for one account.
 * A completed project/done task is never flagged (it auto-clears the signal).
 */
export function computeProjectDeadlines(board: ProjectDetail[], config: ProjectConfig, now: Date = new Date()): ProjectDeadlineItem[] {
  const out: ProjectDeadlineItem[] = [];
  for (const p of board) {
    // Completing/cancelling a project doesn't cascade to its tasks (they keep
    // whatever status they were in), so a terminal project's tasks must be
    // skipped explicitly here too — otherwise a stale open task under a
    // cancelled project would flag "overdue" forever (nothing ever completes
    // it to clear the signal).
    if (isProjectComplete(config, p.status)) continue;
    if (p.deliveryDate) {
      const du = daysUntil(now, p.deliveryDate);
      if (du != null && du <= PROJECT_DUE_SOON_DAYS) {
        out.push({ kind: "project", id: p.id, name: p.name, projectId: p.id, projectName: p.name, deliveryDate: p.deliveryDate, state: du < 0 ? "overdue" : "due_soon", daysUntil: du, ownerEmail: p.ownerEmail });
      }
    }
    for (const m of p.milestones) {
      for (const t of m.tasks) {
        if (isTaskDone(config, t.status) || !t.deliveryDate) continue;
        const du = daysUntil(now, t.deliveryDate);
        if (du != null && du <= TASK_DUE_SOON_DAYS) {
          out.push({ kind: "task", id: t.id, name: t.name, projectId: p.id, projectName: p.name, deliveryDate: t.deliveryDate, state: du < 0 ? "overdue" : "due_soon", daysUntil: du, ownerEmail: t.ownerEmail ?? p.ownerEmail });
        }
      }
    }
  }
  return out;
}
