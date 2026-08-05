/* =========================================================================
   Backfill the Communication tab's stakeholder matrix into stakeholder
   profiles — the pure half, so every rule below is testable without a database.

   WHAT THE LEGACY DATA IS. `clients.properties.stakeholder_mappings` is an
   array of `{ type, contactIds[], staffIds[] }` — a ROLE-keyed matrix, not a
   person-keyed one. One row is one role holding many people, so a person who
   appears in three rows holds three roles. It has no ids of its own.

   That shape decides three things:

     · The stable identity of one legacy association is the tuple
       `<clientId>|<role>|<contactId>`. It is the idempotency key, because
       there is nothing else to key on.
     · The migration is an INVERSION — role->people becomes person->roles.
       107 associations across 79 people, so profiles are fewer than
       associations by design and the two counts must never be reconciled
       against each other.
     · Multiple roles are the normal case (24 of 79 people), not an edge one.

   WHAT IT REFUSES TO DO. It does not invent relationship intelligence. Every
   graded field stays `unknown`, which the model already treats as "not
   assessed" rather than as a middling value — a migrated Champion with
   sentiment "neutral" would read as a judgement a CSM never made. It does not
   create stakeholder links: the legacy matrix holds no evidence of who reports
   to whom, and a guessed org chart is worse than an empty one. It does not
   touch a field a person has typed.
   ========================================================================= */

import type { StakeholderMapping } from "@/lib/stakeholders";
import {
  MIGRATION_VERSION, STAKEHOLDER_ROLES,
  type StakeholderProfile, type StakeholderRole,
} from "./profile";

/** The minimum a contact must give us to be worth a profile. */
export interface MigrationContact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  jobTitle: string | null;
  phone?: string | null;
}

export interface MigrationException {
  clientId: string;
  clientName: string;
  legacyRole: string;
  contactId: string | null;
  reason: string;
  /** What a human should do about it. */
  resolution: string;
}

export interface ClientMigrationPlan {
  clientId: string;
  clientName: string;
  /** Profiles to write — new ones and updates to existing ones alike. */
  upserts: StakeholderProfile[];
  created: number;
  reconciled: number;
  /** Associations already carried by a profile at the right version. */
  unchanged: number;
  rolesPreserved: number;
  exceptions: MigrationException[];
}

/** Legacy role label -> new role id. Every value here exists in
 *  STAKEHOLDER_ROLES; anything not listed is reported, never guessed. */
const ROLE_ALIASES: Record<string, StakeholderRole> = {
  executive_sponsor: "executive_sponsor",
  champion: "champion",
  economic_buyer: "economic_buyer",
  decision_maker: "decision_maker",
  technical_evaluator: "technical_evaluator",
  procurement: "procurement",
  legal: "legal",
  administrator: "administrator",
  admin: "administrator",
  manager: "manager",
  implementer: "implementer",
  end_user_representative: "end_user_representative",
  end_user: "end_user_representative",
  blocker: "blocker",
  /* Both were live in the retired matrix — 27 Power Users and 16 Gatekeepers,
     40% of all associations. They are first-class roles in the new model
     rather than aliases onto a near-neighbour, because neither HAS a near
     neighbour that means the same thing. */
  power_user: "power_user",
  gatekeeper: "gatekeeper",
  other: "other",
};

const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

export function resolveLegacyRole(label: string): StakeholderRole | null {
  const key = slug(label);
  if (!key) return null;
  const mapped = ROLE_ALIASES[key];
  if (mapped) return mapped;
  // A role id that matches directly (config renamed to the new vocabulary).
  return (STAKEHOLDER_ROLES as readonly string[]).includes(key) ? (key as StakeholderRole) : null;
}

export const legacyKeyFor = (clientId: string, role: string, contactId: string) =>
  `${clientId}|${slug(role)}|${contactId}`;

/**
 * Work out what one client needs, without writing anything.
 *
 * `newId` is injected rather than generated so a dry run and the real run
 * produce identical plans for everything except the ids, and so tests are
 * deterministic. Same for `now`.
 */
