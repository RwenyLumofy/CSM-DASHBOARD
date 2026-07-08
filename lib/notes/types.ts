/* Domain types for the client-profile Notes tab. `body` is sanitized HTML
   authored via the Tiptap rich-text editor — see lib/notes/sanitize.ts for
   the only place untrusted HTML is allowed to enter the system. */

export interface Note {
  id: string;
  clientId: string;
  /** Optional association to one of the client's deals, for filtering. */
  dealId: string | null;
  body: string; // sanitized HTML
  createdByEmail: string | null;
  createdByName: string | null;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export interface NoteInput {
  body: string;
  dealId?: string | null;
}
