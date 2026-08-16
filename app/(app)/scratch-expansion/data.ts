/* Sample data for the Expansion prototype.
   Client names are real Lumofy accounts; EVERY FIGURE IS INVENTED. Nothing here
   reads or writes the database.

   A simple expansion CRM: Account → Opportunity, four stages, three closed
   outcomes. Two independent read-outs drive the card —

     dueState(o)  — the timing of the next step   ("Due tomorrow", "5 days overdue")
     momentum(o)  — whether the deal itself is moving ("Waiting 6 days", "Stalled 22 days")

   They are separate on purpose. A proposal can be waiting on the client for a
   week while the next step is due tomorrow; one number cannot say both. */

export type Stage = "identified" | "qualified" | "proposed" | "closed";
export type Outcome = "won" | "lost" | "dropped";
export type AgreementType = "verbal" | "written";
export type ExpansionType = "module" | "licences" | "geography" | "content" | "services" | "use_case";
/** High / Medium / Low, as the team already tracks it. Deliberately not a percentage. */
export type Confidence = "high" | "medium" | "low";

export const STAGES: { id: Stage; label: string }[] = [
  { id: "identified", label: "Identified" },
  { id: "qualified", label: "Qualified" },
  { id: "proposed", label: "Proposed" },
  { id: "closed", label: "Closed" },
];

export const STAGE_LABEL: Record<Stage, string> = {
  identified: "Identified", qualified: "Qualified", proposed: "Proposed", closed: "Closed",
};

export const OUTCOME_LABEL: Record<Outcome, string> = { won: "Won", lost: "Lost", dropped: "Dropped" };

export const CONFIDENCE_LABEL: Record<Confidence, string> = { high: "High", medium: "Medium", low: "Low" };

export const TYPE_LABEL: Record<ExpansionType, string> = {
  module: "Module",
  licences: "Licences",
  geography: "Geography",
  content: "Content",
  services: "Services",
  use_case: "Use case",
};

export const LOSS_REASONS = ["No budget", "Chose another vendor", "No longer a priority", "Sponsor left", "Price", "Other"];
export const DROP_REASONS = ["Not a genuine need", "Account at risk — wrong time", "Superseded", "No capacity to deliver", "Other"];

export interface NextStep {
  id: string;
  text: string;
  dueDate: string;
}

export interface Note {
  body: string;
  at: string;
  author: string;
}

export interface HistoryEntry {
  at: string;
  actor: string;
  what: string;
}

export interface Opportunity {
  id: string;
  account: string;
  name: string;
  description: string;
  stage: Stage;
  outcome: Outcome | null;

  expectedArr: number | null;
  currency: "USD" | "SAR" | "BHD";
  expansionType: ExpansionType;
  /** The thing being sold — "Perform", "Comply". Null when it is not a named product. */
  product: string | null;

  ownerEmail: string | null;
  /** Null when nobody has committed to a date. Shown as “No close date”. */
  expectedCloseDate: string | null;
  confidence: Confidence | null;

  /** A queue, not a checklist. The soonest-due one drives the card and attention. */
  nextSteps: NextStep[];
  /** Anything at all happening — a note, a stage move, an edit. Drives waiting and stalled. */
  lastActivityAt: string;
  /** When it entered its current stage. Stored, not parsed out of the history log. */
  stageChangedAt: string;
  latestNote: Note | null;
  /** One line of Signal context. Evidence, never a score. */
  trigger: string | null;

  createdAt: string;
  proposalDate: string | null;

  outcomeDate: string | null;
  finalArr: number | null;
  agreementType: AgreementType | null;
  confirmedBy: string | null;
  arrRecorded: boolean;
  closeReason: string | null;

  history: HistoryEntry[];
}

const H = (at: string, actor: string, what: string): HistoryEntry => ({ at, actor, what });

/* The real expansion pipeline as supplied, 13 Aug 2026.
   Estimated ARR, opportunity text and confidence are exactly as given.
   Owner, next step and expected close are ABSENT FROM THE SOURCE and are left
   empty rather than invented — which is itself the finding. */

