/* =========================================================================
   Stakeholder PROFILES — the first-class account-relationship record.

   What already existed, and why it isn't enough:

     lib/stakeholders.ts   StakeholderMapping { type, contactIds[], staffIds[] }
                           A role -> contact MATRIX. It says "Ahmed is the
                           Champion"; it holds nothing about Ahmed.

     Contact               8 HubSpot-synced fields: names, email, phone,
                           jobTitle, isPrimary. Read-only in practice — the
                           sync owns it.

   Neither can express influence, sentiment, decision authority, who reports
   to whom, or which critical role is missing before a renewal — the questions
   a CSM actually opens the account to answer. So a profile is a record ABOUT a
   person in the context of ONE account, and it deliberately does not try to
   replace Contact: when a profile is backed by a synced contact it carries the
   contactId and treats HubSpot as the source of truth for identity, layering
   only the relationship intelligence on top. A profile with no contactId is a
   person the CSM knows about who was never in HubSpot — equally valid.

   STORAGE. These live in clients.properties JSONB under `stakeholder_profiles`
   and `stakeholder_links`, written through the atomic `properties || patch`
   merge (see mergeClientPropertiesDb). That matches how cs_pulse, cs_health,
   churn_reasons and stakeholder_mappings are already persisted, and it means no
   production migration is required to ship this. Per-account stakeholder sets
   are small (tens, not thousands), so the blob stays well inside sane JSONB
   size. drizzle/stakeholder-tables.sql carries the equivalent relational schema
   for when this is worth promoting to real tables — the field names match
   one-for-one so that promotion is a data move, not a rewrite.

   EVERY reader goes through normalizeStakeholderProfiles(). Like
   normalizeStakeholderMappings before it, it upgrades older shapes in memory on
   read rather than migrating on write, so a half-written or hand-edited blob
   can never crash the profile page.
   ========================================================================= */

/* ---------------------------------------------------------------- roles */

/** A stakeholder's role(s) in the account. Multiple are allowed on purpose:
 *  the same person is very often both Champion and Administrator, and forcing
 *  a single choice loses the more useful half of that fact. */
export const STAKEHOLDER_ROLES = [
  "executive_sponsor",
  "champion",
  "economic_buyer",
  "decision_maker",
  "technical_evaluator",
  "procurement",
  "legal",
  "administrator",
  "manager",
  "implementer",
  "end_user_representative",
  "blocker",
  /* power_user and gatekeeper exist because the retired Communication matrix
     used them and 43 of its 107 role associations — 40% — carried one of the
     two. Neither has an honest equivalent here: a Power User is not an
     "end-user representative" (they are the heaviest user, not a delegate) and
     a Gatekeeper is not a "blocker" (they control access, which is not the
     same as opposing you). Folding them into the nearest existing id would
     have silently reinterpreted 43 records a CSM entered deliberately. */
  "power_user",
  "gatekeeper",
  "other",
] as const;
export type StakeholderRole = (typeof STAKEHOLDER_ROLES)[number];

export const ROLE_LABEL: Record<StakeholderRole, string> = {
  executive_sponsor: "Executive sponsor",
  champion: "Champion",
  economic_buyer: "Economic buyer",
  decision_maker: "Decision-maker",
  technical_evaluator: "Technical evaluator",
  procurement: "Procurement",
  legal: "Legal",
  administrator: "Administrator",
  manager: "Manager",
  implementer: "Implementer",
  end_user_representative: "End-user representative",
  blocker: "Blocker / detractor",
  power_user: "Power user",
  gatekeeper: "Gatekeeper",
  other: "Other",
};

/* ------------------------------------------------------- graded scales */

export const INFLUENCE_LEVELS = ["low", "medium", "high", "unknown"] as const;
export type InfluenceLevel = (typeof INFLUENCE_LEVELS)[number];

export const DECISION_AUTHORITY = ["none", "influencer", "recommender", "approver", "unknown"] as const;
export type DecisionAuthority = (typeof DECISION_AUTHORITY)[number];

