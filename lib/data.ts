/* =========================================================================
   Data facade — the single entry point pages/components use to read & write.
   Always reads from the database. No sample/demo data fallback — if the DB
   is empty the app shows empty states.
   ========================================================================= */

import { cache } from "react";
import { randomUUID } from "node:crypto";
import type {
  ArrEvent,
  ArrEventInput,
  Attachment,
  Client,
  Contact,
  Csm,
  Deal,
  Email,
  Meeting,
  Notification,
  Playbook,
  PlaybookTask,
  PortfolioSummary,
  PropertyDefinition,
  RetentionMetrics,
  TimelineEvent,
} from "@/lib/types";
import {
  SAMPLE_PLAYBOOKS,
  sampleAppendArrEvent,
  sampleImportClients,
  tasksForClient,
} from "@/lib/sample/data";
import { SAMPLE_CSMS } from "@/lib/sample/csms";
import { buildPortfolioSummary } from "@/lib/metrics/portfolio";
import { computeRetention, downgrades } from "@/lib/metrics/retention";
import { currentQuarter, withRunningBalance } from "@/lib/metrics/arr";
import { env, hasDatabase } from "@/lib/config";
import { canSeeClient, getCurrentUserEmail, scopeClientsToUser } from "@/lib/auth";
import { DEFAULT_ROLE, DEFAULT_ROLE_LABELS, isRole, teamForRole, type Role, type Team } from "@/lib/roles";
import { dbHealthy, markDbHealthy, markDbUnhealthy } from "@/lib/db/health";
import { FIELD_OVERRIDES_KEY, RECOMPUTED_PROPERTY_FIELDS } from "@/lib/client-overrides";
import {
  appendArrEvent,
  getArrEventsByClient,
  getArrEventsFromDb,
  getAttachmentsByClient,
  getClientsFromDb,
  getContactsByClient,
  getDealsByClient,
  getEmailsByClient,
  getMeetingsByClient,
  importClientsDb,
} from "@/lib/repo/drizzle";

type Source = { clients: Client[]; arrEvents: ArrEvent[] };

// Per-request memoization: every getX() in a single render shares ONE load of
// the clients + arr_events tables instead of re-querying for each call.
const source = cache(loadSource);

async function loadSource(): Promise<Source> {
  if (hasDatabase() && dbHealthy()) {
    try {
      const [allClients, arrEvents] = await Promise.all([getClientsFromDb(), getArrEventsFromDb()]);
      markDbHealthy();
      // Role-scope: CSM tiers see only their own clients; super-admins see all.
      // Applied here so every downstream read (list, dashboard, ARR, retention)
      // is scoped consistently.
      const clients = await scopeClientsToUser(allClients);
      const visibleIds = new Set(clients.map((c) => c.id));
      const scopedEvents = clients.length === allClients.length ? arrEvents : arrEvents.filter((e) => visibleIds.has(e.clientId));
      return { clients, arrEvents: scopedEvents };
    } catch (err) {
      markDbUnhealthy();
      console.warn("[data] database read failed:", err);
    }
  }
  return { clients: [], arrEvents: [] };
}

export async function getClients(): Promise<Client[]> {
  const { clients } = await source();
  return clients;
}

export async function getActiveClients(): Promise<Client[]> {
  const { clients } = await source();
  return clients.filter((c) => c.status !== "churned");
}

// Cached per request: generateMetadata() and the page both call this with the
// same id — without the cache that's two full lookups per profile view.
export const getClientById = cache(async (id: string): Promise<Client | null> => {
  if (hasDatabase() && dbHealthy()) {
    try {
      const { getClientByIdFromDb } = await import("@/lib/repo/drizzle");
      const client = await getClientByIdFromDb(id);
      markDbHealthy();
      // Role-scope: a CSM can't open another CSM's client by guessing the URL.
      return (await canSeeClient(client)) ? client : null;
    } catch (err) {
      markDbUnhealthy();
      console.warn("[data] getClientById read failed:", err);
    }
  }
  return null;
});

export async function getPortfolioSummary(): Promise<PortfolioSummary> {
  const { clients } = await source();
  return buildPortfolioSummary(clients);
}

