"use server";

/* Notes CRUD for a client profile. Authorization mirrors the contacts/
   attachments pattern: any user who can VIEW the account (its CSM owner, its
   implementation owner, or a super-admin — getClientById is already
   role-scoped) may add/edit/delete its notes. Edits/deletes additionally
   verify the note actually belongs to the account being edited, so a
   visible account can never be used as a lever to touch another account's
   note. A note's optional dealId is checked against that same account's
   deals so a note can't be tagged to a deal it doesn't own. */

import { getClientById, getDealsForClient } from "@/lib/data";
import { getCurrentActor } from "@/lib/projects/actor";
import { clientIdForNote, createNote, editNote, removeNote } from "@/lib/notes/data";
import { sanitizeNoteBody } from "@/lib/notes/sanitize";
import type { Note, NoteInput } from "@/lib/notes/types";

export interface NoteActionResult {
  ok: boolean;
  error?: string;
}

async function guard(clientId: string): Promise<NoteActionResult | null> {
  const client = await getClientById(clientId);
  if (!client) return { ok: false, error: "Not found or you don't have access to this account." };
  return null;
}

async function guardOwned(clientId: string, noteId: string): Promise<NoteActionResult | null> {
  const blocked = await guard(clientId);
  if (blocked) return blocked;
  const rowClientId = await clientIdForNote(noteId);
  if (rowClientId !== clientId) return { ok: false, error: "That note no longer exists on this account." };
  return null;
}

/** A note's dealId must belong to the same account, or be cleared. */
async function resolveDealId(clientId: string, dealId: string | null | undefined): Promise<string | null> {
  if (!dealId) return null;
  const deals = await getDealsForClient(clientId);
  return deals.some((d) => d.id === dealId) ? dealId : null;
}

export async function createNoteAction(clientId: string, input: NoteInput): Promise<NoteActionResult & { note?: Note }> {
  const blocked = await guard(clientId);
  if (blocked) return blocked;
  try {
    const body = sanitizeNoteBody(input.body).trim();
    if (!body) return { ok: false, error: "The note can't be empty." };
    const actor = await getCurrentActor();
    const note = await createNote({
      clientId,
      data: { body, dealId: await resolveDealId(clientId, input.dealId) },
      createdByEmail: actor.email,
      createdByName: actor.name,
    });
    return { ok: true, note };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function updateNoteAction(clientId: string, noteId: string, patch: Partial<NoteInput>): Promise<NoteActionResult> {
  const blocked = await guardOwned(clientId, noteId);
  if (blocked) return blocked;
  try {
    const clean: Partial<NoteInput> = { ...patch };
    if (patch.body !== undefined) {
      const body = sanitizeNoteBody(patch.body).trim();
      if (!body) return { ok: false, error: "The note can't be empty." };
      clean.body = body;
    }
    if (patch.dealId !== undefined) clean.dealId = await resolveDealId(clientId, patch.dealId);
    await editNote(noteId, clean);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function deleteNoteAction(clientId: string, noteId: string): Promise<NoteActionResult> {
  const blocked = await guardOwned(clientId, noteId);
  if (blocked) return blocked;
  try {
    await removeNote(noteId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
