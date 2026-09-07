/* =========================================================================
   Prototype data — the Contract Term model.

   Shaped by the seven decisions, so the code says what was agreed:
     Relationship → Term → Deal, in combination
     Signal owns Terms; HubSpot owns Deals, read-only
     Terms are proposed by the system, confirmed by a CSM
     Unconfirmed terms count, marked unconfirmed
     Obligations are first-class on the Term
     Confirming a Term generates a project; milestones carry provenance
     A Contracts tab, with each Term on its own route

   ONLY the Lumofy Scope term is real — transcribed from the live ARMS
   profile and its contract brief. The Go1 and Pilot terms are invented to
   show the proposed and ended states, and are labelled as such in the UI.
   ========================================================================= */

export const NOW = "2026-09-01";

export type TermState = "proposed" | "confirmed" | "ended";

/** A commitment the contract makes. Lives on the Term because it exists on
 *  signature — whether or not anyone has planned the work yet. */
export interface Obligation {
  id: string;
  label: string;
  /** Contracted count, where the commitment is quantified. */
  quantity: number | null;
  /** Completed count (or 0/1 for an unquantified commitment). */
  done: number;
  /** When it must be met. Null for a standing entitlement with no date. */
  due: string | null;
  /** Free text for a cadence a single date can't express. */
  cadence: string | null;
  /** What happens if it's missed — recorded because it's a contract term,
   *  not because Signal calculates anything from it. */
  consequence: string | null;
  /** The generated milestone that delivers this, once a project exists.
   *  Provenance runs the other way too: that milestone is flagged
   *  `contractual`, so deleting it surfaces here as a discrepancy. */
  milestoneId: string | null;
}

export interface TermDeal {
  id: string;
  name: string;
  amount: number;
  closedOn: string | null;
  hubspotUrl: string;
  /** Why this deal is attached — signature, expansion, or a correction. */
  role: "signed" | "expanded" | "amended";
}

export interface ActivityEntry {
  id: string;
  who: string;
  what: string;
  when: string;
}

export interface Term {
  id: string;
  /** Human-referenceable identifier, the way an issue tracker gives one. */
  key: string;
  name: string;
  state: TermState;
  /** True where the figures came from a deal and no human has agreed them. */
  start: string | null;
  end: string | null;
  /** Days of written notice. Signal-owned — HubSpot has nowhere to put it. */
  noticeDays: number | null;
  value: number;
  confirmedBy: string | null;
  confirmedAt: string | null;
  obligations: Obligation[];
  /** Generated at confirmation. Null while proposed. */
  project: { id: string; name: string; milestonesTotal: number; milestonesPresent: number } | null;
  deals: TermDeal[];
  /** The term this one follows. */
  supersedes: string | null;
  /** Prototype scaffolding — flags the rows that are not the user's data. */
  illustrative?: boolean;
  brief?: string | null;
  activity: ActivityEntry[];
}

export interface Relationship {
  accountId: string;
  accountName: string;
  since: string;
  terms: Term[];
}

/* ------------------------------------------------------------------ ARMS */