export async function getRetention(period = currentQuarter()): Promise<RetentionMetrics> {
  const { clients, arrEvents } = await source();
  return computeRetention(clients, arrEvents, period);
}

export async function getDowngrades(): Promise<{ client: Client; delta: number }[]> {
  const { clients } = await source();
  return downgrades(clients);
}

/* ---------- ARR ledger / contacts / attachments (per client) ----------- */

export async function getArrEventsForClient(clientId: string): Promise<ArrEvent[]> {
  if (hasDatabase() && dbHealthy()) {
    try {
      const events = await getArrEventsByClient(clientId);
      markDbHealthy();
      return sortByDateDesc(withRunningBalance(events));
    } catch (err) {
      markDbUnhealthy();
      console.warn("[data] arr events read failed:", err);
    }
  }
  return [];
}

export async function getContactsForClient(clientId: string): Promise<Contact[]> {
  if (hasDatabase() && dbHealthy()) {
    try {
      const rows = await getContactsByClient(clientId);
      markDbHealthy();
      return rows;
    } catch (err) {
      markDbUnhealthy();
      console.warn("[data] contacts read failed:", err);
    }
  }
  return [];
}

/** Add a contact by hand (no HubSpot record) — e.g. a stakeholder HubSpot
 *  doesn't have yet. `hubspotContactId` stays null so a later sync never
 *  touches or overwrites this row. */
export async function addManualContact(input: {
  clientId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
}): Promise<Contact> {
  if (!hasDatabase()) throw new Error("Database not configured");
  const { insertClientContact } = await import("@/lib/repo/drizzle");
  const contact: Contact = {
    id: `ct-${randomUUID()}`,
    clientId: input.clientId,
    hubspotContactId: null,
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.phone,
    jobTitle: input.jobTitle,
    isPrimary: false,
    createdAt: new Date().toISOString(),
  };
  await insertClientContact(contact);
  return contact;
}

/** Remove a manually-added contact. No-ops (safely) on a HubSpot-synced one. */
export async function removeManualContact(clientId: string, contactId: string): Promise<void> {
  if (!hasDatabase()) throw new Error("Database not configured");
  const { deleteManualContact } = await import("@/lib/repo/drizzle");
  await deleteManualContact(clientId, contactId);
}

export async function getAttachmentsForClient(clientId: string): Promise<Attachment[]> {
  if (hasDatabase() && dbHealthy()) {
    try {
      const rows = await getAttachmentsByClient(clientId);
      markDbHealthy();
      return rows;
    } catch (err) {
      markDbUnhealthy();
      console.warn("[data] attachments read failed:", err);
    }
  }
  return [];
}

/** Issue a signed upload target for a new attachment. The browser uploads
 *  directly to Supabase Storage with the returned token — the file never
 *  passes through our server. */
export async function getAttachmentUploadTarget(clientId: string, fileName: string) {
  const { createAttachmentUploadTarget } = await import("@/lib/integrations/supabase-storage");
  return createAttachmentUploadTarget(clientId, fileName);
}

/** Record a manually-uploaded attachment once the browser's direct upload to
 *  Supabase Storage has completed. The download link is signed once, here —
 *  NOT re-signed on every read — so viewing the attachments list never pays
 *  a per-row Storage API round trip. storagePath is kept separately so
 *  deleting the file later never needs to parse it back out of a URL. */
export async function recordAttachment(input: {
  clientId: string;
  dealId: string | null;
  path: string;
  name: string;
  extension: string;
  size: number;
}): Promise<Attachment> {
  if (!hasDatabase()) throw new Error("Database not configured");
  const { createAttachmentDownloadUrl } = await import("@/lib/integrations/supabase-storage");
  const { insertClientAttachment } = await import("@/lib/repo/drizzle");
  const url = await createAttachmentDownloadUrl(input.path);
  const attachment: Attachment = {
    id: `att-${randomUUID()}`,
    clientId: input.clientId,
    hubspotFileId: null,
    dealId: input.dealId,
    name: input.name,
    url,
    extension: input.extension,
    size: input.size,
    storagePath: input.path,
    createdAt: new Date().toISOString(),
  };
  await insertClientAttachment(attachment);
  return attachment;
}

