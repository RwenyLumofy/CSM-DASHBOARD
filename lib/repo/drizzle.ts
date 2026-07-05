/* Drizzle-backed repository: read synced records and write during sync,
   bulk import, and in-app ARR changes. Used only when DATABASE_URL is set.

   The ARR ledger (arr_events) is the source of truth. Whenever it changes,
   `recomputeClient` re-materializes the client row's arr/previousArr/renewal/
   status from the FULL ledger so reads stay a single cheap table scan. */

import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import type {
  ArrEvent,
  Attachment,
  Client,
  Contact,
  Csm,
  Deal,
  Email,
  Meeting,
  HealthScore,
  PropertyDefinition,
  SupportSummary,
  UsageMetrics,
} from "@/lib/types";
import { dealOverridesMap, applyDealOverrides, DEAL_DATES_KEY, type DealDatesMap } from "@/lib/deal-overrides";
import { FIELD_OVERRIDES_KEY, fieldOverridesSet } from "@/lib/client-overrides";
import type { SyncBundle } from "@/lib/integrations/sync";
import { currentQuarter, periodBounds } from "@/lib/metrics/arr";
import { computeClientStatus, STATUS_OVERRIDE_KEY } from "@/lib/status";
import type { UsageSnapshot } from "@/lib/usage/types";

type Row = typeof schema.clients.$inferSelect;
type EventRow = typeof schema.arrEvents.$inferSelect;
type ContactRow = typeof schema.clientContacts.$inferSelect;
type AttachmentRow = typeof schema.clientAttachments.$inferSelect;

function iso(d: Date | null): string | null {
  // Guard invalid Dates (e.g. a malformed timestamp from HubSpot): calling
  // toISOString() on one throws RangeError, which would fail the whole read.
  if (!d || Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/* ----------------------------------------------------------------- clients */

function rowToClient(r: Row): Client {
  return {
    id: r.id,
    hubspotId: r.hubspotId,
    source: (r.source as Client["source"]) ?? "hubspot",
    name: r.name,
    domain: r.domain,
    country: r.country,
    industry: r.industry,
    employees: r.employees,
    customerType: (r.customerType as Client["customerType"]) ?? "arr",
    status: (r.status as Client["status"]) ?? "active",
    csm: r.csm ?? null,
    csmSource: (r.csmSource as Client["csmSource"]) ?? null,
    implementationOwner: r.implementationOwner ?? null,
    implementationOwnerSource: (r.implementationOwnerSource as Client["implementationOwnerSource"]) ?? null,
    currency: r.currency,
    arr: r.arr,
    previousArr: r.previousArr,
    startedAt: iso(r.startedAt),
    renewalDate: iso(r.renewalDate),
    churnedAt: iso(r.churnedAt),
    segment: (r.segment as Client["segment"]) ?? "smb",
    logoUrl: r.logoUrl,
    hubspotUrl: r.hubspotUrl ?? undefined,
    health: (r.health as HealthScore) ?? emptyHealth(),
    support: (r.support as SupportSummary) ?? emptySupport(),
    usage: (r.usage as UsageMetrics) ?? emptyUsage(),
    tags: r.tags ?? [],
    properties: (r.properties as Record<string, unknown>) ?? {},
  };
}

function clientToRow(c: Client): typeof schema.clients.$inferInsert {
  return {
    id: c.id,
    hubspotId: c.hubspotId,
    source: c.source,
    name: c.name,
    domain: c.domain,
    country: c.country,
    industry: c.industry,
    employees: c.employees,
    customerType: c.customerType,
    status: c.status,
    csm: c.csm,
    csmSource: c.csmSource ?? null,
    implementationOwner: c.implementationOwner ?? null,
    implementationOwnerSource: c.implementationOwnerSource ?? null,
    currency: c.currency,
    arr: c.arr,
    previousArr: c.previousArr,
    startedAt: c.startedAt ? new Date(c.startedAt) : null,
    renewalDate: c.renewalDate ? new Date(c.renewalDate) : null,
    churnedAt: c.churnedAt ? new Date(c.churnedAt) : null,
    segment: c.segment,
    logoUrl: c.logoUrl,
    hubspotUrl: c.hubspotUrl,
    health: c.health,
    support: c.support,
    usage: c.usage,
    tags: c.tags,
    properties: c.properties ?? {},
    updatedAt: new Date(),
  };
}

export async function getClientsFromDb(): Promise<Client[]> {
  const db = getDb();
  const rows = await db.select().from(schema.clients);
  return rows.map(rowToClient);
}

/** Fetch a single client row by id (avoids scanning the whole table). */
export async function getClientByIdFromDb(id: string): Promise<Client | null> {
  const db = getDb();
  const rows = await db.select().from(schema.clients).where(eq(schema.clients.id, id)).limit(1);
  return rows[0] ? rowToClient(rows[0]) : null;
}

/* ------------------------------------------------------------- arr events */

// effectiveDate/createdAt are non-nullable on ArrEvent (it's a running-balance
// ledger — an event with no date can't be placed on the timeline), so unlike
// the optional dates above they can't fall back to null via iso(). A row with
// an unparseable value here is excluded rather than crashing the whole read —
// seen once in prod: a single bad row in this map took down getArrEventsFromDb
// entirely, which zeroed out the clients list for every user via loadSource's
// shared Promise.all. One malformed ledger row should never do that.
function eventRowToArrEvent(r: EventRow): ArrEvent | null {
  if (Number.isNaN(r.effectiveDate?.getTime()) || Number.isNaN(r.createdAt?.getTime())) {
    console.warn(`[drizzle] arr_events row ${r.id} (client ${r.clientId}) has an invalid date — excluded from read`);
    return null;
  }
  return {
    id: r.id,
    clientId: r.clientId,
    type: r.type as ArrEvent["type"],
    amount: r.amount,
    arr: r.arr,
    effectiveDate: r.effectiveDate.toISOString(),
    renewalDate: iso(r.renewalDate),
    source: (r.source as ArrEvent["source"]) ?? "manual",
    externalId: r.externalId,
    note: r.note,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
  };
}

function arrEventToRow(e: ArrEvent): typeof schema.arrEvents.$inferInsert {
  return {
    id: e.id,
    clientId: e.clientId,
    type: e.type,
    amount: e.amount,
    arr: e.arr,
    effectiveDate: new Date(e.effectiveDate),
    renewalDate: e.renewalDate ? new Date(e.renewalDate) : null,
    source: e.source,
    externalId: e.externalId,
    note: e.note,
    createdBy: e.createdBy,
    createdAt: new Date(e.createdAt),
  };
}

export async function getArrEventsFromDb(): Promise<ArrEvent[]> {
  const db = getDb();
  const rows = await db.select().from(schema.arrEvents);
  return rows.map(eventRowToArrEvent).filter((e): e is ArrEvent => e !== null);
}

export async function getArrEventsByClient(clientId: string): Promise<ArrEvent[]> {
  const db = getDb();
  const rows = await db.select().from(schema.arrEvents).where(eq(schema.arrEvents.clientId, clientId));
  return rows.map(eventRowToArrEvent).filter((e): e is ArrEvent => e !== null);
}

/* -------------------------------------------------------------- contacts */

function contactRowTo(r: ContactRow): Contact {
  return {
    id: r.id,
    clientId: r.clientId,
    hubspotContactId: r.hubspotContactId,
    firstName: r.firstName,
    lastName: r.lastName,
    email: r.email,
    phone: r.phone,
    jobTitle: r.jobTitle,
    isPrimary: r.isPrimary,
    createdAt: r.createdAt.toISOString(),
  };
}


export async function getContactsByClient(clientId: string): Promise<Contact[]> {
  const db = getDb();
  const rows = await db.select().from(schema.clientContacts).where(eq(schema.clientContacts.clientId, clientId));
  return rows.map(contactRowTo);
}

/** Insert a manually-added contact (id is caller-generated, never `hsc-...`,
 *  so it can never collide with a HubSpot-synced row). */
export async function insertClientContact(c: Contact): Promise<void> {
  const db = getDb();
  await db.insert(schema.clientContacts).values({
    id: c.id,
    clientId: c.clientId,
    hubspotContactId: c.hubspotContactId,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phone,
    jobTitle: c.jobTitle,
    isPrimary: c.isPrimary,
    createdAt: new Date(c.createdAt),
  });
}

/** Delete a manually-added contact. Refuses to delete a HubSpot-synced row
 *  (those come back on the next sync anyway — deleting them would be a no-op
 *  at best, misleading at worst). */
export async function deleteManualContact(clientId: string, contactId: string): Promise<void> {
  const db = getDb();
  await db
    .delete(schema.clientContacts)
    .where(and(eq(schema.clientContacts.id, contactId), eq(schema.clientContacts.clientId, clientId), isNull(schema.clientContacts.hubspotContactId)));
}

/* ------------------------------------------------------------ attachments */

function attachmentRowTo(r: AttachmentRow): Attachment {
  return {
    id: r.id,
    clientId: r.clientId,
    hubspotFileId: r.hubspotFileId,
    dealId: r.dealId,
    name: r.name,
    url: r.url,
    extension: r.extension,
    size: r.size,
    storagePath: r.storagePath,
    createdAt: r.createdAt.toISOString(),
  };
}


export async function getAttachmentsByClient(clientId: string): Promise<Attachment[]> {
  const db = getDb();
  const rows = await db.select().from(schema.clientAttachments).where(eq(schema.clientAttachments.clientId, clientId));
  return rows.map(attachmentRowTo);
}

/** Scoped by clientId too, so one client's attachment id can't be used to
 *  probe or delete another client's row. */
export async function getAttachmentById(clientId: string, attachmentId: string): Promise<Attachment | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.clientAttachments)
    .where(and(eq(schema.clientAttachments.id, attachmentId), eq(schema.clientAttachments.clientId, clientId)))
    .limit(1);
  return rows[0] ? attachmentRowTo(rows[0]) : null;
}

