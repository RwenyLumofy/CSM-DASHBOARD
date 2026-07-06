"use server";

/* Mutations for the AI action feed (the revamped Action List). Every call is
   authorized server-side by the action's client being visible to the caller
   (see lib/data.ts). Shared by the global Action List page and the per-client
   Actions tab. */

import {
  regenerateActionsForClient,
  regenerateMyClientActions,
  setClientActionStatus,
} from "@/lib/data";

export async function dismissClientActionAction(id: string): Promise<{ ok: boolean }> {
  try {
    await setClientActionStatus(id, "dismissed");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function reopenClientActionAction(id: string): Promise<{ ok: boolean }> {
  try {
    await setClientActionStatus(id, "open");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** Regenerate one client's actions (per-client "Regenerate"). */
export async function regenerateClientActionsAction(clientId: string): Promise<{ ok: boolean }> {
  try {
    await regenerateActionsForClient(clientId);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** Regenerate actions across every client the caller can see (global button). */
export async function regenerateAllClientActionsAction(): Promise<{ ok: boolean }> {
  try {
    await regenerateMyClientActions();
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
