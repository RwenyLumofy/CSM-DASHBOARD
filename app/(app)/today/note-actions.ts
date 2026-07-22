"use server";

/* Today — read a scoped account's CSM notes for the account drawer. Reuses the
   client-profile notes store; authorization mirrors the notes page: getClientById
   is role-scoped, so a null result means no access. Read-only here — authoring
   still happens on the account's full page. */

import { getClientById } from "@/lib/data";
import { getNotesForClient } from "@/lib/notes/data";
import type { Note } from "@/lib/notes/types";

export async function getAccountNotesAction(accountId: string): Promise<{ ok: boolean; notes?: Note[]; error?: string }> {
  const client = await getClientById(accountId); // role-scoped → null if no access
  if (!client) return { ok: false, error: "You don't have access to this account." };
  try {
    const notes = await getNotesForClient(accountId);
    return { ok: true, notes };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