export const OPPORTUNITIES: Opportunity[] = [
  {
    id: "p1", account: "MEWA", name: "Expand to 3,000 users across the Ministry",
    description: "Proposal sent; cybersecurity requirements under discussion.",
    stage: "proposed", outcome: null,
    expectedArr: 116550, currency: "USD", expansionType: "licences", product: "Develop",
    ownerEmail: null, expectedCloseDate: null, confidence: "high",
    nextSteps: [],
    lastActivityAt: "2026-08-13", stageChangedAt: "2026-08-13",
    latestNote: null, trigger: null,
    createdAt: "2026-08-13", proposalDate: "2026-08-13",
    outcomeDate: null, finalArr: null, agreementType: null, confirmedBy: null, arrRecorded: false, closeReason: null,
    history: [H("2026-08-13", "Imported", "Imported from the expansion pipeline")],
  },
  {
    id: "p2", account: "Neo Space", name: "Add ~500 Geo Spatial users",
    description: "Delayed with Procurement; timing remains uncertain.",
    stage: "proposed", outcome: null,
    expectedArr: 51976, currency: "USD", expansionType: "licences", product: "Develop + Perform",
    ownerEmail: null, expectedCloseDate: null, confidence: "medium",
    nextSteps: [],
    lastActivityAt: "2026-08-13", stageChangedAt: "2026-08-13",
    latestNote: null, trigger: null,
    createdAt: "2026-08-13", proposalDate: "2026-08-13",
    outcomeDate: null, finalArr: null, agreementType: null, confirmedBy: null, arrRecorded: false, closeReason: null,
    history: [H("2026-08-13", "Imported", "Imported from the expansion pipeline")],
  },
  {
    id: "p3", account: "Sawaeed", name: "Expand from 500 to 550–700 users",
    description: "Part of the upcoming renewal. Final user count pending confirmation. ARR is based on the maximum potential expansion — 200 users at the previous deal price.",
    stage: "qualified", outcome: null,
    expectedArr: 26500, currency: "USD", expansionType: "licences", product: "Develop",
    ownerEmail: null, expectedCloseDate: null, confidence: "high",
    nextSteps: [],
    lastActivityAt: "2026-08-13", stageChangedAt: "2026-08-13",
    latestNote: null, trigger: null,
    createdAt: "2026-08-13", proposalDate: null,
    outcomeDate: null, finalArr: null, agreementType: null, confirmedBy: null, arrRecorded: false, closeReason: null,
    history: [H("2026-08-13", "Imported", "Imported from the expansion pipeline")],
  },
  {
    id: "p4", account: "GCCIA", name: "Expand Perform to the existing 130 users",
    description: "Two PM Cycle simulations completed; requirements are with Product for review.",
    stage: "qualified", outcome: null,
    expectedArr: 5460, currency: "USD", expansionType: "module", product: "Perform",
    ownerEmail: null, expectedCloseDate: null, confidence: "medium",
    nextSteps: [],
    lastActivityAt: "2026-08-13", stageChangedAt: "2026-08-13",
    latestNote: null, trigger: null,
    createdAt: "2026-08-13", proposalDate: null,
    outcomeDate: null, finalArr: null, agreementType: null, confirmedBy: null, arrRecorded: false, closeReason: null,
    history: [H("2026-08-13", "Imported", "Imported from the expansion pipeline")],
  },
  {
    id: "p5", account: "Arla Foods", name: "Expansion to KSA users",
    description: "650 users estimated in total. Direction expected to become clearer during September renewal discussions.",
    stage: "identified", outcome: null,
    expectedArr: 24668, currency: "USD", expansionType: "geography", product: "Develop",
    ownerEmail: null, expectedCloseDate: null, confidence: "low",
    nextSteps: [],
    lastActivityAt: "2026-08-13", stageChangedAt: "2026-08-13",
    latestNote: null, trigger: null,
    createdAt: "2026-08-13", proposalDate: null,
    outcomeDate: null, finalArr: null, agreementType: null, confirmedBy: null, arrRecorded: false, closeReason: null,
    history: [H("2026-08-13", "Imported", "Imported from the expansion pipeline")],
  },
  {
    id: "p6", account: "Arla Foods", name: "POKA integration",
    description: "Initial discussion held with Arla and POKA in May. Paused while the key stakeholder was on leave; recently resumed.",
    stage: "identified", outcome: null,
    expectedArr: null, currency: "USD", expansionType: "use_case", product: null,
    ownerEmail: null, expectedCloseDate: null, confidence: "low",
    nextSteps: [],
    lastActivityAt: "2026-08-13", stageChangedAt: "2026-08-13",
    latestNote: null, trigger: null,
    createdAt: "2026-08-13", proposalDate: null,
    outcomeDate: null, finalArr: null, agreementType: null, confirmedBy: null, arrRecorded: false, closeReason: null,
    history: [H("2026-08-13", "Imported", "Imported from the expansion pipeline")],
  },
  {
    id: "p7", account: "Saudi Radwa", name: "Content development — video animation",
    description: "",
    stage: "identified", outcome: null,
    expectedArr: 4000, currency: "USD", expansionType: "content", product: null,
    ownerEmail: null, expectedCloseDate: null, confidence: "low",
    nextSteps: [],
    lastActivityAt: "2026-08-13", stageChangedAt: "2026-08-13",
    latestNote: null, trigger: null,
    createdAt: "2026-08-13", proposalDate: null,
    outcomeDate: null, finalArr: null, agreementType: null, confirmedBy: null, arrRecorded: false, closeReason: null,
    history: [H("2026-08-13", "Imported", "Imported from the expansion pipeline")],
  },
];

