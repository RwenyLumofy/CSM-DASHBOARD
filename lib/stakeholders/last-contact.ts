/* =========================================================================
   Effective last contact — when we last actually heard from or wrote to a
   stakeholder.

   WHY THIS EXISTS. `lastContactedAt` is typed by hand in the Stakeholder
   drawer and nothing else ever moves it. The team emails Beyon's champions
   every week through HubSpot, yet the coverage card called James Farrell
   silent for 65 days because nobody re-typed the date. A CSM should not have
   to transcribe their inbox into Signal for a warning to stay honest.

   THE RULE. The effective date is the LATEST of:
     - the manual `lastContactedAt`;
     - the newest `client_emails` row on the account whose from/to lists the
       stakeholder's address (`;`-separated, case-insensitive, whole address —
       "ames@x.com" must not match "james@x.com");
     - the newest note that @mentions them (client_note_mentions), dated by
       when it happened (`occurred_at`), else when it was written. Deleted
       notes don't count.

   NOTE MENTIONS CAN'T NAME A CLIENT YET. The note composer only lets you
   @mention Signal users who can see the account, and the server strips any
   other token (note-actions.ts, filterMentions). So today the note source
   never fires for an external stakeholder; it is wired so that it starts
   working the day the picker offers the account's stakeholders.

   MEETINGS ARE NOT COUNTED. client_meetings carries no attendee list, so a
   meeting on the account cannot be attributed to any one person. Counting it
   for everybody would make the whole roster look engaged off one call.

   The manual date is kept separate and never overwritten: the drawer edits it,
   and a derived date saved back as "manual" would freeze activity in place.
   On a tie the manual date wins the label — a CSM's deliberate record is the
   more specific claim.

   Pure: callers pass rows already loaded for the profile page.
   ========================================================================= */

import type { StakeholderProfile } from "./profile";

export type LastContactSource = "manual" | "email" | "note";

export interface LastContact {
  /** ISO date (YYYY-MM-DD, UTC). */
  date: string;
  source: LastContactSource;
}

export const LAST_CONTACT_SOURCE_LABEL: Record<LastContactSource, string> = {
  manual: "entered by hand",
  email: "email",
  note: "note mention",
};

export interface ContactEmail {
  fromEmail: string | null;
  toEmail: string | null;
  sentAt: string | null;
}

export interface ContactNote {
  /** Lower-cased emails named in the note. */
  mentions: string[];
  occurredAt: string | null;
  createdAt: string;
  deletedAt?: string | null;
}

export interface ContactActivity {
  emails: ContactEmail[];
  notes: ContactNote[];
}

/** Every address in a `;`-separated header field, lower-cased. Tolerates
 *  commas and `Name <addr>` in case the sync ever starts sending them. */
export function addressesIn(field: string | null): string[] {
  if (!field) return [];
  return field.split(/[;,]/)
    .map((part) => (part.match(/<([^>]+)>/)?.[1] ?? part).trim().toLowerCase())
    .filter((a) => a.includes("@"));
}

/** UTC calendar date of an ISO timestamp, or null if it isn't one. */
function dayOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
}

function keepLatest(index: Map<string, string>, address: string, day: string) {
  const prev = index.get(address);
  if (!prev || day > prev) index.set(address, day);
}

/** address → newest email day and newest note-mention day. Built once per
 *  account so each stakeholder is a lookup, not a scan. */
export function indexActivity({ emails, notes }: ContactActivity) {
  const email = new Map<string, string>();
  const note = new Map<string, string>();
  for (const e of emails) {
    // An email with no send time has no honest date; createdAt is when the
    // sync ran, which would make every old email look like yesterday.
    const day = dayOf(e.sentAt);
    if (!day) continue;
    for (const a of new Set([...addressesIn(e.fromEmail), ...addressesIn(e.toEmail)])) keepLatest(email, a, day);
  }
  for (const n of notes) {
    if (n.deletedAt) continue;
    const day = dayOf(n.occurredAt) ?? dayOf(n.createdAt);
    if (!day) continue;
    for (const m of n.mentions) keepLatest(note, m.trim().toLowerCase(), day);
  }
  return { email, note };
}

export type ActivityIndex = ReturnType<typeof indexActivity>;

export function effectiveLastContact(
  p: Pick<StakeholderProfile, "email" | "lastContactedAt">,
  index: ActivityIndex,
): LastContact | null {
  const candidates: LastContact[] = [];
  const manual = p.lastContactedAt?.slice(0, 10);
  if (manual) candidates.push({ date: manual, source: "manual" });
  const address = p.email?.trim().toLowerCase();
  if (address) {
    const e = index.email.get(address);
    if (e) candidates.push({ date: e, source: "email" });
    const n = index.note.get(address);
    if (n) candidates.push({ date: n, source: "note" });
  }
  // Candidates are pushed manual → email → note, so a strict `>` keeps the
  // earlier source on a tie.
  return candidates.reduce<LastContact | null>((best, c) => (!best || c.date > best.date ? c : best), null);
}

/** Profile id → effective last contact, for every profile that has one. */
export function lastContactByStakeholder(
  profiles: Pick<StakeholderProfile, "id" | "email" | "lastContactedAt">[],
  activity: ContactActivity,
): Record<string, LastContact> {
  const index = indexActivity(activity);
  const out: Record<string, LastContact> = {};
  for (const p of profiles) {
    const lc = effectiveLastContact(p, index);
    if (lc) out[p.id] = lc;
  }
  return out;
}
