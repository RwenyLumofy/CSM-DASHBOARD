"use server";

/* =========================================================================
   Stakeholder profile + relationship mutations.

   PERMISSIONS. Writes gate on canEditClient(), not on "can you see it".
   That distinction matters and the neighbouring actions get it wrong today:
   contact-actions.ts and note-actions.ts guard with getClientById(), which
   applies canSeeClient — a READ gate. A `guest` (the explicitly read-only
   tier) therefore passes it and can add and delete contacts. Nothing here
   repeats that: canEditClient rejects guests outright and, for a scoped
   operator, admits only accounts they actually own.

   VALIDATION runs here as well as in the form. The client-side copy is for
   fast feedback; this one is the one that counts, because a server action is
   a public endpoint — anything the browser can call, a script can call.
   ========================================================================= */

import { revalidatePath } from "next/cache";
import { canEditClient, getCurrentUserEmail } from "@/lib/auth";
import { getClientById } from "@/lib/data";
import { hasDatabase } from "@/lib/config";
import {
  LINK_KINDS, STAKEHOLDER_ROLES, COMMUNICATION_CHANNELS, INFLUENCE_LEVELS,
  DECISION_AUTHORITY, SENTIMENTS, RELATIONSHIP_STRENGTHS, ENGAGEMENT_STATUSES,
  normalizeStakeholderProfile, normalizeStakeholderProfiles, normalizeStakeholderLinks,
  PROFILES_KEY, LINKS_KEY,
  type StakeholderProfile, type StakeholderLink,
} from "@/lib/stakeholders/profile";

export interface StakeholderResult {
  ok: boolean;
  error?: string;
  /** Field-level errors, keyed by field name, for inline form display. */
  fieldErrors?: Record<string, string>;
  profile?: StakeholderProfile;
  link?: StakeholderLink;
}

/** Shared write gate. Returns the client when the caller may edit it. */
async function guard(clientId: string): Promise<{ error: StakeholderResult } | { ok: true }> {
  if (!hasDatabase()) return { error: { ok: false, error: "No database configured." } };
  const client = await getClientById(clientId);
  // getClientById already applies canSeeClient, so a null here means "not
  // found OR not yours" — deliberately indistinguishable to an id-guesser.
  if (!client) return { error: { ok: false, error: "Not found, or you don't have access to this account." } };
  if (!(await canEditClient(client))) {
    return { error: { ok: false, error: "You don't have permission to edit this account." } };
  }
  return { ok: true };
}

async function readCurrent(clientId: string): Promise<{ profiles: StakeholderProfile[]; links: StakeholderLink[] }> {
  const client = await getClientById(clientId);
  const props = (client?.properties ?? {}) as Record<string, unknown>;
  const profiles = normalizeStakeholderProfiles(props[PROFILES_KEY]);
  return { profiles, links: normalizeStakeholderLinks(props[LINKS_KEY], new Set(profiles.map((p) => p.id))) };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t.slice(0, 500) : null;
};

export interface StakeholderInput {
  id?: string;
  contactId?: string | null;
  firstName?: string; lastName?: string; preferredName?: string;
  jobTitle?: string; department?: string; company?: string; location?: string; photoUrl?: string;
  email?: string; phone?: string; mobile?: string; linkedinUrl?: string;
  preferredChannel?: string; timezone?: string;
  roles?: string[];
  influence?: string; decisionAuthority?: string; sentiment?: string;
  relationshipStrength?: string; engagementStatus?: string;
  ownerEmail?: string; lastContactedAt?: string; nextEngagementAt?: string;
  notes?: string; tags?: string[];
}

/**
 * Create or update a stakeholder.
 *
 * REQUIRED FIELDS are deliberately minimal — a name OR an email. A CSM often
 * learns "there's a procurement lead called Fatima" before they have her email,
 * and a form that refuses that forces the knowledge into a private note where
 * nobody else can see it.
 */