export async function deleteClientAttachment(clientId: string, attachmentId: string): Promise<void> {
  const db = getDb();
  await db
    .delete(schema.clientAttachments)
    .where(and(eq(schema.clientAttachments.id, attachmentId), eq(schema.clientAttachments.clientId, clientId)));
}

/** Record a manually-uploaded attachment (hubspotFileId stays null — the
 *  wipe-HubSpot-data path only deletes rows where it's set, so these survive). */
export async function insertClientAttachment(a: Attachment): Promise<void> {
  const db = getDb();
  await db.insert(schema.clientAttachments).values({
    id: a.id,
    clientId: a.clientId,
    hubspotFileId: a.hubspotFileId,
    dealId: a.dealId,
    name: a.name,
    url: a.url,
    extension: a.extension,
    size: a.size,
    storagePath: a.storagePath,
    createdAt: new Date(a.createdAt),
  });
}

/* ---------------------------------------------------------------- deals */

type DealRow = typeof schema.clientDeals.$inferSelect;

function dealRowTo(r: DealRow): Deal {
  return {
    id: r.id,
    clientId: r.clientId,
    hubspotDealId: r.hubspotDealId,
    name: r.name,
    amount: r.amount,
    closeDate: iso(r.closeDate),
    pipeline: r.pipeline as Deal["pipeline"],
    referralSource: r.referralSource ?? null,
    ownerName: r.ownerName,
    ownerEmail: r.ownerEmail,
    hubspotUrl: r.hubspotUrl,
    tracked: r.tracked ?? true,
    numberOfUsers: r.numberOfUsers,
    pricePerUser: r.pricePerUser,
    complementaryLicenses: r.complementaryLicenses,
    contractDuration: r.contractDuration,
    products: r.products ?? [],
    useCases: r.useCases ?? [],
    globalLibraryPackage: r.globalLibraryPackage ?? [],
    globalLibraryLicenses: r.globalLibraryLicenses,
    aiCourseCredits: r.aiCourseCredits,
    contractStartDate: iso(r.contractStartDate),
    accountBrief: r.accountBrief ?? null,
    category: (r.category as Deal["category"]) ?? "renewal",
    supportLevel: r.supportLevel ?? null,
    implementationLevel: r.implementationLevel ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

// Deal properties are recorded ONCE, from whichever sync pass first sees the
// deal (acquisition or engagement) — a re-sync never touches an existing
// deal row again (see upsertClientDeals' onConflictDoNothing). This keeps a
// CSM's in-app edits (__deal_overrides) as the only way a deal's displayed
// property ever changes after that first recording; communications (contacts/
// emails/meetings) are unaffected and keep refreshing on every sync cycle.
function dealToRow(d: Deal): typeof schema.clientDeals.$inferInsert {
  return {
    id: d.id,
    clientId: d.clientId,
    hubspotDealId: d.hubspotDealId,
    name: d.name,
    amount: d.amount,
    closeDate: d.closeDate ? new Date(d.closeDate) : null,
    pipeline: d.pipeline,
    referralSource: d.referralSource ?? null,
    ownerName: d.ownerName,
    ownerEmail: d.ownerEmail,
    hubspotUrl: d.hubspotUrl,
    numberOfUsers: d.numberOfUsers ?? null,
    pricePerUser: d.pricePerUser ?? null,
    complementaryLicenses: d.complementaryLicenses ?? null,
    contractDuration: d.contractDuration ?? null,
    products: d.products ?? [],
    useCases: d.useCases ?? [],
    globalLibraryPackage: d.globalLibraryPackage ?? [],
    globalLibraryLicenses: d.globalLibraryLicenses ?? null,
    aiCourseCredits: d.aiCourseCredits ?? null,
    contractStartDate: d.contractStartDate ? new Date(d.contractStartDate) : null,
    accountBrief: d.accountBrief ?? null,
    category: d.category ?? "renewal",
    supportLevel: d.supportLevel ?? null,
    implementationLevel: d.implementationLevel ?? null,
    createdAt: new Date(d.createdAt),
  };
}

export async function getDealsByClient(clientId: string): Promise<Deal[]> {
  const db = getDb();
  const rows = await db.select().from(schema.clientDeals).where(eq(schema.clientDeals.clientId, clientId));
  return rows.map(dealRowTo);
}

/** All deals across every client (one query). Used by the assignment workflow
 *  and team-health rollups to derive per-client levels and per-owner load. */
export async function getAllDealsFromDb(): Promise<Deal[]> {
  const db = getDb();
  const rows = await db.select().from(schema.clientDeals);
  return rows.map(dealRowTo);
}

/** Which client a deal belongs to — used to check ownership before mutating it. */
export async function getDealClientId(dealId: string): Promise<string | null> {
  const db = getDb();
  const rows = await db.select({ clientId: schema.clientDeals.clientId }).from(schema.clientDeals).where(eq(schema.clientDeals.id, dealId)).limit(1);
  return rows[0]?.clientId ?? null;
}

/**
 * Toggle whether a deal is tracked. Un-tracking a deal marks it "dead" and
 * excludes its ARR from the client's balance; re-tracking restores it.
 * Re-materializes the client's ARR. Returns the affected clientId (or null).
 */
export async function setDealTracked(dealId: string, tracked: boolean): Promise<string | null> {
  const db = getDb();
  const rows = await db.select({ clientId: schema.clientDeals.clientId }).from(schema.clientDeals).where(eq(schema.clientDeals.id, dealId)).limit(1);
  const clientId = rows[0]?.clientId;
  if (!clientId) return null;
  await db.update(schema.clientDeals).set({ tracked }).where(eq(schema.clientDeals.id, dealId));
  await recomputeClient(clientId);
  return clientId;
}

/* ---------------------------------------------------------------- emails */

type EmailRow = typeof schema.clientEmails.$inferSelect;

function emailRowTo(r: EmailRow): Email {
  return {
    id: r.id,
    clientId: r.clientId,
    dealId: r.dealId,
    hubspotEmailId: r.hubspotEmailId,
    subject: r.subject,
    fromEmail: r.fromEmail,
    toEmail: r.toEmail,
    direction: r.direction as Email["direction"],
    bodySnippet: r.bodySnippet,
    sentAt: iso(r.sentAt),
    createdAt: r.createdAt.toISOString(),
  };
}


export async function getEmailsByClient(clientId: string): Promise<Email[]> {
  const db = getDb();
  const rows = await db.select().from(schema.clientEmails).where(eq(schema.clientEmails.clientId, clientId));
  return rows.map(emailRowTo).sort((a, b) => (b.sentAt ?? b.createdAt).localeCompare(a.sentAt ?? a.createdAt));
}

/* --------------------------------------------------------------- meetings */

type MeetingRow = typeof schema.clientMeetings.$inferSelect;

function meetingRowTo(r: MeetingRow): Meeting {
  return {
    id: r.id,
    clientId: r.clientId,
    dealId: r.dealId,
    hubspotMeetingId: r.hubspotMeetingId,
    title: r.title,
    startTime: iso(r.startTime),
    endTime: iso(r.endTime),
    outcome: r.outcome,
    notes: r.notes,
    location: r.location,
    createdAt: r.createdAt.toISOString(),
  };
}


export async function getMeetingsByClient(clientId: string): Promise<Meeting[]> {
  const db = getDb();
  const rows = await db.select().from(schema.clientMeetings).where(eq(schema.clientMeetings.clientId, clientId));
  return rows.map(meetingRowTo).sort((a, b) => (b.startTime ?? b.createdAt).localeCompare(a.startTime ?? a.createdAt));
}

/* ---- Engagement upserts (HubSpot contacts / emails / meetings) ---------- */

export async function upsertClientContacts(contacts: Contact[]): Promise<void> {
  if (contacts.length === 0) return;
  const db = getDb();
  await mapLimit(contacts, 10, async (c) => {
    const row = {
      id: c.id,
      clientId: c.clientId,
      hubspotContactId: c.hubspotContactId,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      phone: c.phone,
      jobTitle: c.jobTitle,
      isPrimary: c.isPrimary,
      createdAt: new Date(c.createdAt),
    };
    await db.insert(schema.clientContacts).values(row).onConflictDoUpdate({ target: schema.clientContacts.id, set: row });
  });
}

export async function upsertClientEmails(emails: Email[]): Promise<void> {
  if (emails.length === 0) return;
  const db = getDb();
  await mapLimit(emails, 10, async (e) => {
    const row = {
      id: e.id,
      clientId: e.clientId,
      dealId: e.dealId,
      hubspotEmailId: e.hubspotEmailId,
      subject: e.subject,
      fromEmail: e.fromEmail,
      toEmail: e.toEmail,
      direction: e.direction,
      bodySnippet: e.bodySnippet,
      sentAt: e.sentAt ? new Date(e.sentAt) : null,
      createdAt: new Date(e.createdAt),
    };
    await db.insert(schema.clientEmails).values(row).onConflictDoUpdate({ target: schema.clientEmails.id, set: row });
  });
}

export async function upsertClientMeetings(meetings: Meeting[]): Promise<void> {
  if (meetings.length === 0) return;
  const db = getDb();
  await mapLimit(meetings, 10, async (m) => {
    const row = {
      id: m.id,
      clientId: m.clientId,
      dealId: m.dealId,
      hubspotMeetingId: m.hubspotMeetingId,
      title: m.title,
      startTime: m.startTime ? new Date(m.startTime) : null,
      endTime: m.endTime ? new Date(m.endTime) : null,
      outcome: m.outcome,
      notes: m.notes,
      location: m.location,
      createdAt: new Date(m.createdAt),
    };
    await db.insert(schema.clientMeetings).values(row).onConflictDoUpdate({ target: schema.clientMeetings.id, set: row });
  });
}

/**
 * Record a deal's properties the FIRST time it's seen; a deal that already
 * exists is left untouched by every later sync (onConflictDoNothing) — only
 * a CSM's __deal_overrides can change its displayed properties after that.
 */
export async function upsertClientDeals(deals: Deal[]): Promise<void> {
  if (deals.length === 0) return;
  const db = getDb();
  await mapLimit(deals, 10, async (d) => {
    const row = dealToRow(d);
    await db.insert(schema.clientDeals).values(row).onConflictDoNothing({ target: schema.clientDeals.id });
  });
}

/** Persist a HubSpot engagement bundle (contacts/emails/meetings/deals). */
export async function persistEngagement(e: {
  contacts: Contact[];
  emails: Email[];
  meetings: Meeting[];
  deals: Deal[];
}): Promise<void> {
  await upsertClientContacts(e.contacts);
  await upsertClientEmails(e.emails);
  await upsertClientMeetings(e.meetings);
  await upsertClientDeals(e.deals);
  // Deals drive ARR + the auto renewal date, so re-materialize every client
  // whose deals were just refreshed.
  const clientIds = [...new Set(e.deals.map((d) => d.clientId))];
  await mapLimit(clientIds, 5, (id) => recomputeClient(id));
}

/* --------------------------------------------------------------- mutations */

/** Re-materialize a client row's ARR fields from its full ledger. */
/**
 * Re-materialize a client's ARR, renewal date, and lifecycle status. ARR is
 * the **sum of its TRACKED deals** (any pipeline — the CSM ticks the live
 * contract(s) and un-ticks dead ones), plus any non-HubSpot ledger entries
 * (Excel import baselines + in-app renewal/expansion/contraction/churn).
 * `status` is fully auto-derived by computeClientStatus() — see lib/status.ts
 * for the onboarding/active/renewal/churned precedence — except a CSM's
 * manual churn override, which always wins. startedAt is left untouched here
 * — it's set at sync/import time.
 */
export async function recomputeClient(clientId: string): Promise<void> {
  const db = getDb();
  const [clientRow] = await db
    .select({ properties: schema.clients.properties })
    .from(schema.clients)
    .where(eq(schema.clients.id, clientId));
  const props = clientRow?.properties as Record<string, unknown> | undefined;
  const overrides = dealOverridesMap(props);
  const dealDates = (props?.[DEAL_DATES_KEY] as DealDatesMap | undefined) ?? {};
  const statusOverride = props?.[STATUS_OVERRIDE_KEY] as string | undefined;

  const dealRows = await db
    .select({
      id: schema.clientDeals.id,
      amount: schema.clientDeals.amount,
      closeDate: schema.clientDeals.closeDate,
      contractStartDate: schema.clientDeals.contractStartDate,
      tracked: schema.clientDeals.tracked,
    })
    .from(schema.clientDeals)
    .where(eq(schema.clientDeals.clientId, clientId));
  // Apply the CSM's amount/contract-start-date overrides before computing ARR
  // and renewal — otherwise these would reflect the raw HubSpot-synced value
  // instead of what the CSM actually sees (and set) on the deal card.
  const effective = dealRows.map((d) => {
    const ov = overrides[d.id];
    if (!ov) return d;
    return {
      ...d,
      amount: typeof ov.amount === "number" ? ov.amount : d.amount,
      contractStartDate: typeof ov.contractStartDate === "string" ? new Date(ov.contractStartDate) : d.contractStartDate,
    };
  });
  const tracked = effective.filter((d) => d.tracked !== false);

  const events = await getArrEventsByClient(clientId);
  const ledger = events.filter((e) => e.source !== "hubspot"); // import baselines + manual

  const qStart = periodBounds(currentQuarter()).start.slice(0, 10);
  const sum = (xs: number[]) => xs.reduce((s, n) => s + n, 0);

  const arr = sum(tracked.map((d) => d.amount)) + sum(ledger.map((e) => e.amount));
  const previousArr =
    sum(tracked.filter((d) => d.closeDate && d.closeDate.toISOString().slice(0, 10) <= qStart).map((d) => d.amount)) +
    sum(ledger.filter((e) => e.effectiveDate.slice(0, 10) <= qStart).map((e) => e.amount));

  // Renewal = 1 year after the contract effective date (the latest tracked
  // deal's). Falls back to 1 year after the latest close date when no tracked
  // deal has a contract effective date yet.
  const maxTime = (ds: (Date | null)[]) => {
    const ts = ds.filter((d): d is Date => d != null).map((d) => d.getTime());
    return ts.length ? Math.max(...ts) : null;
  };
  const base = maxTime(tracked.map((d) => d.contractStartDate)) ?? maxTime(tracked.map((d) => d.closeDate));
  let renewalDate: Date | null = null;
  if (base != null) {
    renewalDate = new Date(base);
    renewalDate.setUTCFullYear(renewalDate.getUTCFullYear() + 1);
  }

  const launchDateByDealId = Object.fromEntries(
    Object.entries(dealDates).map(([dealId, dates]) => [dealId, dates?.launch_date]),
  );
  const legacyLaunchDate = props?.launch_date as string | null | undefined;
  const status = computeClientStatus(effective, launchDateByDealId, legacyLaunchDate, statusOverride, arr);

  await db
    .update(schema.clients)
    .set({ arr, previousArr, renewalDate, status, updatedAt: new Date() })
    .where(eq(schema.clients.id, clientId));
}

/**
 * Re-derive the client's HubSpot-owned `referral_source` and
 * `closed_won_date_prop` from the FULL persisted deal history (not the
 * possibly-partial set fetched by an incremental sync). The latest won deal by
 * close date wins — using each deal's EFFECTIVE (CSM-overridden) referralSource
 * and closeDate, so an inline deal-card override actually flows into the
 * client-level field instead of being silently ignored. Skips either field if
 * a human has pinned it directly (client.properties.__field_overrides — e.g.
 * the ClientsTable bulk-edit tool sets referral_source). Merges the computed
 * keys over the existing JSONB so import/admin properties are preserved.
 * No-op for clients with no dated deals.
 */
export async function recomputeClientReferral(clientId: string): Promise<void> {
  const db = getDb();
  const [clientRow] = await db.select({ properties: schema.clients.properties }).from(schema.clients).where(eq(schema.clients.id, clientId));
  const clientProps = clientRow?.properties as Record<string, unknown> | undefined;
  const overrides = dealOverridesMap(clientProps);
  const overridden = fieldOverridesSet(clientProps);

  const rows = await db
    .select({ id: schema.clientDeals.id, closeDate: schema.clientDeals.closeDate, referralSource: schema.clientDeals.referralSource, pipeline: schema.clientDeals.pipeline })
    .from(schema.clientDeals)
    .where(eq(schema.clientDeals.clientId, clientId));

  const effective = rows.map((r) => {
    const ov = overrides[r.id];
    return {
      closeDate: (typeof ov?.closeDate === "string" ? new Date(ov.closeDate) : r.closeDate) ?? null,
      referralSource: (typeof ov?.referralSource === "string" ? ov.referralSource : r.referralSource) ?? null,
      pipeline: r.pipeline,
    };
  });
  const dated = effective.filter((r): r is { closeDate: Date; referralSource: string | null; pipeline: string | null } => r.closeDate != null);
  if (dated.length === 0) return;

  const props: Record<string, unknown> = {};
  // Closed-won date = the latest dated deal of any pipeline.
  if (!overridden.has("closed_won_date_prop")) {
    const latestAny = dated.reduce((a, b) => (b.closeDate.getTime() >= a.closeDate.getTime() ? b : a));
    props.closed_won_date_prop = latestAny.closeDate.toISOString().slice(0, 10);
  }

  // Acquisition channel = the latest ACQUISITION deal (direct/indirect only).
  // CS-pipeline renewals/expansions never set the channel.
  if (!overridden.has("referral_source")) {
    const acq = dated.filter((r) => (r.pipeline === "direct" || r.pipeline === "indirect") && r.referralSource);
    if (acq.length > 0) {
      const latestAcq = acq.reduce((a, b) => (b.closeDate.getTime() >= a.closeDate.getTime() ? b : a));
      props.referral_source = latestAcq.referralSource;
    }
  }
  if (Object.keys(props).length === 0) return;

  await db
    .update(schema.clients)
    .set({ properties: sql`${schema.clients.properties} || ${JSON.stringify(props)}::jsonb`, updatedAt: new Date() })
    .where(eq(schema.clients.id, clientId));
}

/** Remove any column the CSM has manually pinned (client.properties.__field_overrides)
 *  from a sync/import UPDATE set, so a re-sync/re-import never silently replaces it. */
function dropOverriddenFields<T extends Record<string, unknown>>(updateSet: T, overridden: Set<string>): T {
  if (overridden.size === 0) return updateSet;
  return Object.fromEntries(Object.entries(updateSet).filter(([k]) => !overridden.has(k))) as T;
}

/**
 * Sync upsert — updates synced columns but NEVER overwrites app-managed
 * assignment fields (csm, implementation_owner, and their *_source), nor any
 * core column (name/domain/industry/country/employees/segment/startedAt) the
 * CSM has manually corrected via updateClientFields (see lib/client-overrides.ts
 * — those are dropped from the UPDATE set via `existingProperties`, the
 * pre-sync row's properties, passed in by persistSync). CSM and Implementation
 * owners are assigned in-app by the assignment workflow / a super-admin, so a
 * re-sync must leave them untouched (same rule the `tracked` deal flag
 * follows). They are still seeded on INSERT (a brand-new client inserts with
 * null owners, which the assignment workflow then fills in). `properties` is
 * MERGED rather than replaced so HubSpot-owned keys overlay the existing
 * JSONB and import/admin-set properties survive a sync.
 */
async function upsertClient(c: Client, existingProperties?: Record<string, unknown> | null): Promise<void> {
  const db = getDb();
  const row = clientToRow(c);
  const {
    // excluded from the UPDATE set — preserved across syncs:
    properties: _properties,
    csm: _csm,
    csmSource: _csmSource,
    implementationOwner: _implementationOwner,
    implementationOwnerSource: _implementationOwnerSource,
    ...rest
  } = row;
  void _properties; void _csm; void _csmSource; void _implementationOwner; void _implementationOwnerSource;
  const updateSet = dropOverriddenFields(rest, fieldOverridesSet(existingProperties));
  await db
    .insert(schema.clients)
    .values(row)
    .onConflictDoUpdate({
      target: schema.clients.id,
      set: {
        ...updateSet,
        properties: sql`${schema.clients.properties} || ${JSON.stringify(c.properties ?? {})}::jsonb`,
      },
    });
}

/**
 * Import upsert — seeds all columns on INSERT, but on UPDATE of an existing
 * client it preserves the app-managed owners (csm / implementation_owner and
 * their *_source), any CSM-overridden core column (same __field_overrides
 * check as upsertClient), and MERGES properties (rather than replacing them)
 * so a re-import never wipes __deal_overrides/__deal_dates/__deal_briefs/
 * __status_override/__field_overrides. The owners are still set from the
 * spreadsheet the first time a client is created.
 */
async function upsertClientFull(c: Client): Promise<void> {
  const db = getDb();
  const row = clientToRow(c);
  const [existing] = await db.select({ properties: schema.clients.properties }).from(schema.clients).where(eq(schema.clients.id, c.id));
  const {
    properties: _properties,
    csm: _csm,
    csmSource: _csmSource,
    implementationOwner: _implementationOwner,
    implementationOwnerSource: _implementationOwnerSource,
    ...rest
  } = row;
  void _properties; void _csm; void _csmSource; void _implementationOwner; void _implementationOwnerSource;
  const updateSet = dropOverriddenFields(rest, fieldOverridesSet(existing?.properties as Record<string, unknown> | undefined));
  await db
    .insert(schema.clients)
    .values(row)
    .onConflictDoUpdate({
      target: schema.clients.id,
      set: {
        ...updateSet,
        properties: sql`${schema.clients.properties} || ${JSON.stringify(c.properties ?? {})}::jsonb`,
      },
    });
}

async function upsertArrEvent(e: ArrEvent): Promise<void> {
  const db = getDb();
  const row = arrEventToRow(e);
  await db.insert(schema.arrEvents).values(row).onConflictDoUpdate({ target: schema.arrEvents.id, set: row });
}

/**
 * Insert an ARR event only if it doesn't already exist. Used for HubSpot
 * `new_business` events: their ids are deterministic (hs-deal-<id>), and the
 * ledger is append-only/immutable, so a later sync must NOT mutate an existing
 * baseline — in-app renewals/expansions are stored as deltas anchored to that
 * baseline, so overwriting it would silently shift a client's ARR. A genuine
 * deal-amount correction is recorded by a CSM as a manual expansion/contraction.
 */
async function insertArrEventIfAbsent(e: ArrEvent): Promise<void> {
  const db = getDb();
  const row = arrEventToRow(e);
  await db.insert(schema.arrEvents).values(row).onConflictDoNothing({ target: schema.arrEvents.id });
}

/**
 * Persist a full sync bundle, preserving any in-app (non-hubspot) events.
 * Returns the ids of clients that were created for the FIRST time by this sync
 * (brand-new business). Renewals/expansions land on already-existing clients,
 * so those ids are not returned — the assignment workflow runs only for new
 * clients, never re-assigning an account that already has owners.
 */
export async function persistSync(bundle: SyncBundle): Promise<{ newClientIds: string[] }> {
  // Resolve each HubSpot company to an EXISTING client by hubspot_id, so the
  // sync never creates a duplicate row for a company that's already tracked
  // (e.g. one imported from Excel). Import rows — the curated list users
  // browse — win when both an import and a hubspot row exist for a company.
  const existing = await getClientsFromDb();
  const existingIds = new Set(existing.map((c) => c.id));
  const existingById = new Map(existing.map((c) => [c.id, c]));
  const canonical = new Map<string, string>();
  for (const c of existing) {
    if (!c.hubspotId) continue;
    const cur = canonical.get(c.hubspotId);
    if (!cur || c.source === "import") canonical.set(c.hubspotId, c.id);
  }

  const newClients: Client[] = [];
  const brandNewIds: string[] = [];
  for (const c of bundle.clients) {
    const companyId = c.hubspotId ?? c.id;
    const target = canonical.get(companyId);
    const deals = bundle.deals.filter((d) => d.clientId === c.id);

    if (target && target !== c.id) {
      // Company already exists under a different id (matched by hubspot_id) —
      // enrich it with its deals only. Never create a second client row and
      // never add a second ARR baseline (that would double-count revenue).
      await upsertClientDeals(deals.map((d) => ({ ...d, clientId: target })));
      continue;
    }

    // New company, or one that's already hubspot-native — full acquisition.
    if (!existingIds.has(c.id)) brandNewIds.push(c.id);
    await upsertClient(c, existingById.get(c.id)?.properties);
    for (const e of bundle.arrEvents.filter((e) => e.clientId === c.id)) await insertArrEventIfAbsent(e);
    await upsertClientDeals(deals);
    newClients.push(c);
  }

  // Re-materialize ARR + referral only for rows we actually created/updated.
  // Bounded concurrency (matches importClientsDb) instead of one-at-a-time --
  // at 75 clients this was already ~300 serial round trips per sync, holding
  // DB connections open longer than necessary on every single sync run.
  await mapLimit(newClients, 5, (c) => recomputeClient(c.id));
  await mapLimit(newClients, 5, (c) => recomputeClientReferral(c.id));

  return { newClientIds: brandNewIds };
}

/** Append one ARR event and re-materialize the client. */
export async function appendArrEvent(e: ArrEvent): Promise<void> {
  await upsertArrEvent(e);
  await recomputeClient(e.clientId);
}

/** Bulk import / upsert manual clients plus their baseline new_business event. */
export async function importClientsDb(payload: { clients: Client[]; baselineEvents: ArrEvent[] }): Promise<void> {
  // Run each phase with bounded concurrency instead of one-at-a-time, so a
  // 70+ row import isn't ~360 serial round-trips (which froze all browsing
  // behind the single connection). Phases stay ordered: client rows and their
  // baseline events must exist before ARR is re-materialized from the ledger.
  await mapLimit(payload.clients, 5, (c) => upsertClientFull(c));
  await mapLimit(payload.baselineEvents, 5, (e) => upsertArrEvent(e));
  await mapLimit(payload.clients, 5, (c) => recomputeClient(c.id));
}

/** Link an existing (e.g. Excel-imported) client to its HubSpot company id. */
export async function setClientHubspotId(clientId: string, hubspotId: string): Promise<void> {
  const db = getDb();
  await db.update(schema.clients).set({ hubspotId, updatedAt: new Date() }).where(eq(schema.clients.id, clientId));
}


/** Run `fn` over `items` with at most `limit` promises in flight. */
async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      await fn(items[idx]!);
    }
  });
  await Promise.all(workers);
}