/** Delete a manually-uploaded attachment — best-effort on the storage file
 *  (a row created before storagePath existed would have it null; the DB row
 *  is still removed either way so it always disappears from the UI). */
export async function deleteAttachment(clientId: string, attachmentId: string): Promise<void> {
  if (!hasDatabase()) throw new Error("Database not configured");
  const { getAttachmentById, deleteClientAttachment } = await import("@/lib/repo/drizzle");
  const attachment = await getAttachmentById(clientId, attachmentId);
  if (!attachment) return;
  if (attachment.storagePath) {
    try {
      const { deleteAttachmentFile } = await import("@/lib/integrations/supabase-storage");
      await deleteAttachmentFile(attachment.storagePath);
    } catch (err) {
      console.warn("[data] attachment file delete failed (row will still be removed):", err);
    }
  }
  await deleteClientAttachment(clientId, attachmentId);
}

export async function getDealsForClient(clientId: string): Promise<Deal[]> {
  if (hasDatabase() && dbHealthy()) {
    try {
      const rows = await getDealsByClient(clientId);
      markDbHealthy();
      return rows;
    } catch (err) {
      markDbUnhealthy();
      console.warn("[data] deals read failed:", err);
    }
  }
  return [];
}

export async function getEmailsForClient(clientId: string): Promise<Email[]> {
  if (hasDatabase() && dbHealthy()) {
    try {
      const rows = await getEmailsByClient(clientId);
      markDbHealthy();
      return rows;
    } catch (err) {
      markDbUnhealthy();
      console.warn("[data] emails read failed:", err);
    }
  }
  return [];
}

export async function getMeetingsForClient(clientId: string): Promise<Meeting[]> {
  if (hasDatabase() && dbHealthy()) {
    try {
      const rows = await getMeetingsByClient(clientId);
      markDbHealthy();
      return rows;
    } catch (err) {
      markDbUnhealthy();
      console.warn("[data] meetings read failed:", err);
    }
  }
  return [];
}

/* ---------- Mutations: in-app renewals / expansions / etc. -------------- */