/* ── Account context ──────────────────────────────────────────────────────── */

export interface AccountContext {
  /** Everything here is optional — the source pipeline carries none of it. */
  arr?: number;
  currency?: Opportunity["currency"];
  plan?: string;
  health?: "healthy" | "watch" | "at_risk";
  healthScore?: number;
  since?: string;
}

export const ACCOUNTS: Record<string, AccountContext> = {
  // Plans are the products named in the pipeline. ARR, health and start dates are
  // NOT in the source, so they are absent rather than invented.
  "GCCIA": { plan: "Perform" },
  "MEWA": { plan: "Develop" },
  "Sawaeed": { plan: "Develop" },
  "Neo Space": { plan: "Develop + Perform" },
  "Arla Foods": { plan: "Develop" },
  "Saudi Radwa": {},
};

export const HEALTH_LABEL: Record<NonNullable<AccountContext["health"]>, string> = {
  healthy: "Healthy", watch: "Watch", at_risk: "At risk",
};

/* ── Config and helpers ───────────────────────────────────────────────────── */

export const TODAY = "2026-08-13";
export const STALE_DAYS = 14;
export const WAITING_DAYS = 3;
export const PROGRESSED_DAYS = 5;

/* Assignable people. In production this list is Signal's app_users, filtered by
   permission tier — `guest` is the read-only tier and `denyClientWrite` blocks
   it, so a guest can never be an owner. Names below are placeholders. */

export type Role = "super_admin" | "admin" | "operator";

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  operator: "CSM",
};

export interface Person { email: string; name: string; role: Role }

export const PEOPLE_LIST: Person[] = [
  { email: "sara@lumofy.com", name: "Sara Nasser", role: "operator" },
  { email: "ali@lumofy.com", name: "Ali Abbas", role: "operator" },
  { email: "qasim@lumofy.com", name: "Qasim Alshakhoori", role: "operator" },
  { email: "nadia@lumofy.com", name: "Nadia Rahman", role: "admin" },
  { email: "omar@lumofy.com", name: "Omar Siddiqui", role: "super_admin" },
];

export const PEOPLE: Record<string, string> =
  Object.fromEntries(PEOPLE_LIST.map((p) => [p.email, p.name]));

export const roleOf = (email: string | null) =>
  PEOPLE_LIST.find((p) => p.email === email)?.role ?? null;

export const ME = "sara@lumofy.com";

export const name = (e: string | null) => (e ? PEOPLE[e] ?? e : "Unassigned");
export const firstName = (e: string | null) => (e ? name(e).split(" ")[0] : "Unassigned");
export const initials = (e: string | null) =>
  name(e).split(/\s+/).slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase();

const SYM: Record<Opportunity["currency"], string> = { USD: "$", SAR: "SAR ", BHD: "BHD " };
export const money = (n: number | null, c: Opportunity["currency"] = "USD") =>
  n == null ? "—" : `${SYM[c]}${n >= 1000 ? `${Math.round(n / 1000)}K` : n}`;
export const moneyFull = (n: number | null, c: Opportunity["currency"] = "USD") =>
  n == null ? "—" : `${SYM[c]}${n.toLocaleString("en-US")}`;

export const fmt = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
export const fmtShort = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};

/** Days elapsed from `iso` to `from`. Positive means in the past. */
export const daysSince = (iso: string, from = TODAY) =>
  Math.round((Date.parse(`${from}T00:00:00Z`) - Date.parse(`${iso}T00:00:00Z`)) / 86_400_000);

export const isClosed = (o: Opportunity) => o.outcome !== null;

/** The step the card shows and attention reads: the soonest due. */
export const primaryStep = (o: Opportunity): NextStep | null =>
  o.nextSteps.length
    ? [...o.nextSteps].sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))[0]
    : null;

