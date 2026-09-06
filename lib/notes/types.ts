/* Domain types for the client-profile Notes tab. `body` is sanitized HTML
   authored via the Tiptap rich-text editor — see lib/notes/sanitize.ts for
   the only place untrusted HTML is allowed to enter the system. */

/** How the thing happened. A CHANNEL, not a category: each value changes what
 *  the composer asks for, rather than only colouring a badge. Only `meeting`
 *  can link a synced `client_meetings` row; `call` and `message` are events
 *  with a date but nothing to link; `note` has no event, so it needs no date.
 *  It is also what authors already write into the prose ("Spoke with Neena",
 *  "Contacted Haneen by phone", "raised via Whatsapp"). */
export const NOTE_TYPES = ["meeting", "call", "message", "note"] as const;
export type NoteType = (typeof NOTE_TYPES)[number];

/** Every note written before this shipped is a `note`, which is what the
 *  column defaults to — something written down, no event modelled behind it. */
export const DEFAULT_NOTE_TYPE: NoteType = "note";

export function isNoteType(v: unknown): v is NoteType {
  return typeof v === "string" && (NOTE_TYPES as readonly string[]).includes(v);
}

export interface Note {
  id: string;
  clientId: string;
  /** Optional association to one of the client's deals, for filtering. */
  dealId: string | null;
  type: NoteType;
  body: string; // sanitized HTML
  /** When it happened, if that differs from when it was written. Null on every
   *  pre-existing note, and readers fall back to `createdAt`. */
  occurredAt: string | null; // ISO
  /** Optional link to the meeting it is about — context, not the subject. */
  meetingId: string | null;
  createdByEmail: string | null;
  createdByName: string | null;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  /** Lower-cased emails of everyone named in the body. The `@[email]` tokens
   *  in `body` only place the chips; this is the authority. */
  mentions: string[];
}

export interface NoteInput {
  body: string;
  dealId?: string | null;
  type?: NoteType;
  occurredAt?: string | null;
  meetingId?: string | null;
}

/** The date a note should be filed under: when it happened if stated, else
 *  when it was written. The feed orders on this. */
export function noteDate(n: Pick<Note, "occurredAt" | "createdAt">): string {
  return n.occurredAt ?? n.createdAt;
}
