/* Drizzle-backed repository for client_notes. Server-only; used only when
   DATABASE_URL is set. Every read/write is bounded by withDbTimeout so a
   stalled query fails fast into the caller's fallback instead of hanging the
   request (matches lib/repo/drizzle.ts's discipline). */

import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { getDb, schema, withDbTimeout } from "@/lib/db/client";
import type { Note, NoteInput } from "@/lib/notes/types";

type NoteRow = typeof schema.clientNotes.$inferSelect;

function iso(d: Date): string {
  return d.toISOString();
}

function rowToNote(r: NoteRow): Note {
  return {
    id: r.id,
    clientId: r.clientId,
    dealId: r.dealId,
    body: r.body,
    createdByEmail: r.createdByEmail,
    createdByName: r.createdByName,
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
  };
}

export async function getNotesByClient(clientId: string): Promise<Note[]> {
  const db = getDb();
  const rows = await withDbTimeout(
    db.select().from(schema.clientNotes).where(eq(schema.clientNotes.clientId, clientId)).orderBy(desc(schema.clientNotes.createdAt)),
  );
  return rows.map(rowToNote);
}

/** Note id → its clientId (for authorizing edits/deletes). */
export async function getNoteClientId(noteId: string): Promise<string | null> {
  const db = getDb();
  const rows = await withDbTimeout(
    db.select({ clientId: schema.clientNotes.clientId }).from(schema.clientNotes).where(eq(schema.clientNotes.id, noteId)).limit(1),
  );
  return rows[0]?.clientId ?? null;
}

export async function insertNote(input: {
  clientId: string;
  data: NoteInput;
  createdByEmail: string | null;
  createdByName: string | null;
}): Promise<Note> {
  const db = getDb();
  const now = new Date();
  const row = {
    id: `note-${randomUUID()}`,
    clientId: input.clientId,
    dealId: input.data.dealId ?? null,
    body: input.data.body,
    createdByEmail: input.createdByEmail,
    createdByName: input.createdByName,
    createdAt: now,
    updatedAt: now,
  };
  await withDbTimeout(db.insert(schema.clientNotes).values(row));
  return rowToNote(row as NoteRow);
}

export async function updateNote(noteId: string, patch: Partial<NoteInput>): Promise<void> {
  const db = getDb();
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.body !== undefined) set.body = patch.body;
  if (patch.dealId !== undefined) set.dealId = patch.dealId ?? null;
  await withDbTimeout(db.update(schema.clientNotes).set(set).where(eq(schema.clientNotes.id, noteId)));
}

export async function deleteNote(noteId: string): Promise<void> {
  const db = getDb();
  await withDbTimeout(db.delete(schema.clientNotes).where(eq(schema.clientNotes.id, noteId)));
}