export async function saveStakeholderAction(clientId: string, input: StakeholderInput): Promise<StakeholderResult> {
  const g = await guard(clientId);
  if ("error" in g) return g.error;

  const fieldErrors: Record<string, string> = {};
  const firstName = clean(input.firstName);
  const lastName = clean(input.lastName);
  const email = clean(input.email)?.toLowerCase() ?? null;

  if (!firstName && !lastName && !email) {
    fieldErrors.firstName = "Enter a name or an email address.";
  }
  if (email && !EMAIL_RE.test(email)) fieldErrors.email = "That doesn't look like an email address.";
  const linkedinUrl = clean(input.linkedinUrl);
  if (linkedinUrl && !/^https?:\/\//i.test(linkedinUrl)) {
    fieldErrors.linkedinUrl = "Enter a full URL starting with https://";
  }
  for (const [key, val] of [["lastContactedAt", input.lastContactedAt], ["nextEngagementAt", input.nextEngagementAt]] as const) {
    const d = clean(val);
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) fieldErrors[key] = "Use the date picker.";
  }

  const { profiles } = await readCurrent(clientId);
  const isNew = !input.id;
  const existing = input.id ? profiles.find((p) => p.id === input.id) : undefined;
  if (input.id && !existing) return { ok: false, error: "That stakeholder no longer exists — it may have been removed." };

  // DUPLICATE DETECTION on email within this account. Advisory for an edit of
  // the same record, blocking for a genuinely different one.
  if (email) {
    const clash = profiles.find((p) => p.email === email && p.id !== input.id);
    if (clash) fieldErrors.email = `${clash.firstName ?? clash.email} is already mapped on this account with that email.`;
  }

  if (Object.keys(fieldErrors).length) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };

  const editor = await getCurrentUserEmail();
  const now = new Date().toISOString();
  const pick = <T extends string>(allowed: readonly T[], v: unknown, fallback: T): T =>
    typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

  // Round-trip through the normalizer so exactly one shape can ever be written.
  const profile = normalizeStakeholderProfile({
    id: existing?.id ?? `sh_${globalThis.crypto.randomUUID()}`,
    contactId: input.contactId ?? existing?.contactId ?? null,
    firstName, lastName,
    preferredName: clean(input.preferredName),
    jobTitle: clean(input.jobTitle),
    department: clean(input.department),
    company: clean(input.company),
    location: clean(input.location),
    photoUrl: clean(input.photoUrl),
    email,
    phone: clean(input.phone),
    mobile: clean(input.mobile),
    linkedinUrl,
    preferredChannel: pick(COMMUNICATION_CHANNELS, input.preferredChannel, "unknown"),
    timezone: clean(input.timezone),
    roles: (input.roles ?? []).filter((r) => (STAKEHOLDER_ROLES as readonly string[]).includes(r)),
    influence: pick(INFLUENCE_LEVELS, input.influence, "unknown"),
    decisionAuthority: pick(DECISION_AUTHORITY, input.decisionAuthority, "unknown"),
    sentiment: pick(SENTIMENTS, input.sentiment, "unknown"),
    relationshipStrength: pick(RELATIONSHIP_STRENGTHS, input.relationshipStrength, "unknown"),
    engagementStatus: pick(ENGAGEMENT_STATUSES, input.engagementStatus, "unknown"),
    ownerEmail: clean(input.ownerEmail)?.toLowerCase() ?? null,
    lastContactedAt: clean(input.lastContactedAt),
    nextEngagementAt: clean(input.nextEngagementAt),
    notes: clean(input.notes),
    tags: (input.tags ?? []).map((t) => String(t).trim()).filter(Boolean).slice(0, 20),
    // Creation audit survives an edit; update audit always reflects this write.
    createdAt: existing?.createdAt ?? now,
    createdBy: existing?.createdBy ?? editor,
    updatedAt: now,
    updatedBy: editor,
  });
  if (!profile) return { ok: false, error: "Could not build a valid stakeholder record." };

  try {
    const { upsertStakeholderProfileDb } = await import("@/lib/repo/drizzle");
    await upsertStakeholderProfileDb(clientId, profile as unknown as { id: string } & Record<string, unknown>);
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, profile };
  } catch (e) {
    return { ok: false, error: `Couldn't save${isNew ? " the new stakeholder" : ""}: ${String(e)}` };
  }
}