/* ── Read-out 1: the timing of the next step ──────────────────────────────── */

export type DueState = "none" | "overdue" | "today" | "tomorrow" | "soon" | "later";

export function dueState(o: Opportunity, today = TODAY): { state: DueState; label: string; days: number } {
  const step = primaryStep(o);
  if (!step) return { state: "none", label: "No next step", days: 0 };
  const d = daysSince(step.dueDate, today);
  if (d > 0) return { state: "overdue", label: `${d} ${d === 1 ? "day" : "days"} overdue`, days: d };
  if (d === 0) return { state: "today", label: "Due today", days: 0 };
  if (d === -1) return { state: "tomorrow", label: "Due tomorrow", days: 1 };
  if (d >= -3) return { state: "soon", label: `Due in ${-d} days`, days: -d };
  return { state: "later", label: `Due ${fmtShort(step.dueDate)}`, days: -d };
}

/* ── Read-out 2: whether the deal itself is moving ────────────────────────── */

export type MomentumState = "progressed" | "stalled" | "waiting" | "moving";

export function momentum(o: Opportunity, today = TODAY): { state: MomentumState; label: string; days: number } {
  const quiet = daysSince(o.lastActivityAt, today);
  const sinceStage = daysSince(o.stageChangedAt, today);

  if (quiet >= STALE_DAYS) return { state: "stalled", label: `Stalled ${quiet}d`, days: quiet };
  if (o.stage === "proposed" && quiet >= WAITING_DAYS) return { state: "waiting", label: `Waiting on client ${quiet}d`, days: quiet };
  if (sinceStage <= PROGRESSED_DAYS) {
    return { state: "progressed", label: sinceStage === 0 ? "Moved today" : `Moved ${sinceStage}d ago`, days: sinceStage };
  }
  return { state: "moving", label: "", days: sinceStage };
}

/* ── The single attention read-out the card footer uses ────────────────────
   Every active opportunity has exactly ONE primary state, chosen by this
   precedence. Anything else that is true becomes quieter secondary context —
   "5 days overdue · waiting on client 8d" reads as one fact with an
   explanation, not as two competing warnings. */

export type AttentionState =
  | "no_next_step" | "overdue" | "stalled" | "waiting" | "due_soon" | "progressed" | "normal";

export type Tone = "danger" | "warning" | "info" | "muted" | "subtle";

export interface Attention {
  state: AttentionState;
  label: string;
  /** Quieter supporting explanation. Never a second warning. */
  secondary: string | null;
  tone: Tone;
  /** Whether this belongs in the Needs attention count. */
  needs: boolean;
}

export const ATTENTION_ORDER: AttentionState[] =
  ["no_next_step", "overdue", "stalled", "waiting", "due_soon", "progressed", "normal"];

export function attention(o: Opportunity, today = TODAY): Attention {
  const d = dueState(o, today);
  const m = momentum(o, today);

  // Momentum, phrased for use as supporting context.
  const momentumAside =
    m.state === "stalled" ? `stalled ${m.days}d`
      : m.state === "waiting" ? `waiting ${m.days}d`
        : null;

  if (d.state === "none") {
    return { state: "no_next_step", label: "No next step", secondary: momentumAside, tone: "warning", needs: true };
  }
  if (d.state === "overdue") {
    return { state: "overdue", label: d.label, secondary: momentumAside, tone: "danger", needs: true };
  }
  if (m.state === "stalled") {
    return { state: "stalled", label: m.label, secondary: d.label.toLowerCase(), tone: "warning", needs: true };
  }
  if (m.state === "waiting") {
    return { state: "waiting", label: m.label, secondary: d.label.toLowerCase(), tone: "info", needs: false };
  }
  if (d.state === "today" || d.state === "tomorrow" || d.state === "soon") {
    return { state: "due_soon", label: d.label, secondary: null, tone: "warning", needs: false };
  }
  if (m.state === "progressed") {
    return { state: "progressed", label: d.label, secondary: m.label.toLowerCase(), tone: "muted", needs: false };
  }
  return { state: "normal", label: d.label, secondary: null, tone: "muted", needs: false };
}

/** Drives the header count and the Needs attention filter. One definition. */
export const needsAttention = (o: Opportunity, today = TODAY) =>
  !isClosed(o) && attention(o, today).needs;

export const TYPES: ExpansionType[] = ["module", "licences", "geography", "content", "services", "use_case"];
