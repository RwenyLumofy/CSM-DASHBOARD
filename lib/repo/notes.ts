/* Drizzle-backed repository for client_notes. Server-only; used only when
   DATABASE_URL is set. Every read/write is bounded by withDbTimeout so a
   stalled query fails fast into the caller's fallback instead of hanging the
   request (matches lib/repo/drizzle.ts's discipline).

   Deletes are SOFT. A note is the record CSMs cite in renewal conversations,
   and once a task carries source_id = <note id> a hard delete makes that
   task's provenance silently a lie. task_updates settled the same rule for
   Signal in its own schema header. Every read therefore filters deletedAt. */

import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb, schema, withDbTimeout } from "@/lib/db/client";
import { DEFAULT_NOTE_TYPE, isNoteType, type Note, type NoteInput } from "@/lib/notes/types";

type NoteRow = typeof schema.clientNotes.$inferSelect;

function iso(d: Date): string {
  return d.toISOString();
}

function rowToNote(r: NoteRow, mentions: string[] = []): Note {
  return {
    id: r.id,
    clientId: r.clientId,
    dealId: r.dealId,
    // Defensive: `type` is a free text column, so a value written by anything
    // other than this module must not become an unrenderable note.
    type: isNoteType(r.type) ? r.type : DEFAULT_NOTE_TYPE,
    body: r.body,
    occurredAt: r.occurredAt ? iso(r.occurredAt) : null,
    meetingId: r.meetingId,
    createdByEmail: r.createdByEmail,
    createdByName: r.createdByName,
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
    mentions,
  };
}

/** Mentions for a set of notes, as noteId → emails. One query, not N. */
async function mentionsFor(noteIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (noteIds.length === 0) return out;
  const db = getDb();
  const rows = await withDbTimeout(
    db.select({ noteId: schema.clientNoteMentions.noteId, email: schema.clientNoteMentions.mentionedEmail })
      .from(schema.clientNoteMentions)
      .where(inArray(schema.clientNoteMentions.noteId, noteIds)),
  );
  for (const r of rows) out.set(r.noteId, [...(out.get(r.noteId) ?? []), r.email]);
  return out;
}

/** Newest first by when the thing HAPPENED, falling back to when it was
 *  written — so a note about last Tuesday files under last Tuesday. */
export async function getNotesByClient(clientId: string, limit = 200): Promise<Note[]> {
  const db = getDb();
  const rows = await withDbTimeout(
    db.select().from(schema.clientNotes)
      .where(and(eq(schema.clientNotes.clientId, clientId), isNull(schema.clientNotes.deletedAt)))
      .orderBy(desc(sql`coalesce(${schema.clientNotes.occurredAt}, ${schema.clientNotes.createdAt})`))
      .limit(limit),
  );
  const byNote = await mentionsFor(rows.map((r) => r.id));
  return rows.map((r) => rowToNote(r, byNote.get(r.id) ?? []));
}

/** Note id → its clientId (for authorizing edits/deletes). A soft-deleted note
 *  resolves to null: it must not be editable, only auditable. */
export async function getNoteClientId(noteId: string): Promise<string | null> {
  const db = getDb();
  const rows = await withDbTimeout(
    db.select({ clientId: schema.clientNotes.clientId }).from(schema.clientNotes)
      .where(and(eq(schema.clientNotes.id, noteId), isNull(schema.clientNotes.deletedAt)))
      .limit(1),
  );
  return rows[0]?.clientId ?? null;
}

/** Replace a note's mention index. The body's tokens place the chips; these
 *  rows are the authority for who was named.
 *
 *  NOT YET WIRED TO NOTIFICATIONS. Naming somebody in a note records them here
 *  and draws their chip, but nobody is told — there is no `note_mentioned`
 *  NotificationType and no insert on the write path, unlike postTaskUpdateAction.
 *  Kept as a separate change so it can be written against the notification
 *  union once the notifications centre lands. */
async function setMentions(noteId: string, clientId: string, emails: string[]): Promise<void> {
  const db = getDb();
  await withDbTimeout(db.delete(schema.clientNoteMentions).where(eq(schema.clientNoteMentions.noteId, noteId)));
  const unique = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (unique.length === 0) return;
  await withDbTimeout(db.insert(schema.clientNoteMentions).values(
    unique.map((email) => ({ id: `nmn-${randomUUID()}`, noteId, clientId, mentionedEmail: email })),
  ));
}

export async function insertNote(input: {
  clientId: string;
  data: NoteInput;
  createdByEmail: string | null;
  createdByName: string | null;
  mentions?: string[];
}): Promise<Note> {
  const db = getDb();
  const now = new Date();
  const row = {
    id: `note-${randomUUID()}`,
    clientId: input.clientId,
    dealId: input.data.dealId ?? null,
    type: input.data.type ?? DEFAULT_NOTE_TYPE,
    body: input.data.body,
    occurredAt: input.data.occurredAt ? new Date(input.data.occurredAt) : null,
    meetingId: input.data.meetingId ?? null,
    deletedAt: null,
    createdByEmail: input.createdByEmail,
    createdByName: input.createdByName,
    createdAt: now,
    updatedAt: now,
  };
  await withDbTimeout(db.insert(schema.clientNotes).values(row));
  const mentions = input.mentions ?? [];
  if (mentions.length) await setMentions(row.id, input.clientId, mentions);
  return rowToNote(row as NoteRow, mentions);
}

export async function updateNote(
  noteId: string,
  patch: Partial<NoteInput>,
  mentions?: string[],
): Promise<void> {
  const db = getDb();
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.body !== undefined) set.body = patch.body;
  if (patch.dealId !== undefined) set.dealId = patch.dealId ?? null;
  if (patch.type !== undefined) set.type = patch.type;
  if (patch.meetingId !== undefined) set.meetingId = patch.meetingId ?? null;
  if (patch.occurredAt !== undefined) set.occurredAt = patch.occurredAt ? new Date(patch.occurredAt) : null;
  await withDbTimeout(db.update(schema.clientNotes).set(set).where(eq(schema.clientNotes.id, noteId)));

  if (mentions !== undefined) {
    const rows = await withDbTimeout(
      db.select({ clientId: schema.clientNotes.clientId }).from(schema.clientNotes)
        .where(eq(schema.clientNotes.id, noteId)).limit(1),
    );
    const clientId = rows[0]?.clientId;
    if (clientId) await setMentions(noteId, clientId, mentions);
  }
}

/** Soft delete. The row is retained so a task created from this note keeps a
 *  resolvable provenance; every read filters it out. */
export async function deleteNote(noteId: string): Promise<void> {
  const db = getDb();
  await withDbTimeout(
    db.update(schema.clientNotes).set({ deletedAt: new Date() }).where(eq(schema.clientNotes.id, noteId)),
  );
}