/* -------------------------------------------------- property definitions */

type PropDefRow = typeof schema.propertyDefinitions.$inferSelect;

function propDefRowToType(r: PropDefRow): PropertyDefinition {
  return {
    key: r.key,
    label: r.label,
    type: r.type as PropertyDefinition["type"],
    options: (r.options as string[]) ?? [],
    hiddenOptions: (r.hiddenOptions as string[]) ?? [],
    group: r.group as PropertyDefinition["group"],
    sortOrder: r.sortOrder,
    isSystem: r.isSystem,
    isReadOnly: r.isReadOnly,
  };
}

export async function getPropertyDefinitionsFromDb(): Promise<PropertyDefinition[]> {
  const db = getDb();
  const rows = await db.select().from(schema.propertyDefinitions).orderBy(schema.propertyDefinitions.sortOrder);
  return rows.map(propDefRowToType);
}

export async function upsertPropertyDefinition(def: PropertyDefinition): Promise<void> {
  const db = getDb();
  await db
    .insert(schema.propertyDefinitions)
    .values({ key: def.key, label: def.label, type: def.type, options: def.options, hiddenOptions: def.hiddenOptions ?? [], group: def.group, sortOrder: def.sortOrder, isSystem: def.isSystem, isReadOnly: def.isReadOnly })
    .onConflictDoUpdate({
      target: schema.propertyDefinitions.key,
      // hiddenOptions intentionally excluded — sync must never overwrite user's visibility settings
      set: { label: def.label, options: def.options, sortOrder: def.sortOrder },
    });
}

