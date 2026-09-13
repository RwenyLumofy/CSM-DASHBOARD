/* =========================================================================
   Task activity — the changes to a task that are written into its thread.

   WHY THIS EXISTS. Tasks became editable in place, and "Push a week" made
   moving a date one click. Without a record, a task pushed three times looks
   exactly like a task that was always due on its current date: the Today board
   reports it on time, and nobody can see that it slipped. So due-date moves,
   completion/reopening and reassignment are written as rows in task_updates —
   the same thread people already read — under the `kind` values reserved for
   this in docs/specs/tasks/task-updates-mentions-and-notifications.md (Step 3).

   Only those three. Title, notes, priority and focus-area edits are not
   recorded: they describe the work rather than whether it is on track, and a
   thread that logs every keystroke of a rename buries the conversation.

   The body of an activity row is JSON ({from, to}), not prose. The server
   writes facts; the renderer phrases them, so display names resolve at read
   time and a rename never rewrites history. Pure and dependency-free so the
   rules are unit-tested.
   ========================================================================= */

export const ACTIVITY_KINDS = ["status_changed", "reassigned", "due_date_changed"] as const;
export type TaskActivityKind = (typeof ACTIVITY_KINDS)[number];

export const isActivityKind = (kind: string): kind is TaskActivityKind =>
  (ACTIVITY_KINDS as readonly string[]).includes(kind);

export interface TaskActivity {
  kind: TaskActivityKind;
  from: string | null;
  to: string | null;
}

/** The fields activity is derived from, as they stand before or after a write. */
export interface TrackedTaskFields {
  status: string;
  ownerEmail: string;
  /** Any ISO date or timestamp; only the calendar day is compared. */
  dueDate: string | null;
}

const day = (v: string | null | undefined): string | null => (v ? v.slice(0, 10) : null);

/**
 * What a write changed, as activity rows. `patch` holds only the fields the
 * write sets; a field absent from it is unchanged by definition. Setting a
 * field to the value it already had is not activity.
 */
export function activityFor(before: TrackedTaskFields, patch: Partial<TrackedTaskFields>): TaskActivity[] {
  const out: TaskActivity[] = [];
  if (patch.dueDate !== undefined && day(patch.dueDate) !== day(before.dueDate)) {
    out.push({ kind: "due_date_changed", from: day(before.dueDate), to: day(patch.dueDate) });
  }
  if (patch.ownerEmail !== undefined && patch.ownerEmail.toLowerCase() !== before.ownerEmail.toLowerCase()) {
    out.push({ kind: "reassigned", from: before.ownerEmail.toLowerCase(), to: patch.ownerEmail.toLowerCase() });
  }
  if (patch.status !== undefined && patch.status !== before.status) {
    out.push({ kind: "status_changed", from: before.status, to: patch.status });
  }
  return out;
}

export const encodeActivity = (a: TaskActivity): string => JSON.stringify({ from: a.from, to: a.to });

/** Null when the body is not a well-formed activity payload — the renderer
 *  then shows a generic line rather than throwing on one bad row. */
export function decodeActivity(kind: string, body: string): TaskActivity | null {
  if (!isActivityKind(kind)) return null;
  try {
    const v = JSON.parse(body) as { from?: unknown; to?: unknown };
    const s = (x: unknown) => (typeof x === "string" ? x : null);
    return { kind, from: s(v.from), to: s(v.to) };
  } catch {
    return null;
  }
}

/* Formatted from the YYYY-MM-DD string itself, not through Date or Intl: no
   timezone can move the day, and the output doesn't vary with the runtime's
   ICU data ("Sep" in one, "Sept" in another). */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1] ?? "?"}`;

/** The sentence after the author's name, e.g. "moved the due date from 4 Sep to 20 Sep". */
export function describeActivity(a: TaskActivity, nameOf: (email: string) => string): string {
  switch (a.kind) {
    case "due_date_changed":
      if (!a.from && a.to) return `set the due date to ${shortDate(a.to)}`;
      if (a.from && !a.to) return `removed the due date (was ${shortDate(a.from)})`;
      return `moved the due date from ${shortDate(a.from!)} to ${shortDate(a.to!)}`;
    case "reassigned":
      return a.from
        ? `handed this from ${nameOf(a.from)} to ${a.to ? nameOf(a.to) : "nobody"}`
        : `handed this to ${a.to ? nameOf(a.to) : "nobody"}`;
    case "status_changed":
      return a.to === "done" ? "marked this done" : "reopened this";
  }
}
