/* =========================================================================
   How the notifications centre slices nine types into something a person can
   actually filter by.

   WHY BUCKETS AND NOT NINE CHIPS. The nine NotificationType values are written
   from the sender's point of view — "assignment_review" and
   "assignment_needs_admin" are two different code paths, but to the reader
   they are the same errand: an account assignment wants your attention. A row
   of nine chips makes the reader do that mapping themselves, every visit.

   These five are the questions people arrive with: is anything waiting on me
   about an account, about a task, about an account's health, about a profile I
   have to fill in, or is it housekeeping.
   ========================================================================= */

import type { Notification, NotificationType } from "@/lib/types";

export type NotificationGroup = "assignments" | "tasks" | "health" | "profiles" | "system";

export const GROUP_LABEL: Record<NotificationGroup, string> = {
  assignments: "Assignments",
  tasks: "Tasks & mentions",
  health: "Account health",
  profiles: "Account profiles",
  system: "System",
};

/** Display order of the filter chips, after "All". */
export const GROUP_ORDER: NotificationGroup[] = ["assignments", "tasks", "health", "profiles", "system"];

const BY_TYPE: Record<NotificationType, NotificationGroup> = {
  client_assigned: "assignments",
  assignment_review: "assignments",
  assignment_needs_admin: "assignments",
  task_assigned: "tasks",
  task_mentioned: "tasks",
  task_update: "tasks",
  health_changed: "health",
  profile_incomplete_red: "profiles",
  profile_incomplete_yellow: "profiles",
  system: "system",
};

/** The bucket a notification belongs to. Unknown types — a row written by a
 *  newer deploy than this client — fall to "system" rather than vanishing from
 *  every filter, which would make it unreachable through the UI entirely. */
export function groupOf(n: Pick<Notification, "type">): NotificationGroup {
  return BY_TYPE[n.type as NotificationType] ?? "system";
}