export async function recordArrEvent(input: ArrEventInput): Promise<ArrEvent> {
  const client = await getClientById(input.clientId);
  if (!client) throw new Error(`Client not found: ${input.clientId}`);

  if (input.type !== "churn" && (!Number.isFinite(input.value) || input.value <= 0)) {
    throw new Error("Amount must be greater than zero.");
  }

  const today = new Date().toISOString().slice(0, 10);
  const effectiveDate = (input.effectiveDate ?? today).slice(0, 10);
  const current = client.arr;

  let amount: number;
  switch (input.type) {
    case "renewal":
    case "reactivation":
      amount = input.value - current;
      break;
    case "expansion":
      amount = Math.abs(input.value);
      break;
    case "contraction":
      amount = -Math.abs(input.value);
      break;
    case "churn":
      amount = -current;
      break;
    default:
      amount = 0;
  }

  const renewalDate =
    input.renewalDate !== undefined
      ? input.renewalDate
      : input.type === "renewal"
        ? addYear(effectiveDate)
        : null;

  const event: ArrEvent = {
    id: `man-${input.clientId}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    clientId: input.clientId,
    type: input.type,
    amount,
    arr: 0,
    effectiveDate,
    renewalDate,
    source: "manual",
    externalId: null,
    note: input.note ?? null,
    createdBy: input.createdBy ?? null,
    createdAt: new Date().toISOString(),
  };

  if (hasDatabase()) {
    await appendArrEvent(event);
  } else {
    sampleAppendArrEvent(event);
  }
  return event;
}

/* ---------- Bulk import (existing clients via Excel/CSV) ---------------- */

export async function persistImport(payload: { clients: Client[]; baselineEvents: ArrEvent[] }): Promise<number> {
  if (hasDatabase()) {
    await importClientsDb(payload);
  } else {
    sampleImportClients(payload);
  }
  return payload.clients.length;
}

/* ---------- Playbooks / tasks / timeline -------------------------------- */

export async function getPlaybooks(): Promise<Playbook[]> {
  return SAMPLE_PLAYBOOKS;
}

export async function getTasksForClient(clientId: string): Promise<PlaybookTask[]> {
  return tasksForClient(clientId);
}

export async function getOpenTasks(): Promise<PlaybookTask[]> {
  const clients = await getClients();
  const ids = new Set(clients.map((c) => c.id));
  const all = await Promise.all([...ids].map((id) => getTasksForClient(id)));
  return all.flat().filter((t) => t.status === "todo" || t.status === "in_progress");
}

export async function getTimelineForClient(clientId: string): Promise<TimelineEvent[]> {
  return [];
}

export async function getRecentActivity(limit = 8): Promise<TimelineEvent[]> {
  return [];
}

/** Active accounts ranked by lowest health — the CSM watchlist. */
export async function getAtRiskClients(limit = 6): Promise<Client[]> {
  const { clients } = await source();
  return clients
    .filter((c) => c.status !== "churned")
    .sort((a, b) => a.health.score - b.health.score)
    .slice(0, limit);
}

/** Active accounts renewing within `days`, soonest first. */
export async function getUpcomingRenewals(days = 90): Promise<Client[]> {
  const { clients } = await source();
  const now = Date.now();
  return clients
    .filter((c) => {
      if (c.status === "churned" || !c.renewalDate) return false;
      const d = Math.ceil((new Date(c.renewalDate).getTime() - now) / 86_400_000);
      return d >= 0 && d <= days;
    })
    .sort((a, b) => new Date(a.renewalDate!).getTime() - new Date(b.renewalDate!).getTime());
}

/** All active CSM users from the csm_users table (falls back to SAMPLE_CSMS if DB empty). */
export const getCsmUsers = cache(async (): Promise<Csm[]> => {
  if (hasDatabase() && dbHealthy()) {
    try {
      const { getCsmUsersFromDb } = await import("@/lib/repo/drizzle");
      const csms = await getCsmUsersFromDb();
      markDbHealthy();
      if (csms.length > 0) return csms;
    } catch (err) {
      markDbUnhealthy();
      console.warn("[data] getCsmUsers failed:", err);
    }
  }
  return Object.values(SAMPLE_CSMS);
});

/** Distinct CSMs for the filter dropdown — reads from csm_users table. */
/** CSM options for the clients list (filter + inline picker). Keyed by EMAIL to
 *  match how owners are stored everywhere else (the workflow, OwnerCard and
 *  assignCsmOwner all use the email-based team-member identity). Sourcing this
 *  from csm_users (id = HubSpot owner id) instead would make every
 *  workflow-assigned CSM render as "Unassigned" in the table. */
export async function getCsms() {
  const members = await getTeamMembers("csm");
  return members
    .map((m) => ({ id: m.identity.id, name: m.identity.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Implementation-owner options for the clients list. Same email-keyed identity
 *  as getCsms() but sourced from the Implementation team. id === email so it
 *  matches client.implementationOwner.id stored by the workflow / OwnerCard. */
export async function getImplementationOwners() {
  const members = await getTeamMembers("implementation");
  return members
    .map((m) => ({ id: m.identity.id, name: m.identity.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** App user with resolved role, for the Users & roles screen. Bootstrap super-
 *  admins (from SUPER_ADMIN_EMAILS) always appear and can't be edited/removed. */
export interface AppUser {
  email: string;
  name: string | null;
  role: Role;
  bootstrap: boolean;
}

/**
 * Workspace-overridden role labels. Falls back to DEFAULT_ROLE_LABELS for any
 * key not stored in the DB. Always returns a complete record for all roles.
 */
export async function getRoleLabels(): Promise<Record<string, string>> {
  if (hasDatabase() && dbHealthy()) {
    try {
      const { getWorkspaceConfigFromDb } = await import("@/lib/repo/drizzle");
      const stored = await getWorkspaceConfigFromDb("role_labels");
      if (stored && typeof stored === "object") {
        return { ...DEFAULT_ROLE_LABELS, ...(stored as Record<string, string>) };
      }
    } catch {
      // fall through to default
    }
  }
  return { ...DEFAULT_ROLE_LABELS };
}

// cache()-wrapped: the profile page calls getTeamMembers() 3x (csm / impl / AE),
// each of which calls getAppUsers(). Without memoization that's 3 full app_users
// reads per request against the remote DB; cache() collapses them to one.
export const getAppUsers = cache(async (): Promise<AppUser[]> => {
  const byEmail = new Map<string, AppUser>();
  for (const e of env.superAdminEmails) {
    byEmail.set(e, { email: e, name: null, role: "super_admin", bootstrap: true });
  }
  if (hasDatabase() && dbHealthy()) {
    try {
      const { getAppUsersFromDb } = await import("@/lib/repo/drizzle");
      for (const r of await getAppUsersFromDb()) {
        if (byEmail.get(r.email)?.bootstrap) continue; // permanent super-admin wins
        byEmail.set(r.email, { email: r.email, name: r.name, role: isRole(r.role) ? r.role : DEFAULT_ROLE, bootstrap: false });
      }
    } catch (err) {
      console.warn("[data] getAppUsers failed:", err);
    }
  }
  // Merge in CSMs from csm_users (synced from HubSpot) who have an email but
  // aren't already in app_users. They appear with their default role so the
  // super-admin can assign the right tier without having to add them manually.
  const csms = await getCsmUsers();
  for (const csm of csms) {
    if (!csm.email) continue;
    const key = csm.email.toLowerCase();
    if (!byEmail.has(key)) {
      byEmail.set(key, { email: csm.email, name: csm.name, role: DEFAULT_ROLE, bootstrap: false });
    }
  }
  return [...byEmail.values()].sort(
    (a, b) => Number(b.role === "super_admin") - Number(a.role === "super_admin") || a.email.localeCompare(b.email),
  );
});

/* ------------------------------------------------------- notifications */

/** Recent notifications for the signed-in user (newest first). */
export async function getMyNotifications(limit = 50): Promise<Notification[]> {
  if (!hasDatabase() || !dbHealthy()) return [];
  const email = await getCurrentUserEmail();
  if (!email) return [];
  try {
    const { getNotificationsForUserDb } = await import("@/lib/repo/drizzle");
    return await getNotificationsForUserDb(email, limit);
  } catch (err) {
    console.warn("[data] getMyNotifications failed:", err);
    return [];
  }
}

/** Unread count for the signed-in user — drives the sidebar bell badge. */
export async function getMyUnreadCount(): Promise<number> {
  if (!hasDatabase() || !dbHealthy()) return 0;
  const email = await getCurrentUserEmail();
  if (!email) return 0;
  try {
    const { getUnreadCountForUserDb } = await import("@/lib/repo/drizzle");
    return await getUnreadCountForUserDb(email);
  } catch {
    return 0;
  }
}

/** Open action items for the signed-in user (the inbox / action list). */
export async function getMyActionItems(): Promise<Notification[]> {
  const all = await getMyNotifications(100);
  return all.filter((n) => n.status === "open");
}

export async function markNotificationRead(id: string): Promise<void> {
  const email = await getCurrentUserEmail();
  if (!email || !hasDatabase()) return;
  const { markNotificationReadDb } = await import("@/lib/repo/drizzle");
  await markNotificationReadDb(id, email);
}

export async function markAllNotificationsRead(): Promise<void> {
  const email = await getCurrentUserEmail();
  if (!email || !hasDatabase()) return;
  const { markAllNotificationsReadDb } = await import("@/lib/repo/drizzle");
  await markAllNotificationsReadDb(email);
}

export async function setActionItemStatus(id: string, status: "open" | "done"): Promise<void> {
  const email = await getCurrentUserEmail();
  if (!email || !hasDatabase()) return;
  const { setNotificationStatusDb } = await import("@/lib/repo/drizzle");
  await setNotificationStatusDb(id, email, status);
}

/** Emails that should receive super-admin notifications (bootstrap + app_users). */
export async function getSuperAdminEmails(): Promise<string[]> {
  const set = new Set<string>(env.superAdminEmails.map((e) => e.toLowerCase()));
  const users = await getAppUsers();
  for (const u of users) if (u.role === "super_admin") set.add(u.email.toLowerCase());
  return [...set];
}

/* --------------------------------------------------------- team members */

/** A person who can own clients for a team, derived from their app_users role. */
export interface TeamMember {
  email: string;
  name: string | null;
  role: Role;
  team: Team;
  /** Identity stored on a client when this person is assigned as an owner. */
  identity: Csm;
}

function initialsFromName(s: string): string {
  const parts = s.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || s.slice(0, 2).toUpperCase();
}

/**
 * Members of a team (or both teams when `team` is omitted), resolved from
 * app_users by role. These are the candidates the assignment workflow picks
 * from and the options shown in the manual owner pickers. super_admins are
 * excluded (they belong to no team).
 */
export async function getTeamMembers(team?: Team): Promise<TeamMember[]> {
  const users = await getAppUsers();
  const out: TeamMember[] = [];
  for (const u of users) {
    const t = teamForRole(u.role);
    if (!t) continue; // skip super_admin
    if (team && t !== team) continue;
    const name = u.name ?? u.email;
    out.push({
      email: u.email,
      name: u.name,
      role: u.role,
      team: t,
      identity: { id: u.email, name, email: u.email, initials: initialsFromName(name) },
    });
  }
  return out;
}

/** Assign (or unassign) the CSM of a client by team-member email (app_users). */
export async function assignCsmOwner(
  clientId: string,
  ownerEmail: string | null,
  source: import("@/lib/types").AssignmentSource = "manual",
): Promise<void> {
  if (!hasDatabase()) throw new Error("Database not configured");
  const { assignCsmToClient } = await import("@/lib/repo/drizzle");
  if (!ownerEmail) {
    await assignCsmToClient(clientId, null);
    return;
  }
  const members = await getTeamMembers("csm");
  const m = members.find((x) => x.email === ownerEmail.toLowerCase());
  if (!m) throw new Error(`CSM not found: ${ownerEmail}`);
  await assignCsmToClient(clientId, m.identity, source);
}

/** Assign (or unassign) the implementation owner of a client by member email. */
export async function assignImplementationOwner(
  clientId: string,
  ownerEmail: string | null,
  source: import("@/lib/types").AssignmentSource = "manual",
): Promise<void> {
  if (!hasDatabase()) throw new Error("Database not configured");
  const { assignImplementationOwnerToClient } = await import("@/lib/repo/drizzle");
  if (!ownerEmail) {
    await assignImplementationOwnerToClient(clientId, null);
    return;
  }
  const members = await getTeamMembers("implementation");
  const m = members.find((x) => x.email === ownerEmail.toLowerCase());
  if (!m) throw new Error(`Implementation owner not found: ${ownerEmail}`);
  await assignImplementationOwnerToClient(clientId, m.identity, source);
}

/** Email-or-name → CSM directory, used to resolve owners during bulk import. */
export async function csmDirectory(): Promise<Map<string, Csm>> {
  const map = new Map<string, Csm>();
  const csms = await getCsmUsers();
  for (const csm of csms) {
    if (csm.email) map.set(csm.email.toLowerCase(), csm);
    map.set(csm.name.toLowerCase(), csm);
  }
  return map;
}

/** All property definitions from the DB (ordered by sortOrder). */
export const getPropertyDefinitions = cache(async (): Promise<PropertyDefinition[]> => {
  if (hasDatabase() && dbHealthy()) {
    try {
      const { getPropertyDefinitionsFromDb } = await import("@/lib/repo/drizzle");
      const defs = await getPropertyDefinitionsFromDb();
      markDbHealthy();
      if (defs.length > 0) return defs;
    } catch (err) {
      markDbUnhealthy();
      console.warn("[data] getPropertyDefinitions failed:", err);
    }
  }
  return [];
});

/**
 * Update editable client details: core fields, properties (full replace —
 * caller sends the complete map), and/or CSM. Used by the profile edit drawer.
 */
export async function updateClientDetails(
  clientId: string,
  payload: {
    fields?: Record<string, unknown>;
    properties?: Record<string, unknown>;
    csmId?: string | null;
    implementationOwnerEmail?: string | null;
  },
): Promise<void> {
  if (!hasDatabase()) throw new Error("Database not configured");
  const { updateClientFields, updateClientProperties, getClientByIdFromDb, recomputeClient } = await import("@/lib/repo/drizzle");
  if (payload.csmId !== undefined) await assignCsm(clientId, payload.csmId);
  if (payload.implementationOwnerEmail !== undefined) {
    await assignImplementationOwner(clientId, payload.implementationOwnerEmail);
  }
  if (payload.fields && Object.keys(payload.fields).length > 0) {
    await updateClientFields(clientId, payload.fields as import("@/lib/repo/drizzle").ClientFieldUpdate);
  }
  if (payload.properties) {
    // MERGE over existing so a single-field inline edit never wipes the rest.
    const existing = await getClientByIdFromDb(clientId);
    const merged: Record<string, unknown> = { ...(existing?.properties ?? {}), ...payload.properties };
    // If this edit directly sets a field recomputeClientReferral would
    // otherwise auto-derive from deal history (referral_source,
    // closed_won_date_prop — e.g. the ClientsTable bulk-edit tool), pin it in
    // __field_overrides so the next sync's recompute never silently reverts it.
    const touchedRecomputed = RECOMPUTED_PROPERTY_FIELDS.filter((k) => Object.prototype.hasOwnProperty.call(payload.properties!, k));
    if (touchedRecomputed.length > 0) {
      const overridden = new Set((merged[FIELD_OVERRIDES_KEY] as string[] | undefined) ?? []);
      for (const f of touchedRecomputed) overridden.add(f);
      merged[FIELD_OVERRIDES_KEY] = [...overridden];
    }
    await updateClientProperties(clientId, merged);
    // A properties edit can be a __deal_overrides amount/contractStartDate
    // change, which affects ARR/renewal — re-materialize immediately so the
    // header doesn't show stale numbers until the next sync cycle.
    await recomputeClient(clientId);
  }
}

/** Toggle whether a deal is tracked (counts toward ARR). */
export async function setDealTracked(dealId: string, tracked: boolean): Promise<void> {
  if (!hasDatabase()) throw new Error("Database not configured");
  const { setDealTracked: setDealTrackedDb } = await import("@/lib/repo/drizzle");
  await setDealTrackedDb(dealId, tracked);
}

/** Assign (or unassign) a CSM to a client. Accepts an email (the canonical
 *  team-member identity used by getCsms / the workflow / OwnerCard) and falls
 *  back to a legacy csm_users id so older callers keep working. */
export async function assignCsm(clientId: string, idOrEmail: string | null): Promise<void> {
  if (!hasDatabase()) throw new Error("Database not configured");
  const { assignCsmToClient } = await import("@/lib/repo/drizzle");
  if (!idOrEmail) {
    await assignCsmToClient(clientId, null);
    return;
  }
  // Preferred path: an email pointing at a CSM team member (id === email).
  const members = await getTeamMembers("csm");
  const member = members.find((m) => m.email === idOrEmail.toLowerCase());
  if (member) {
    await assignCsmToClient(clientId, member.identity, "manual");
    return;
  }
  // Legacy fallback: a csm_users directory id (HubSpot owner id).
  const csms = await getCsmUsers();
  const csm = csms.find((c) => c.id === idOrEmail);
  if (!csm) throw new Error(`CSM not found: ${idOrEmail}`);
  await assignCsmToClient(clientId, csm, "manual");
}

/* ----------------------------------------------------------------- utils */

function sortByDateDesc(events: ArrEvent[]): ArrEvent[] {
  return [...events].sort((a, b) => {
    const d = b.effectiveDate.slice(0, 10).localeCompare(a.effectiveDate.slice(0, 10));
    return d !== 0 ? d : b.createdAt.localeCompare(a.createdAt);
  });
}

function addYear(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}