/**
 * Sync-driven upsert for a SYNC-MANAGED option list (the deal-scoped
 * deal_modules/deal_use_cases/etc. picklists reconciled from live HubSpot on
 * every engagement sync — see reconcileDealSelectOptions in
 * lib/integrations/sync.ts). Unlike upsertPropertyDefinition (the admin-driven
 * full upsert), this NEVER touches label/sortOrder/group on conflict — only
 * `options`. Without this distinction, every sync run re-seeds the label from
 * the sync's hardcoded constant, silently reverting any admin rename (this is
 * exactly how the "Package"→"Module" bug happened). Still seeds the full row
 * on first-ever creation (INSERT), since there's nothing to protect yet.
 */
export async function upsertPropertyDefinitionOptions(def: PropertyDefinition): Promise<void> {
  const db = getDb();
  await db
    .insert(schema.propertyDefinitions)
    .values({ key: def.key, label: def.label, type: def.type, options: def.options, hiddenOptions: def.hiddenOptions ?? [], group: def.group, sortOrder: def.sortOrder, isSystem: def.isSystem, isReadOnly: def.isReadOnly })
    .onConflictDoUpdate({
      target: schema.propertyDefinitions.key,
      // label/sortOrder/group/hiddenOptions intentionally excluded — sync
      // must only ever own the option list, never revert an admin's rename.
      set: { options: def.options },
    });
}

