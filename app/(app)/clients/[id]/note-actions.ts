"use server";

/* Notes CRUD for a client profile. Authorization requires EDIT rights on the
   account (canEditClient, via denyClientWrite) — it previously mirrored the
   contacts/attachments pattern of gating on visibility alone, which let the
   read-only `guest` tier write notes. Edits/deletes additionally
   verify the note actually belongs to the account being edited, so a
   visible account can never be used as a lever to touch another account's
   note. A note's optional dealId is checked against that same account's
   deals so a note can't be tagged to a deal it doesn't own, and its optional
   meetingId against that account's meetings for the same reason.

   MENTIONS grant no access. The picker is built server-side from people who
   can already see the account, and every token is re-checked here on write —
   the browser's word for who may be named is never taken. They also do not
   NOTIFY yet: the mention is stored and rendered, and that is all. */

import { getDealsForClient, getMeetingsForClient } from "@/lib/data";
import { denyClientWrite, getCurrentUserRole } from "@/lib/auth";
import { getCurrentActor } from "@/lib/projects/actor";
import { hasDatabase } from "@/lib/config";
import { clientIdForNote, createNote, editNote, removeNote } from "@/lib/notes/data";
import { sanitizeNoteBody } from "@/lib/notes/sanitize";
import { extractMentions, filterMentions } from "@/lib/notes/mentions";
import { isNoteType, type Note, type NoteInput } from "@/lib/notes/types";

export interface NoteActionResult {
  ok: boolean;
  error?: string;
}

export interface MentionablePerson {
  email: string;
  name: string;
}

// Was canSeeClient (via getClientById) — a read gate on a write path, so the
// read-only `guest` tier could add, edit and delete notes.
async function guard(clientId: string): Promise<NoteActionResult | null> {
  const denied = await denyClientWrite(clientId);
  return denied ? { ok: false, error: denied } : null;
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

/** Same rule for the optional meeting: it must be one of this account's. */
async function resolveMeetingId(clientId: string, meetingId: string | null | undefined): Promise<string | null> {
  if (!meetingId) return null;
  const meetings = await getMeetingsForClient(clientId);
  return meetings.some((m) => m.id === meetingId) ? meetingId : null;
}

/** Everyone who may be named in a note on this account.
 *
 *  Uses the SAME server-built list as the task-update picker
 *  (getUsersWhoCanSeeClientDb) rather than a second implementation of "who can
 *  see this account". A note mention does not notify yet, but it is intended to,
 *  and the audience rule must not have drifted by the time it does. */
export async function listMentionableForClientAction(clientId: string): Promise<MentionablePerson[]> {
  if (!hasDatabase()) return [];
  const role = await getCurrentUserRole();
  if (!role || role === "guest") return [];
  const { getUsersWhoCanSeeClientDb } = await import("@/lib/repo/drizzle");
  return getUsersWhoCanSeeClientDb(clientId);
}

/** Sanitize, then keep only mention tokens naming somebody allowed. Returns
 *  the cleaned body and the authoritative mention list for the index table. */
async function prepareBody(clientId: string, raw: string): Promise<{ body: string; mentions: string[] }> {
  const allowed = new Set((await listMentionableForClientAction(clientId)).map((p) => p.email));
  const body = filterMentions(sanitizeNoteBody(raw), allowed).trim();
  return { body, mentions: extractMentions(body) };
}

function cleanType(t: unknown): NoteInput["type"] {
  return isNoteType(t) ? t : undefined;
}

/** A date is only meaningful when it parses and isn't in the future — a note
 *  records something that already happened. */
function cleanOccurredAt(v: string | null | undefined): string | null | undefined {
  if (v === undefined) return undefined;
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.getTime() > Date.now() + 86_400_000 ? null : d.toISOString();
}

export async function createNoteAction(clientId: string, input: NoteInput): Promise<NoteActionResult & { note?: Note }> {
  const blocked = await guard(clientId);
  if (blocked) return blocked;
  try {
    const { body, mentions } = await prepareBody(clientId, input.body);
    if (!body) return { ok: false, error: "The note can't be empty." };
    const actor = await getCurrentActor();
    const note = await createNote({
      clientId,
      data: {
        body,
        dealId: await resolveDealId(clientId, input.dealId),
        type: cleanType(input.type),
        occurredAt: cleanOccurredAt(input.occurredAt) ?? null,
        meetingId: await resolveMeetingId(clientId, input.meetingId),
      },
      createdByEmail: actor.email,
      createdByName: actor.name,
      mentions,
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
    const clean: Partial<NoteInput> = {};
    let mentions: string[] | undefined;
    if (patch.body !== undefined) {
      const prepared = await prepareBody(clientId, patch.body);
      if (!prepared.body) return { ok: false, error: "The note can't be empty." };
      clean.body = prepared.body;
      mentions = prepared.mentions;
    }
    if (patch.dealId !== undefined) clean.dealId = await resolveDealId(clientId, patch.dealId);
    if (patch.meetingId !== undefined) clean.meetingId = await resolveMeetingId(clientId, patch.meetingId);
    if (patch.type !== undefined) clean.type = cleanType(patch.type);
    if (patch.occurredAt !== undefined) clean.occurredAt = cleanOccurredAt(patch.occurredAt);
    await editNote(noteId, clean, mentions);
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