/**
 * Remove a stakeholder from THIS ACCOUNT.
 *
 * This deletes the account-scoped relationship record. It does NOT delete the
 * underlying synced Contact — that belongs to HubSpot and would return on the
 * next sync anyway. The UI states that distinction before confirming, because
 * "remove" meaning two different things is how people delete the wrong thing.
 */
export async function deleteStakeholderAction(clientId: string, stakeholderId: string): Promise<StakeholderResult> {
  const g = await guard(clientId);
  if ("error" in g) return g.error;
  if (!stakeholderId) return { ok: false, error: "Missing stakeholder." };
  try {
    const { deleteStakeholderProfileDb } = await import("@/lib/repo/drizzle");
    await deleteStakeholderProfileDb(clientId, stakeholderId); // cascades to links
    revalidatePath(`/clients/${clientId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function saveStakeholderLinkAction(
  clientId: string,
  input: { id?: string; fromId: string; toId: string; kind: string; note?: string },
): Promise<StakeholderResult> {
  const g = await guard(clientId);
  if ("error" in g) return g.error;
  if (!input.fromId || !input.toId) return { ok: false, error: "Pick both stakeholders." };
  if (input.fromId === input.toId) return { ok: false, error: "A stakeholder can't be related to themselves." };

  const { profiles, links } = await readCurrent(clientId);
  const ids = new Set(profiles.map((p) => p.id));
  if (!ids.has(input.fromId) || !ids.has(input.toId)) {
    return { ok: false, error: "One of those stakeholders no longer exists." };
  }
  const kind = (LINK_KINDS as readonly string[]).includes(input.kind) ? (input.kind as StakeholderLink["kind"]) : "works_with";

  // "Reports to" is the only hierarchical link, so it's the only one that can
  // form a management cycle. Walk up from the proposed manager: if we come back
  // to the report, the edge would make the org chart unrenderable.
  if (kind === "reports_to") {
    const managerOf = new Map(links.filter((l) => l.kind === "reports_to").map((l) => [l.fromId, l.toId]));
    let cursor: string | undefined = input.toId;
    const walked = new Set<string>();
    while (cursor && !walked.has(cursor)) {
      if (cursor === input.fromId) {
        return { ok: false, error: "That would create a reporting loop — they already report up to this person." };
      }
      walked.add(cursor);
      cursor = managerOf.get(cursor);
    }
    const already = links.find((l) => l.kind === "reports_to" && l.fromId === input.fromId && l.id !== input.id);
    if (already) return { ok: false, error: "This stakeholder already reports to someone. Remove that first." };
  }

  const editor = await getCurrentUserEmail();
  const existing = input.id ? links.find((l) => l.id === input.id) : undefined;
  const link: StakeholderLink = {
    id: existing?.id ?? `lk_${globalThis.crypto.randomUUID()}`,
    fromId: input.fromId,
    toId: input.toId,
    kind,
    note: clean(input.note),
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    createdBy: existing?.createdBy ?? editor,
  };
  try {
    const { upsertStakeholderLinkDb } = await import("@/lib/repo/drizzle");
    await upsertStakeholderLinkDb(clientId, link as unknown as { id: string } & Record<string, unknown>);
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, link };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function deleteStakeholderLinkAction(clientId: string, linkId: string): Promise<StakeholderResult> {
  const g = await guard(clientId);
  if ("error" in g) return g.error;
  if (!linkId) return { ok: false, error: "Missing relationship." };
  try {
    const { deleteStakeholderLinkDb } = await import("@/lib/repo/drizzle");
    await deleteStakeholderLinkDb(clientId, linkId);
    revalidatePath(`/clients/${clientId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/* -------------------------------------------------------------------------
   The stakeholder MAPPING matrix (properties.stakeholder_mappings) is retired.

   Its writer lived here. It is deleted rather than left behind a disabled
   button because a server action is reachable by anyone who can construct the
   request — hiding the UI would have left the write path open, and a single
   recreated mapping would put the account back into the two-sources state this
   cutover exists to end.

   The DATA is deliberately still there. Every one of the 107 role associations
   was migrated into stakeholder_profiles with provenance naming the row it came
   from, and the legacy key stays untouched as rollback evidence until the
   cutover is formally accepted. Dropping it is a separate, reviewed change.
   ------------------------------------------------------------------------- */