export async function updatePropertyHiddenOptions(key: string, hiddenOptions: string[]): Promise<void> {
  const db = getDb();
  await db.update(schema.propertyDefinitions).set({ hiddenOptions }).where(eq(schema.propertyDefinitions.key, key));
}

export async function updatePropertyOptions(key: string, options: string[]): Promise<void> {
  const db = getDb();
  await db.update(schema.propertyDefinitions).set({ options }).where(eq(schema.propertyDefinitions.key, key));
}

export async function addPropertyOption(key: string, option: string): Promise<void> {
  const db = getDb();
  const rows = await db.select({ options: schema.propertyDefinitions.options }).from(schema.propertyDefinitions).where(eq(schema.propertyDefinitions.key, key)).limit(1);
  const current = (rows[0]?.options as string[]) ?? [];
  if (current.includes(option)) return;
  await db.update(schema.propertyDefinitions).set({ options: [...current, option] }).where(eq(schema.propertyDefinitions.key, key));
}

export async function updateClientProperties(clientId: string, properties: Record<string, unknown>): Promise<void> {
  const db = getDb();
  await db.update(schema.clients).set({ properties, updatedAt: new Date() }).where(eq(schema.clients.id, clientId));
}

/** Editable core client columns (ARR/CSM are managed elsewhere). */
export interface ClientFieldUpdate {
  name?: string;
  domain?: string | null;
  industry?: string | null;
  country?: string | null;
  employees?: number | null;
  segment?: Client["segment"];
  status?: Client["status"];
  renewalDate?: string | null; // ISO date
  startedAt?: string | null; // ISO date
}