export function planClientMigration(args: {
  clientId: string;
  clientName: string;
  mappings: StakeholderMapping[];
  contacts: MigrationContact[];
  existing: StakeholderProfile[];
  /** Lumofy staff id -> email, for the `staffIds` side of the matrix. */
  staffEmails?: Record<string, string>;
  now: string;
  newId: (seed: string) => string;
}): ClientMigrationPlan {
  const { clientId, clientName, mappings, contacts, existing, staffEmails = {}, now, newId } = args;
  const plan: ClientMigrationPlan = {
    clientId, clientName, upserts: [], created: 0, reconciled: 0, unchanged: 0,
    rolesPreserved: 0, exceptions: [],
  };

  const contactById = new Map(contacts.map((c) => [c.id, c]));

  /* Invert the matrix: role->people becomes person->roles. Also collect the
     Lumofy staff named against each of that person's roles — the legacy matrix
     attaches staff to a ROLE, the new model to a PERSON, so a person inherits
     the owner of the roles they hold. */
  const rolesByContact = new Map<string, { roles: Set<StakeholderRole>; labels: string[]; owners: Set<string> }>();

  for (const m of mappings) {
    const role = resolveLegacyRole(m.type);
    const owners = m.staffIds.map((id) => staffEmails[id]).filter((e): e is string => !!e);

    if (!m.contactIds.length) continue; // an empty role slot is not data loss

    if (!role) {
      for (const cid of m.contactIds) {
        plan.exceptions.push({
          clientId, clientName, legacyRole: m.type, contactId: cid,
          reason: `Legacy role "${m.type}" has no equivalent in the stakeholder model`,
          resolution: `Add "${slug(m.type)}" to STAKEHOLDER_ROLES, or map it to an existing role in ROLE_ALIASES, then re-run.`,
        });
      }
      continue;
    }

    for (const cid of m.contactIds) {
      const contact = contactById.get(cid);
      if (!contact) {
        plan.exceptions.push({
          clientId, clientName, legacyRole: m.type, contactId: cid,
          reason: "Mapped contact no longer exists on this account",
          resolution: "Confirm whether the person left; if they are still relevant, create the stakeholder by hand. The legacy row is left untouched.",
        });
        continue;
      }
      if (!contact.firstName && !contact.lastName && !contact.email) {
        plan.exceptions.push({
          clientId, clientName, legacyRole: m.type, contactId: cid,
          reason: "Contact has neither a name nor an email — nothing to identify the person by",
          resolution: "Fix the contact record in HubSpot and re-run, or create the stakeholder by hand.",
        });
        continue;
      }
      const entry = rolesByContact.get(cid) ?? { roles: new Set(), labels: [], owners: new Set() };
      entry.roles.add(role);
      entry.labels.push(m.type);
      owners.forEach((o) => entry.owners.add(o.toLowerCase()));
      rolesByContact.set(cid, entry);
    }
  }

  /* §7 identity resolution. The legacy matrix stores contact IDS, so the match
     is exact — priority 1 in the spec's ladder, and no email or name matching
     is ever needed. That is why this migration has no ambiguous cases: there
     is nothing to infer. */
  const byContactId = new Map(existing.filter((p) => p.contactId).map((p) => [p.contactId as string, p]));

  for (const [contactId, { roles, owners }] of rolesByContact) {
    const contact = contactById.get(contactId)!;
    const roleList = [...roles].sort();
    const legacyKey = legacyKeyFor(clientId, roleList.join("+"), contactId);
    const prior = byContactId.get(contactId);

    if (prior) {
      /* Reconcile, never overwrite. Roles are merged because a legacy role is
         evidence in its own right; every other field is left exactly as the
         CSM typed it, including ones still reading "unknown" — a blank they
         chose to leave is not ours to fill. */
      const merged = [...new Set([...prior.roles, ...roleList])].sort();
      const rolesChanged = merged.length !== prior.roles.length;
      const alreadyDone = prior.migration?.legacyKey === legacyKey && prior.migration.version === MIGRATION_VERSION;

      if (!rolesChanged && alreadyDone) { plan.unchanged++; plan.rolesPreserved += roleList.length; continue; }

      plan.upserts.push({
        ...prior,
        roles: merged as StakeholderRole[],
        // Only fill an owner the CSM has not set.
        ownerEmail: prior.ownerEmail ?? (owners.size === 1 ? [...owners][0] : null),
        updatedAt: now,
        migration: {
          legacyKey, version: MIGRATION_VERSION, migratedAt: now,
          from: "stakeholder_mappings", reconciledWith: prior.id,
        },
      });
      plan.reconciled++;
      plan.rolesPreserved += roleList.length;
      continue;
    }

    /* A person with more than one Lumofy name against their roles gets none:
       ownerEmail is single-valued and picking one would assert an ownership
       nobody agreed. Reported so it is visible rather than silently dropped. */
    if (owners.size > 1) {
      plan.exceptions.push({
        clientId, clientName, legacyRole: roleList.join(" + "), contactId,
        reason: `${owners.size} different Lumofy staff were mapped against this person's roles`,
        resolution: "Set the relationship owner by hand on the stakeholder; the profile is created either way.",
      });
    }

    plan.upserts.push({
      id: newId(legacyKey),
      contactId,
      firstName: contact.firstName,
      lastName: contact.lastName,
      preferredName: null,
      jobTitle: contact.jobTitle,
      department: null, company: null, location: null, photoUrl: null,
      email: contact.email ? contact.email.toLowerCase() : null,
      phone: contact.phone ?? null,
      mobile: null, linkedinUrl: null,
      // Every graded field stays unspecified. See the header.
      preferredChannel: "unknown",
      timezone: null,
      roles: roleList as StakeholderRole[],
      influence: "unknown",
      decisionAuthority: "unknown",
      sentiment: "unknown",
      relationshipStrength: "unknown",
      engagementStatus: "unknown",
      ownerEmail: owners.size === 1 ? [...owners][0] : null,
      lastContactedAt: null,
      nextEngagementAt: null,
      notes: null,
      tags: [],
      source: "migration",
      migration: { legacyKey, version: MIGRATION_VERSION, migratedAt: now, from: "stakeholder_mappings", reconciledWith: null },
      createdAt: now,
      // The original author is unknowable — the legacy matrix records no
      // creator — so the migration names itself rather than crediting someone.
      createdBy: "system:stakeholder-migration",
      updatedAt: now,
      updatedBy: "system:stakeholder-migration",
    });
    plan.created++;
    plan.rolesPreserved += roleList.length;
  }

  return plan;
}