export const ARMS: Relationship = {
  accountId: "arms",
  accountName: "Awqaf Real Estate Management Services",
  since: "2025-02-01",
  terms: [
    {
      id: "t-scope",
      key: "ARMS-4",
      name: "Lumofy Scope",
      state: "confirmed",
      start: "2026-08-16",
      end: "2027-08-16",
      // RFP010-2026: written notice at least 30 days before expiry.
      noticeDays: 30,
      value: 24480,
      confirmedBy: "Hussain Alsayyad",
      confirmedAt: "2026-08-20",
      supersedes: "t-go1",
      obligations: [
        {
          id: "o-content",
          label: "Custom content items",
          quantity: 20,
          done: 3,
          due: "2027-08-16",
          cadence: "Annex 2 — 12-month activation cadence",
          consequence: "Delay penalties apply per Annex 2",
          milestoneId: "m-content",
        },
        {
          id: "o-launch",
          label: "Guided implementation to launch",
          quantity: null,
          done: 0,
          due: "2026-09-21",
          cadence: null,
          consequence: null,
          milestoneId: "m-launch",
        },
        {
          id: "o-support",
          label: "Level 2 support for the term",
          quantity: null,
          done: 0,
          due: null,
          cadence: "Standing entitlement",
          consequence: null,
          milestoneId: null,
        },
      ],
      project: { id: "p-arms", name: "ARMS — Lumofy Scope delivery", milestonesTotal: 22, milestonesPresent: 21 },
      deals: [
        {
          id: "d-scope",
          name: "Awqaf Real Estate–Lumofy Scope",
          amount: 24480,
          closedOn: "2026-08-18",
          hubspotUrl: "#",
          role: "signed",
        },
      ],
      brief:
        "Government-linked account — ARMS is a wholly owned subsidiary of Awqaf Investment Company, the investment arm of the General Authority for Awqaf. Procurement discipline, publicity, data protection and evidence all follow from that.\n\n" +
        "Endowment rules mean ARMS cannot sell property. Returns come from leasing only, under a board of trustees. They cannot trade their way out of a problem, so operating efficiency is the only lever — which makes workforce capability a board-level topic here, not an HR one.\n\n" +
        "Two things decide this account: whether delivery lands, and whether the 20 contracted content items get built.",
      activity: [
        { id: "a1", who: "Signal", what: "proposed this term from Awqaf Real Estate–Lumofy Scope", when: "2026-08-18" },
        { id: "a2", who: "Hussain Alsayyad", what: "set the notice period to 30 days", when: "2026-08-20" },
        { id: "a3", who: "Hussain Alsayyad", what: "confirmed the term", when: "2026-08-20" },
        { id: "a4", who: "Signal", what: "generated ARMS — Lumofy Scope delivery", when: "2026-08-20" },
        { id: "a5", who: "Mariam Nasser", what: "marked 3 of 20 custom content items delivered", when: "2026-08-29" },
      ],
    },
    {
      id: "t-go1-renewal",
      key: "ARMS-3",
      name: "Go1 library renewal",
      state: "proposed",
      start: "2026-09-01",
      end: "2027-09-01",
      noticeDays: null,
      value: 9800,
      confirmedBy: null,
      confirmedAt: null,
      supersedes: "t-go1",
      obligations: [],
      project: null,
      deals: [
        { id: "d-go1r", name: "Awqaf Real Estate – Go1 library renewal", amount: 9800, closedOn: "2026-08-27", hubspotUrl: "#", role: "signed" },
      ],
      illustrative: true,
      activity: [
        { id: "b1", who: "Signal", what: "proposed this term from Awqaf Real Estate – Go1 library renewal", when: "2026-08-27" },
      ],
    },
    {
      id: "t-go1",
      key: "ARMS-2",
      name: "Go1 library",
      state: "ended",
      start: "2025-09-01",
      end: "2026-09-01",
      noticeDays: 30,
      value: 9800,
      confirmedBy: "Hussain Alsayyad",
      confirmedAt: "2025-09-04",
      supersedes: "t-pilot",
      obligations: [],
      project: { id: "p-go1", name: "ARMS — Go1 library rollout", milestonesTotal: 5, milestonesPresent: 5 },
      deals: [
        { id: "d-go1", name: "Awqaf Real Estate – Go1 library", amount: 9800, closedOn: "2025-08-27", hubspotUrl: "#", role: "signed" },
      ],
      illustrative: true,
      activity: [
        { id: "c1", who: "Hussain Alsayyad", what: "confirmed the term", when: "2025-09-04" },
        { id: "c2", who: "Signal", what: "closed the term at expiry", when: "2026-09-01" },
      ],
    },
    {
      id: "t-pilot",
      key: "ARMS-1",
      name: "Perform pilot",
      state: "ended",
      start: "2025-02-01",
      end: "2026-02-01",
      noticeDays: null,
      value: 4200,
      confirmedBy: "Hussain Alsayyad",
      confirmedAt: "2025-02-06",
      supersedes: null,
      obligations: [],
      project: null,
      deals: [
        { id: "d-pilot", name: "Awqaf Real Estate – Perform pilot", amount: 4200, closedOn: "2025-01-28", hubspotUrl: "#", role: "signed" },
      ],
      illustrative: true,
      activity: [
        { id: "d1", who: "Hussain Alsayyad", what: "confirmed the term", when: "2025-02-06" },
        { id: "d2", who: "Signal", what: "closed the term at expiry", when: "2026-02-01" },
      ],
    },
  ],
};

/* -------------------------------------------------------------- derived */

export const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

export const money = (n: number | null) =>
  n == null ? "—" : `$${n.toLocaleString("en-US")}`;

export const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null;

export const longDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null;

/** Written-notice deadline. Only expressible because the Term is Signal's. */
export function noticeDeadline(t: Term): string | null {
  if (!t.end || t.noticeDays == null) return null;
  const d = new Date(t.end);
  d.setUTCDate(d.getUTCDate() - t.noticeDays);
  return d.toISOString().slice(0, 10);
}

export const isLive = (t: Term, now = NOW) =>
  t.state !== "ended" && (!t.end || t.end > now) && (!t.start || t.start <= now);

/** ARR is a property of the live terms — never a sum of ticked checkboxes. */
export function currentArr(r: Relationship, now = NOW) {
  const live = r.terms.filter((t) => isLive(t, now));
  return {
    total: live.reduce((s, t) => s + t.value, 0),
    /** Decision 4: unconfirmed terms COUNT, and say so wherever the number goes. */
    unconfirmed: live.filter((t) => t.state === "proposed").reduce((s, t) => s + t.value, 0),
    liveCount: live.length,
  };
}

export const obligationProgress = (t: Term) => {
  const q = t.obligations.filter((o) => o.quantity != null);
  const contracted = q.reduce((s, o) => s + (o.quantity ?? 0), 0);
  const done = q.reduce((s, o) => s + o.done, 0);
  return { contracted, done, count: t.obligations.length };
};

export const termById = (id: string) => ARMS.terms.find((t) => t.id === id) ?? null;
