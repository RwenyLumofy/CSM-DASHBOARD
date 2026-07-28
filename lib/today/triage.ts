import "server-only";

/* =========================================================================
   Priority triage state — "I've seen this" / "not now", made durable.

   Today's Mark reviewed and Snooze were `useState` Sets: they looked exactly
   like logging and evaporated on the next page load. The obvious fix —
   dismissClientActionAction — doesn't apply, because a PRIORITY is not a
   client_action. Priorities are derived per render in build.ts (`pri_{client}`)
   from health, renewal dates and usage; there is no row to update.

   So the decision itself is what gets stored, keyed by the person who made it.
   It lives in workspace_config under `today_triage:{email}` — deliberately
   migration-free, since adding a table to production isn't something this
   codebase can do from here.

   SNOOZE IS DATED, NOT PERMANENT. The existing client_actions dismissal is
   sticky forever (reconcileClientActionsDb explicitly respects it across
   regenerations), which quietly buries a signal that recurs next quarter.
   Here, "reviewed" clears the moment the underlying priority changes shape,
   and a snooze simply expires.
   ========================================================================= */

export interface TriageEntry {
  /** "reviewed" = acknowledged, stays visible but dimmed.
   *  "snoozed"  = hidden until `until`. */
  state: "reviewed" | "snoozed";
  /** ISO date (YYYY-MM-DD) a snooze expires on. Null for "reviewed". */
  until: string | null;
  /** Fingerprint of the priority when the decision was made — when the
   *  underlying situation changes (state or reason), the decision no longer
   *  applies and the item resurfaces. This is what stops a stale "reviewed"
   *  from hiding a genuinely new problem on the same account. */
  fingerprint: string;
  decidedAt: string;
}

export type TriageMap = Record<string, TriageEntry>;

const KEY = (email: string) => `today_triage:${email.toLowerCase()}`;

/** A priority's fingerprint — changes when the situation materially changes. */
export function priorityFingerprint(state: string, reason: string): string {
  return `${state}::${reason}`.slice(0, 200);
}

function normalize(raw: unknown): TriageMap {
  if (!raw || typeof raw !== "object") return {};
  const out: TriageMap = {};
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const e = v as Record<string, unknown>;
    const state = e.state === "snoozed" ? "snoozed" : e.state === "reviewed" ? "reviewed" : null;
    if (!state) continue;
    out[id] = {
      state,
      until: typeof e.until === "string" ? e.until : null,
      fingerprint: typeof e.fingerprint === "string" ? e.fingerprint : "",
      decidedAt: typeof e.decidedAt === "string" ? e.decidedAt : "",
    };
  }
  return out;
}

export async function getTriageMap(email: string | null): Promise<TriageMap> {
  if (!email) return {};
  try {
    const { getWorkspaceConfigFromDb } = await import("@/lib/repo/drizzle");
    return normalize(await getWorkspaceConfigFromDb(KEY(email)));
  } catch {
    return {};
  }
}

export async function setTriageEntry(
  email: string,
  priorityId: string,
  entry: TriageEntry | null,
): Promise<void> {
  const { getWorkspaceConfigFromDb, setWorkspaceConfigDb } = await import("@/lib/repo/drizzle");
  const key = KEY(email);
  const current = normalize(await getWorkspaceConfigFromDb(key));
  if (entry) current[priorityId] = entry;
  else delete current[priorityId];
  // Drop expired snoozes and anything decided over 180 days ago, so the blob
  // can't grow without bound.
  const today = new Date().toISOString().slice(0, 10);
  const floor = new Date(Date.now() - 180 * 86_400_000).toISOString().slice(0, 10);
  for (const [id, e] of Object.entries(current)) {
    if (e.state === "snoozed" && e.until && e.until < today) delete current[id];
    else if (e.decidedAt && e.decidedAt.slice(0, 10) < floor) delete current[id];
  }
  await setWorkspaceConfigDb(key, current);
}

/** How a stored decision applies to a priority as it looks RIGHT NOW. */
export function applyTriage(
  entry: TriageEntry | undefined,
  fingerprint: string,
  today: string,
): "hidden" | "reviewed" | "active" {
  if (!entry) return "active";
  // The situation moved on — the old decision doesn't cover it.
  if (entry.fingerprint && entry.fingerprint !== fingerprint) return "active";
  if (entry.state === "snoozed") return entry.until && entry.until <= today ? "active" : "hidden";
  return "reviewed";
}