/** Deliberately includes "unknown" AS A VALUE rather than using null. "We have
 *  not assessed how this person feels about us" is a different, and more
 *  actionable, statement than "neutral" — and the coverage rules below need to
 *  tell them apart. */
export const SENTIMENTS = ["champion", "supportive", "neutral", "sceptical", "detractor", "unknown"] as const;
export type Sentiment = (typeof SENTIMENTS)[number];

export const RELATIONSHIP_STRENGTHS = ["strong", "moderate", "weak", "none", "unknown"] as const;
export type RelationshipStrength = (typeof RELATIONSHIP_STRENGTHS)[number];

export const ENGAGEMENT_STATUSES = ["active", "occasional", "dormant", "unresponsive", "left_company", "unknown"] as const;
export type EngagementStatus = (typeof ENGAGEMENT_STATUSES)[number];

export const COMMUNICATION_CHANNELS = ["email", "phone", "whatsapp", "teams", "slack", "in_person", "unknown"] as const;
export type CommunicationChannel = (typeof COMMUNICATION_CHANNELS)[number];

export const SENTIMENT_LABEL: Record<Sentiment, string> = {
  champion: "Champion", supportive: "Supportive", neutral: "Neutral",
  sceptical: "Sceptical", detractor: "Detractor", unknown: "Not assessed",
};
export const INFLUENCE_LABEL: Record<InfluenceLevel, string> = {
  low: "Low", medium: "Medium", high: "High", unknown: "Not assessed",
};
export const AUTHORITY_LABEL: Record<DecisionAuthority, string> = {
  none: "No authority", influencer: "Influencer", recommender: "Recommender",
  approver: "Approver", unknown: "Not assessed",
};
export const STRENGTH_LABEL: Record<RelationshipStrength, string> = {
  strong: "Strong", moderate: "Moderate", weak: "Weak", none: "No relationship", unknown: "Not assessed",
};
export const ENGAGEMENT_LABEL: Record<EngagementStatus, string> = {
  active: "Active", occasional: "Occasional", dormant: "Dormant",
  unresponsive: "Unresponsive", left_company: "Left the company", unknown: "Not assessed",
};
export const CHANNEL_LABEL: Record<CommunicationChannel, string> = {
  email: "Email", phone: "Phone", whatsapp: "WhatsApp", teams: "Microsoft Teams",
  slack: "Slack", in_person: "In person", unknown: "Not set",
};

/* -------------------------------------------------------- the record */

export interface StakeholderProfile {
  /** Our id — stable across HubSpot re-syncs. `sh_<uuid>`. */
  id: string;
  /** The synced contact this profile describes, when there is one. HubSpot
   *  stays the source of truth for that contact's identity fields; anything
   *  typed here overrides it for display (see resolveIdentity). */
  contactId: string | null;

  // identity
  firstName: string | null;
  lastName: string | null;
  preferredName: string | null;
  jobTitle: string | null;
  department: string | null;
  /** Employer, when it isn't the account itself — partners, resellers,
   *  consultants sitting in the account's decision process. */
  company: string | null;
  location: string | null;
  photoUrl: string | null;

  // contact details
  email: string | null;
  phone: string | null;
  mobile: string | null;
  linkedinUrl: string | null;
  preferredChannel: CommunicationChannel;
  timezone: string | null;

  // relationship context
  roles: StakeholderRole[];
  influence: InfluenceLevel;
  decisionAuthority: DecisionAuthority;
  sentiment: Sentiment;
  relationshipStrength: RelationshipStrength;
  engagementStatus: EngagementStatus;
  /** Email of the Lumofy person who owns this relationship. */
  ownerEmail: string | null;
  /** ISO date (YYYY-MM-DD). */
  lastContactedAt: string | null;
  nextEngagementAt: string | null;

  notes: string | null;
  tags: string[];

