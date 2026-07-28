"use server";

/* Today — persist the viewer's triage decision on a priority.

   "Mark reviewed" and "Snooze" used to be local React state: they looked like
   logging and vanished on refresh. A priority isn't a client_action (it's
   derived per render), so there's no row to dismiss — the decision itself is
   what we store, per user. See lib/today/triage.ts. */

import { revalidatePath } from "next/cache";
import { getCurrentUserEmail } from "@/lib/auth";
import { hasDatabase } from "@/lib/config";
import { priorityFingerprint, setTriageEntry, type TriageEntry } from "@/lib/today/triage";

export interface TriageResult { ok: boolean; error?: string }

/**
 * @param decision  "reviewed" (acknowledge, stays visible but dimmed),
 *                  "snoozed" (hide until `untilDays` from now),
 *                  or null to undo.
 */
export async function setPriorityTriageAction(input: {
  priorityId: string;
  state: string;
  reason: string;
  decision: "reviewed" | "snoozed" | null;
  untilDays?: number;
}): Promise<TriageResult> {
  const email = await getCurrentUserEmail();
  if (!email) return { ok: false, error: "Not signed in." };
  if (!hasDatabase()) return { ok: false, error: "No database configured." };
  if (!input.priorityId) return { ok: false, error: "Missing priority." };

  let entry: TriageEntry | null = null;
  if (input.decision) {
    // A snooze always has an end date — never a permanent mute, which is how
    // the client_actions dismissal quietly buries recurring problems.
    const days = Number.isFinite(input.untilDays) ? Math.max(1, Math.min(90, Number(input.untilDays))) : 7;
    entry = {
      state: input.decision,
      until: input.decision === "snoozed" ? new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10) : null,
      fingerprint: priorityFingerprint(input.state, input.reason),
      decidedAt: new Date().toISOString(),
    };
  }

  try {
    await setTriageEntry(email, input.priorityId, entry);
    revalidatePath("/today");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