/**
 * Writes core client columns. Any field in CORE_OVERRIDABLE_FIELDS (name,
 * domain, industry, country, employees, segment, startedAt) is ALSO a
 * HubSpot-synced column — setting it here marks it in
 * client.properties.__field_overrides so upsertClient()/upsertClientFull()
 * know to never silently re-write it from synced/imported data afterward
 * (see lib/client-overrides.ts). status/renewalDate are excluded — they're
 * fully auto-computed by recomputeClient(), never set from this path.
 */
export async function updateClientFields(clientId: string, fields: ClientFieldUpdate): Promise<void> {
  const db = getDb();
  const set: Record<string, unknown> = { updatedAt: new Date() };
  const touched: string[] = [];
  if (fields.name !== undefined) { set.name = fields.name; touched.push("name"); }
  if (fields.domain !== undefined) { set.domain = fields.domain || null; touched.push("domain"); }
  if (fields.industry !== undefined) { set.industry = fields.industry || null; touched.push("industry"); }
  if (fields.country !== undefined) { set.country = fields.country || null; touched.push("country"); }
  if (fields.employees !== undefined) { set.employees = fields.employees; touched.push("employees"); }
  if (fields.segment !== undefined) { set.segment = fields.segment; touched.push("segment"); }
  if (fields.status !== undefined) set.status = fields.status;
  if (fields.renewalDate !== undefined) set.renewalDate = fields.renewalDate ? new Date(fields.renewalDate) : null;
  if (fields.startedAt !== undefined) { set.startedAt = fields.startedAt ? new Date(fields.startedAt) : null; touched.push("startedAt"); }

  if (touched.length > 0) {
    const [row] = await db.select({ properties: schema.clients.properties }).from(schema.clients).where(eq(schema.clients.id, clientId));
    const overridden = fieldOverridesSet(row?.properties as Record<string, unknown> | undefined);
    for (const f of touched) overridden.add(f);
    set.properties = sql`${schema.clients.properties} || ${JSON.stringify({ [FIELD_OVERRIDES_KEY]: [...overridden] })}::jsonb`;
  }

  await db.update(schema.clients).set(set).where(eq(schema.clients.id, clientId));
}

/* ---------------------------------------------------------- csm users */

type CsmUserRow = typeof schema.csmUsers.$inferSelect;

function csmUserRowToCsm(r: CsmUserRow): import("@/lib/types").Csm {
  return { id: r.id, name: r.name, email: r.email, initials: r.initials };
}

export async function getCsmUsersFromDb(): Promise<import("@/lib/types").Csm[]> {
  const db = getDb();
  const rows = await db.select().from(schema.csmUsers).where(eq(schema.csmUsers.active, true));
  return rows.map(csmUserRowToCsm);
}

export async function upsertCsmUser(user: { id: string; name: string; email: string; initials: string }): Promise<void> {
  const db = getDb();
  await db
    .insert(schema.csmUsers)
    .values({ ...user, active: true })
    .onConflictDoUpdate({ target: schema.csmUsers.id, set: { name: user.name, email: user.email, initials: user.initials } });
}

/** Set (or clear, when value is null) a single key on a client's properties
 *  jsonb via read-modify-write, leaving every other property intact. Used for
 *  the usage-environment resolution cache and the manual environment overrides. */
export async function setClientPropertyDb(clientId: string, key: string, value: unknown | null): Promise<void> {
  const db = getDb();
  const rows = await db.select({ properties: schema.clients.properties }).from(schema.clients).where(eq(schema.clients.id, clientId)).limit(1);
  if (rows.length === 0) return;
  const props = { ...((rows[0].properties as Record<string, unknown>) ?? {}) };
  if (value === null) delete props[key];
  else props[key] = value;
  await db.update(schema.clients).set({ properties: props, updatedAt: new Date() }).where(eq(schema.clients.id, clientId));
}