  /** Where this record came from. `migration` marks a profile created by the
   *  Communication-matrix backfill: it is a real, mapped stakeholder, but its
   *  relationship fields were never captured, so the UI can offer enrichment
   *  without implying the record is untrustworthy. */
  source: StakeholderSource;
  /** Provenance for the backfill — idempotency key, audit trail, and the
   *  evidence a rollback would be reconciled against. Null on anything a
   *  person created. */
  migration: StakeholderMigrationMeta | null;

  // audit — who last touched this, for a record several people edit
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

/* ---------------------------------------------------------- provenance */

export const STAKEHOLDER_SOURCES = ["manual", "migration"] as const;
export type StakeholderSource = (typeof STAKEHOLDER_SOURCES)[number];

/** Bump when the backfill's behaviour changes in a way that would make a
 *  re-run produce different records; the runner uses it to tell "already
 *  migrated" from "migrated by an older, superseded pass". */
export const MIGRATION_VERSION = 1;

export interface StakeholderMigrationMeta {
  /** Stable identity of the legacy row this came from:
   *  `<clientId>|<role label>|<contactId>`. The legacy matrix has no ids of
   *  its own — it is a bare array on clients.properties — so the tuple that
   *  uniquely identifies one association IS the key. Re-running the backfill
   *  matches on this and updates instead of inserting. */
  legacyKey: string;
  version: number;
  migratedAt: string;
  /** The property key it was read out of, so the rollback source is named in
   *  the record rather than in a runbook someone has to find. */
  from: string;
  /** Set when the backfill merged into a profile that already existed rather
   *  than creating one — §7's reconciliation case. */
  reconciledWith?: string | null;
}

/* ------------------------------------------------------- relationships */

export const LINK_KINDS = ["reports_to", "influences", "works_with", "blocks", "sponsors", "introduced_by"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

export const LINK_LABEL: Record<LinkKind, string> = {
  reports_to: "Reports to", influences: "Influences", works_with: "Works with",
  blocks: "Blocks", sponsors: "Sponsors", introduced_by: "Introduced by",
};

/** Only `reports_to` implies hierarchy; the rest are lateral. The relationship
 *  map uses this to decide what can form a tree and what must be drawn as an
 *  overlay, so a cyclic "influences" pair can't wedge the layout. */
export const HIERARCHICAL_LINKS = new Set<LinkKind>(["reports_to"]);

export interface StakeholderLink {
  id: string;
  fromId: string;
  toId: string;
  kind: LinkKind;
  note: string | null;
  createdAt: string;
  createdBy: string | null;
}

/* ------------------------------------------------------- normalisation */

const oneOf = <T extends string>(allowed: readonly T[], v: unknown, fallback: T): T =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

const str = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
};

const isoDate = (v: unknown): string | null => {
  const s = str(v);
  if (!s) return null;
  // Accept a full ISO timestamp too — store the date part only.
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};

const strArray = (v: unknown): string[] =>
  Array.isArray(v) ? Array.from(new Set(v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()))) : [];

function normalizeMigrationMeta(raw: unknown): StakeholderMigrationMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const legacyKey = str(r.legacyKey);
  // Without the key it is not provenance — it cannot be matched on a re-run,
  // so keeping it would let the backfill duplicate the record it describes.
  if (!legacyKey) return null;
  return {
    legacyKey,
    version: typeof r.version === "number" ? r.version : 0,
    migratedAt: str(r.migratedAt) ?? "",
    from: str(r.from) ?? "stakeholder_mappings",
    reconciledWith: str(r.reconciledWith),
  };
}

