/* =========================================================================
   Notes data facade (server-only). Sits between the server actions / pages
   and the drizzle repo (lib/repo/notes.ts), following the app's house style:
   reads degrade gracefully to empty on DB trouble; writes throw when the DB
   isn't configured. Authorization (client visibility) is the caller's job —
   see app/(app)/clients/[id]/note-actions.ts.
   ========================================================================= */

import "server-only";
import { hasDatabase } from "@/lib/config";
import { dbHealthy, markDbHealthy, markDbUnhealthy } from "@/lib/db/health";
import type { Note, NoteInput } from "@/lib/notes/types";
import * as repo from "@/lib/repo/notes";

export async function getNotesForClient(clientId: string): Promise<Note[]> {
  if (hasDatabase() && dbHealthy()) {
    try {
      const notes = await repo.getNotesByClient(clientId);
      markDbHealthy();
      return notes;
    } catch (err) {
      markDbUnhealthy();
      console.warn("[notes] getNotesForClient failed:", err);
    }
  }
  return [];
}

export async function createNote(input: {
  clientId: string;
  data: NoteInput;
  createdByEmail: string | null;
  createdByName: string | null;
}): Promise<Note> {
  if (!hasDatabase()) throw new Error("Database not configured");
  return repo.insertNote(input);
}

export async function editNote(noteId: string, patch: Partial<NoteInput>): Promise<void> {
  if (!hasDatabase()) throw new Error("Database not configured");
  await repo.updateNote(noteId, patch);
}

export async function removeNote(noteId: string): Promise<void> {
  if (!hasDatabase()) throw new Error("Database not configured");
  await repo.deleteNote(noteId);
}

/** Resolve the account a note belongs to, for visibility checks in the
 *  action layer (returns null if the row is gone). */
export async function clientIdForNote(noteId: string): Promise<string | null> {
  if (!hasDatabase()) return null;
  try {
    return await repo.getNoteClientId(noteId);
  } catch {
    return null;
  }
}