export async function assignCsmToClient(
  clientId: string,
  csm: import("@/lib/types").Csm | null,
  source: import("@/lib/types").AssignmentSource | null = "manual",
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.clients)
    .set({ csm, csmSource: csm ? source : null, updatedAt: new Date() })
    .where(eq(schema.clients.id, clientId));
}

export async function assignImplementationOwnerToClient(
  clientId: string,
  owner: import("@/lib/types").Csm | null,
  source: import("@/lib/types").AssignmentSource | null = "manual",
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.clients)
    .set({ implementationOwner: owner, implementationOwnerSource: owner ? source : null, updatedAt: new Date() })
    .where(eq(schema.clients.id, clientId));
}

/* ----------------------------------------------------------- app users / roles */

export interface AppUserRow {
  email: string;
  name: string | null;
  role: string;
  addedByEmail: string | null;
  createdAt: string;
}

function appUserRowToObj(r: typeof schema.appUsers.$inferSelect): AppUserRow {
  return {
    email: r.email,
    name: r.name,
    role: r.role,
    addedByEmail: r.addedByEmail,
    createdAt: (r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt)).toISOString(),
  };
}

export async function getAppUsersFromDb(): Promise<AppUserRow[]> {
  const db = getDb();
  const rows = await db.select().from(schema.appUsers);
  return rows.map(appUserRowToObj);
}

/** Single-email role lookup — the hot path used on every request to resolve role. */
export async function getAppUserRoleFromDb(email: string): Promise<string | null> {
  const db = getDb();
  const rows = await db.select({ role: schema.appUsers.role }).from(schema.appUsers).where(eq(schema.appUsers.email, email)).limit(1);
  return rows[0]?.role ?? null;
}

export async function upsertAppUserDb(u: { email: string; name?: string | null; role: string; addedByEmail?: string | null }): Promise<void> {
  const db = getDb();
  await db
    .insert(schema.appUsers)
    .values({ email: u.email, name: u.name ?? null, role: u.role, addedByEmail: u.addedByEmail ?? null })
    .onConflictDoUpdate({ target: schema.appUsers.email, set: { name: u.name ?? null, role: u.role } });
}

/** Upsert only the role — creates the row if the user isn't in app_users yet
 *  (e.g. a CSM who appears via csm_users merge but hasn't been explicitly added). */
export async function setAppUserRoleDb(email: string, role: string, name?: string | null): Promise<void> {
  const db = getDb();
  await db
    .insert(schema.appUsers)
    .values({ email, role, name: name ?? null })
    .onConflictDoUpdate({ target: schema.appUsers.email, set: { role } });
}

export async function deleteAppUserDb(email: string): Promise<void> {
  const db = getDb();
  await db.delete(schema.appUsers).where(eq(schema.appUsers.email, email));
}

/* ----------------------------------------------------------------- */

export async function clientExists(id: string): Promise<boolean> {
  const db = getDb();
  const rows = await db.select({ id: schema.clients.id }).from(schema.clients).where(eq(schema.clients.id, id)).limit(1);
  return rows.length > 0;
}

/* --------------------------------------------------------- sync checkpoints */

export async function getSyncCheckpoint(key: string): Promise<string | null> {
  const db = getDb();
  const rows = await db.select().from(schema.syncCheckpoints).where(eq(schema.syncCheckpoints.key, key)).limit(1);
  return rows[0]?.value ?? null;
}

export async function setSyncCheckpoint(key: string, value: string): Promise<void> {
  const db = getDb();
  await db
    .insert(schema.syncCheckpoints)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.syncCheckpoints.key, set: { value, updatedAt: new Date() } });
}

const SYNC_LOCK_KEY = "sync_lock";
const SYNC_LOCK_STALE_MS = 10 * 60 * 1000; // a crashed/killed sync self-heals after 10 min

/**
 * Mutual exclusion for runSync() so a manual "Sync now" click can't overlap
 * the scheduled cron tick (both would re-fetch the same HubSpot window and
 * race recomputeClient for the same clients). A plain row UPDATE, not
 * pg_advisory_lock — Supabase's transaction-mode pooler doesn't guarantee the
 * same backend session across statements, so a session-scoped advisory lock
 * can silently fail to hold (the same class of issue that made
 * `connection: { statement_timeout }` a no-op earlier). This only needs one
 * atomic statement, which works over any pooling mode.
 */
export async function acquireSyncLock(): Promise<boolean> {
  const db = getDb();
  const now = new Date();
  const staleBefore = new Date(now.getTime() - SYNC_LOCK_STALE_MS).toISOString();
  const rows = await db
    .insert(schema.syncCheckpoints)
    .values({ key: SYNC_LOCK_KEY, value: now.toISOString(), updatedAt: now })
    .onConflictDoUpdate({
      target: schema.syncCheckpoints.key,
      set: { value: now.toISOString(), updatedAt: now },
      where: sql`${schema.syncCheckpoints.value} < ${staleBefore}`,
    })
    .returning({ key: schema.syncCheckpoints.key });
  return rows.length > 0;
}

export async function releaseSyncLock(): Promise<void> {
  const db = getDb();
  await db.delete(schema.syncCheckpoints).where(eq(schema.syncCheckpoints.key, SYNC_LOCK_KEY));
}

/* ------------------------------------------------- workspace config (jsonb) */

export async function getWorkspaceConfigFromDb(key: string): Promise<unknown | null> {
  const db = getDb();
  const rows = await db.select().from(schema.workspaceConfig).where(eq(schema.workspaceConfig.key, key)).limit(1);
  return rows[0]?.value ?? null;
}

export async function setWorkspaceConfigDb(key: string, value: unknown): Promise<void> {
  const db = getDb();
  await db
    .insert(schema.workspaceConfig)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.workspaceConfig.key, set: { value, updatedAt: new Date() } });
}

/* ----------------------------------------------------------- notifications */

type NotificationRow = typeof schema.notifications.$inferSelect;

function notificationRowTo(r: NotificationRow): import("@/lib/types").Notification {
  return {
    id: r.id,
    recipientEmail: r.recipientEmail,
    type: r.type as import("@/lib/types").NotificationType,
    title: r.title,
    body: r.body,
    clientId: r.clientId,
    status: (r.status as import("@/lib/types").NotificationStatus) ?? "open",
    readAt: iso(r.readAt),
    dueDate: iso(r.dueDate),
    createdByEmail: r.createdByEmail,
    createdAt: r.createdAt.toISOString(),
  };
}

export interface NewNotification {
  id: string;
  recipientEmail: string;
  type: string;
  title: string;
  body?: string | null;
  clientId?: string | null;
  dueDate?: Date | null;
  createdByEmail?: string | null;
}

/** Insert notifications, skipping any whose id already exists (idempotent —
 *  deterministic ids let a re-run avoid duplicate action items). */
export async function insertNotificationsDb(rows: NewNotification[]): Promise<void> {
  if (rows.length === 0) return;
  const db = getDb();
  await db
    .insert(schema.notifications)
    .values(
      rows.map((n) => ({
        id: n.id,
        recipientEmail: n.recipientEmail.toLowerCase(),
        type: n.type,
        title: n.title,
        body: n.body ?? null,
        clientId: n.clientId ?? null,
        dueDate: n.dueDate ?? null,
        createdByEmail: n.createdByEmail ?? null,
      })),
    )
    .onConflictDoNothing({ target: schema.notifications.id });
}

/** Recent notifications for a recipient (newest first). */
export async function getNotificationsForUserDb(email: string, limit = 50): Promise<import("@/lib/types").Notification[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.notifications)
    .where(eq(schema.notifications.recipientEmail, email.toLowerCase()))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(limit);
  return rows.map(notificationRowTo);
}