export function normalizeStakeholderProfile(raw: unknown): StakeholderProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id);
  if (!id) return null; // an id-less row can't be edited or linked — drop it

  const roles = strArray(r.roles).filter((x): x is StakeholderRole =>
    (STAKEHOLDER_ROLES as readonly string[]).includes(x));

  const now = new Date().toISOString();
  return {
    id,
    contactId: str(r.contactId),
    firstName: str(r.firstName),
    lastName: str(r.lastName),
    preferredName: str(r.preferredName),
    jobTitle: str(r.jobTitle),
    department: str(r.department),
    company: str(r.company),
    location: str(r.location),
    photoUrl: str(r.photoUrl),
    email: str(r.email)?.toLowerCase() ?? null,
    phone: str(r.phone),
    mobile: str(r.mobile),
    linkedinUrl: str(r.linkedinUrl),
    preferredChannel: oneOf(COMMUNICATION_CHANNELS, r.preferredChannel, "unknown"),
    timezone: str(r.timezone),
    roles,
    influence: oneOf(INFLUENCE_LEVELS, r.influence, "unknown"),
    decisionAuthority: oneOf(DECISION_AUTHORITY, r.decisionAuthority, "unknown"),
    sentiment: oneOf(SENTIMENTS, r.sentiment, "unknown"),
    relationshipStrength: oneOf(RELATIONSHIP_STRENGTHS, r.relationshipStrength, "unknown"),
    engagementStatus: oneOf(ENGAGEMENT_STATUSES, r.engagementStatus, "unknown"),
    ownerEmail: str(r.ownerEmail)?.toLowerCase() ?? null,
    lastContactedAt: isoDate(r.lastContactedAt),
    nextEngagementAt: isoDate(r.nextEngagementAt),
    notes: str(r.notes),
    tags: strArray(r.tags),
    source: oneOf(STAKEHOLDER_SOURCES, r.source, "manual"),
    migration: normalizeMigrationMeta(r.migration),
    createdAt: str(r.createdAt) ?? now,
    createdBy: str(r.createdBy),
    updatedAt: str(r.updatedAt) ?? str(r.createdAt) ?? now,
    updatedBy: str(r.updatedBy),
  };
}

export function normalizeStakeholderProfiles(raw: unknown): StakeholderProfile[] {
  if (!Array.isArray(raw)) return [];
  const out: StakeholderProfile[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const p = normalizeStakeholderProfile(item);
    if (!p || seen.has(p.id)) continue; // last-write-wins would hide a bug; first wins and stays stable
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

export function normalizeStakeholderLinks(raw: unknown, knownIds?: Set<string>): StakeholderLink[] {
  if (!Array.isArray(raw)) return [];
  const out: StakeholderLink[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const id = str(r.id), fromId = str(r.fromId), toId = str(r.toId);
    if (!id || !fromId || !toId || fromId === toId) continue; // self-links are meaningless
    // Drop edges pointing at deleted stakeholders rather than rendering a
    // dangling node — the map would otherwise show ghosts.
    if (knownIds && (!knownIds.has(fromId) || !knownIds.has(toId))) continue;
    const kind = oneOf(LINK_KINDS, r.kind, "works_with");
    const dedupe = `${fromId}|${toId}|${kind}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({
      id, fromId, toId, kind,
      note: str(r.note),
      createdAt: str(r.createdAt) ?? new Date().toISOString(),
      createdBy: str(r.createdBy),
    });
  }
  return out;
}

/* ------------------------------------------------------------- helpers */

/** Display name, honouring a preferred name over the formal one. Falls back
 *  through email so a half-filled record is never a blank row. */
export function stakeholderName(p: Pick<StakeholderProfile, "preferredName" | "firstName" | "lastName" | "email">): string {
  if (p.preferredName) return p.preferredName;
  const full = [p.firstName, p.lastName].filter(Boolean).join(" ").trim();
  if (full) return full;
  return p.email ?? "Unnamed stakeholder";
}

export function stakeholderInitials(p: Pick<StakeholderProfile, "preferredName" | "firstName" | "lastName" | "email">): string {
  const name = stakeholderName(p);
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/** Roles that carry commercial weight, used by the coverage rules. */
export const CRITICAL_ROLES: StakeholderRole[] = ["executive_sponsor", "champion", "economic_buyer", "decision_maker"];

export const PROFILES_KEY = "stakeholder_profiles";
export const LINKS_KEY = "stakeholder_links";