/** Count unread (readAt null) notifications — drives the bell badge. */
export async function getUnreadCountForUserDb(email: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ id: schema.notifications.id })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.recipientEmail, email.toLowerCase()), isNull(schema.notifications.readAt)));
  return rows.length;
}

/** Mark one notification read (only if it belongs to `email`). */
export async function markNotificationReadDb(id: string, email: string): Promise<void> {
  const db = getDb();
  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(and(eq(schema.notifications.id, id), eq(schema.notifications.recipientEmail, email.toLowerCase())));
}

/** Mark all of a user's notifications read. */
export async function markAllNotificationsReadDb(email: string): Promise<void> {
  const db = getDb();
  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(and(eq(schema.notifications.recipientEmail, email.toLowerCase()), isNull(schema.notifications.readAt)));
}

/** Resolve (or reopen) an action item the user owns. */
export async function setNotificationStatusDb(id: string, email: string, status: "open" | "done"): Promise<void> {
  const db = getDb();
  await db
    .update(schema.notifications)
    .set({ status })
    .where(and(eq(schema.notifications.id, id), eq(schema.notifications.recipientEmail, email.toLowerCase())));
}

/** Resolve any open action items tied to a client+type (e.g. when an admin
 *  manually re-assigns, clear the "needs admin" item). */
export async function resolveNotificationsForClientDb(clientId: string, types: string[]): Promise<void> {
  if (types.length === 0) return;
  const db = getDb();
  await db
    .update(schema.notifications)
    .set({ status: "done" })
    .where(
      and(
        eq(schema.notifications.clientId, clientId),
        inArray(schema.notifications.type, types),
        eq(schema.notifications.status, "open"),
      ),
    );
}

/** Most recent `createdAt` per client for one notification type — used to
 *  gate a lower-frequency reminder (e.g. "only re-notify every 3 days")
 *  without an N+1 query per client. */
export async function getLatestNotificationDateByType(type: string): Promise<Map<string, Date>> {
  const db = getDb();
  const rows = await db
    .select({ clientId: schema.notifications.clientId, last: sql<string>`max(${schema.notifications.createdAt})` })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.type, type), isNotNull(schema.notifications.clientId)))
    .groupBy(schema.notifications.clientId);
  const map = new Map<string, Date>();
  for (const r of rows) if (r.clientId) map.set(r.clientId, new Date(r.last));
  return map;
}

/* -------------------------------------------------------- admin: clear data */

/**
 * Delete all HubSpot-sourced data from the DB. Used when switching from a
 * full historical sync to incremental-only (reset + re-checkpoint to now).
 */
export async function clearHubspotData(): Promise<{
  clients: number; events: number; deals: number;
  contacts: number; attachments: number; emails: number; meetings: number;
}> {
  const db = getDb();

  // Sequential — single pooled connection must not be double-booked.
  const r1 = await db.delete(schema.clientMeetings).returning({ id: schema.clientMeetings.id });
  const r2 = await db.delete(schema.clientEmails).returning({ id: schema.clientEmails.id });
  const r3 = await db.delete(schema.clientAttachments).where(isNotNull(schema.clientAttachments.hubspotFileId)).returning({ id: schema.clientAttachments.id });
  const r4 = await db.delete(schema.clientContacts).where(isNotNull(schema.clientContacts.hubspotContactId)).returning({ id: schema.clientContacts.id });
  const r5 = await db.delete(schema.clientDeals).returning({ id: schema.clientDeals.id });
  const r6 = await db.delete(schema.arrEvents).where(eq(schema.arrEvents.source, "hubspot")).returning({ id: schema.arrEvents.id });
  const r7 = await db.delete(schema.clients).where(eq(schema.clients.source, "hubspot")).returning({ id: schema.clients.id });

  return {
    clients: r7.length, events: r6.length, deals: r5.length,
    contacts: r4.length, attachments: r3.length, emails: r2.length, meetings: r1.length,
  };
}

/**
 * Strip the per-deal CSM override bag (__deal_overrides) from every client's
 * properties — the "factory reset" half of a Full re-sync, so HubSpot's current
 * values show through again. Milestone dates (__deal_dates) and brief overrides
 * (__deal_briefs) are intentionally preserved (no HubSpot source to restore).
 * Returns the number of client rows that actually carried overrides.
 */
export async function clearDealOverrides(): Promise<number> {
  const db = getDb();
  const rows = await db
    .update(schema.clients)
    .set({ properties: sql`${schema.clients.properties} - '__deal_overrides'`, updatedAt: new Date() })
    .where(sql`${schema.clients.properties} ? '__deal_overrides'`)
    .returning({ id: schema.clients.id });
  return rows.length;
}

/* ------------------------------------------------------------ usage cache */

/** The persisted Metabase usage snapshot for a client, or null if it has
 *  never been synced yet (caller should fall back to a live fetch). */
export async function getClientUsageSnapshotFromDb(clientId: string): Promise<UsageSnapshot | null> {
  const db = getDb();
  const [row] = await db.select().from(schema.clientUsageSnapshots).where(eq(schema.clientUsageSnapshots.clientId, clientId));
  if (!row) return null;
  return {
    status: "ok",
    environmentId: row.environmentId,
    environmentName: row.environmentName,
    region: row.region as "aws" | "ksa",
    fetchedAt: row.fetchedAt.toISOString(),
    metrics: row.metrics,
    trends: row.trends,
    learning: row.learning,
    score: row.score,
  };
}

/** Persist a freshly-fetched usage snapshot (clears any prior sync_error). */
export async function upsertClientUsageSnapshot(clientId: string, snap: UsageSnapshot): Promise<void> {
  const db = getDb();
  const row = {
    clientId,
    environmentId: snap.environmentId,
    region: snap.region,
    environmentName: snap.environmentName,
    metrics: snap.metrics,
    trends: snap.trends,
    learning: snap.learning,
    score: snap.score,
    fetchedAt: new Date(snap.fetchedAt),
    syncError: null,
    updatedAt: new Date(),
  };
  await db.insert(schema.clientUsageSnapshots).values(row).onConflictDoUpdate({ target: schema.clientUsageSnapshots.clientId, set: row });
}

/** Record a sync failure WITHOUT touching the last-good snapshot (if any) —
 *  a transient Metabase hiccup should never blank out an already-working tab. */
export async function recordClientUsageSyncError(clientId: string, message: string): Promise<void> {
  const db = getDb();
  await db
    .update(schema.clientUsageSnapshots)
    .set({ syncError: message, updatedAt: new Date() })
    .where(eq(schema.clientUsageSnapshots.clientId, clientId));
}

/* ------------------------------------------------------------- empties */

function emptyHealth(): HealthScore {
  return { score: 0, tier: "at_risk", components: { usage: 0, sentiment: 0, support: 0, engagement: 0, relationship: 0 }, trend: 0, updatedAt: new Date(0).toISOString() };
}
function emptySupport(): SupportSummary {
  return { openTickets: 0, snoozedTickets: 0, closedLast30d: 0, oldestOpenDays: null, medianFirstResponseHours: null, csat: null, csatScale: "percent", csatResponses: 0, nps: null, npsResponses: 0, lastConversationAt: null };
}
function emptyUsage(): UsageMetrics {
  return { seats: 0, activeUsers: 0, adoptionRate: 0, wau: 0, mau: 0, stickiness: 0, lastActiveAt: null, featureAdoption: [], activityTrend: [] };
}
