/* =========================================================================
   Prototype data — the deal card redesign.

   The ARMS deal, transcribed from the live card so the prototype argues
   against the real thing rather than a flattering invention. Two further
   deals exist only to show the collapsed row and the tracked/untracked
   states; their figures are illustrative.
   ========================================================================= */

/** Fixed "today" so the prototype's relative dates never drift under review. */
export const NOW = "2026-09-01";

export type Origin = "hubspot" | "csm";

/** A value plus where it came from — the override marker lives on the datum,
 *  not on the rendering, so the card can count overrides without inspecting
 *  its own JSX. */
export interface Fact<T> {
  value: T | null;
  origin: Origin;
}

export const hs = <T,>(value: T | null): Fact<T> => ({ value, origin: "hubspot" });
export const csm = <T,>(value: T | null): Fact<T> => ({ value, origin: "csm" });

/** Required = the account is incomplete without it. Optional = nice to have.
 *  Mirrors the red/yellow split lib/profile-completeness.ts already computes. */
export type Need = "required" | "optional" | "n/a";

export interface Milestone {
  key: string;
  label: string;
  date: string | null;
  /** Which half of the engagement this belongs to. */
  phase: "signed" | "delivery";
  need: Need;
}

/** A date range rendered as a span, not as two unrelated point-in-time cells. */
export interface Window {
  key: string;
  label: string;
  start: string | null;
  end: string | null;
  need: Need;
}

export interface Deal {
  id: string;
  name: string;
  pipeline: string;
  acquisitionChannel: Fact<string>;
  accountExecutive: Fact<string>;
  tracked: boolean;
  category: "sales" | "renewal" | "expansion";

  amount: Fact<number>;
  licences: Fact<number>;
  complementary: Fact<number>;
  pricePerUser: Fact<number>;
  termYears: Fact<number>;

  modules: Fact<string[]>;
  useCases: Fact<string[]>;
  globalLibrary: Fact<string[]>;
  globalLibraryLicences: Fact<number>;
  aiCourseCredits: Fact<number>;

  supportLevel: Fact<string>;
  implementationLevel: Fact<string>;

  /** Days of written notice required before expiry. CSM-entered — it lives in
   *  the contract, never in HubSpot, and today has nowhere to go. Null means
   *  "nobody has recorded it", which is itself worth detecting. */
  noticeDays: number | null;

  milestones: Milestone[];
  windows: Window[];

  brief: string | null;
  hubspotUrl: string | null;
}

export const ARMS: Deal = {
  id: "d-arms",
  name: "Awqaf Real Estate–Lumofy Scope",
  pipeline: "Direct Sales",
  acquisitionChannel: hs("Direct Sales"),
  accountExecutive: hs("Hussain Alsayyad"),
  tracked: true,
  category: "sales",

  amount: hs(24480),
  licences: csm(100),
  complementary: csm(0),
  pricePerUser: csm(245),
  termYears: csm(1),

  modules: csm(["Develop", "Perform", "Engage"]),
  useCases: hs<string[]>(null),
  globalLibrary: csm(["Go1"]),
  globalLibraryLicences: csm(100),
  aiCourseCredits: hs<number>(null),

  supportLevel: csm("Level 2"),
  implementationLevel: csm("Guided"),
  // RFP010-2026: "ARMS must give written notice at least 30 days before expiry
  // — silence is expiry." Nothing in Signal can express that today.
  noticeDays: 30,

  milestones: [
    { key: "contract_start", label: "Contract start", date: "2026-08-16", phase: "signed", need: "required" },
    { key: "closed_won", label: "Closed won", date: "2026-08-18", phase: "signed", need: "required" },
    { key: "invoice_sent", label: "Invoice sent", date: null, phase: "delivery", need: "required" },
    { key: "kickoff", label: "Kick-off", date: "2026-08-31", phase: "delivery", need: "required" },
    { key: "launch", label: "Launch", date: "2026-09-21", phase: "delivery", need: "required" },
  ],

  windows: [
    { key: "platform", label: "Platform access", start: null, end: null, need: "required" },
    // Required BECAUSE this deal carries a Go1 library. On a deal without one
    // this drops to "n/a" — the same conditional the live card already applies.
    { key: "library", label: "Go1 library", start: null, end: null, need: "required" },
  ],

  brief:
    "ARMS (Awqaf Real Estate Management Services) is a wholly owned subsidiary of Awqaf Investment Company, the investment arm of the General Authority for Awqaf — a Saudi government authority. Treat this as a government-linked account: procurement discipline, publicity, data protection and evidence all follow from that one fact.\n\n" +
    "Founded June 2022, 11 branches across the Kingdom, roughly 100 staff — about 40 in head office and the rest distributed. They manage 16,000+ properties against that headcount, which is the business problem in one number.\n\n" +
    "The business model is the constraint: endowment rules mean ARMS cannot sell property. Returns come from leasing only, and the assets sit under a board of trustees. They cannot trade their way out of a problem, so operating efficiency is the only lever they have — which makes workforce capability a board-level topic here rather than an HR one.\n\n" +
    "Live on Yardi since May 2024 (140+ processes automated, ~90% of business requirements covered). Contract RFP010-2026, signed 16 August 2026, one Gregorian year, Arabic governing, Saudi law and courts. Renewal is by mutual agreement and ARMS must give written notice at least 30 days before expiry — silence is expiry.\n\n" +
    "Two things decide this account: whether delivery lands, and whether the 20 contracted custom content items get built. Annex 2 is a contractual 12-month activation cadence with delay penalties behind it — the Beyon pattern with the dial turned up.",

  hubspotUrl: "#",
};

/* Two more, so the collapsed row can be judged as a list rather than as a
   single card. Figures illustrative. */

export const SECOND: Deal = {
  ...ARMS,
  id: "d-arms-lib",
  name: "Awqaf Real Estate – Go1 library renewal",
  category: "renewal",
  amount: hs(9800),
  licences: hs(100),
  complementary: hs(0),
  pricePerUser: hs(98),
  termYears: hs(1),
  modules: hs([]),
  globalLibrary: hs(["Go1"]),
  globalLibraryLicences: hs(100),
  supportLevel: hs("Level 2"),
  implementationLevel: hs("Guided"),
  noticeDays: 30,
  milestones: [
    { key: "contract_start", label: "Contract start", date: "2025-09-01", phase: "signed", need: "required" },
    { key: "closed_won", label: "Closed won", date: "2025-08-27", phase: "signed", need: "required" },
    { key: "invoice_sent", label: "Invoice sent", date: "2025-09-03", phase: "delivery", need: "required" },
    { key: "kickoff", label: "Kick-off", date: "2025-09-08", phase: "delivery", need: "required" },
    { key: "launch", label: "Launch", date: "2025-09-15", phase: "delivery", need: "required" },
  ],
  windows: [
    { key: "platform", label: "Platform access", start: "2025-09-01", end: "2026-09-01", need: "required" },
    { key: "library", label: "Go1 library", start: "2025-09-01", end: "2026-09-01", need: "required" },
  ],
  brief: null,
};

export const THIRD: Deal = {
  ...SECOND,
  id: "d-arms-pilot",
  name: "Awqaf Real Estate – Perform pilot",
  category: "sales",
  tracked: false,
  amount: hs(4200),
  licences: hs(20),
  pricePerUser: hs(210),
  termYears: hs(1),
  modules: hs(["Perform"]),
  noticeDays: null,
  globalLibrary: hs([]),
  globalLibraryLicences: hs<number>(null),
  milestones: [
    { key: "contract_start", label: "Contract start", date: "2025-02-01", phase: "signed", need: "required" },
    { key: "closed_won", label: "Closed won", date: "2025-01-28", phase: "signed", need: "required" },
    { key: "invoice_sent", label: "Invoice sent", date: "2025-02-04", phase: "delivery", need: "required" },
    { key: "kickoff", label: "Kick-off", date: "2025-02-10", phase: "delivery", need: "required" },
    { key: "launch", label: "Launch", date: null, phase: "delivery", need: "required" },
  ],
  windows: [
    { key: "platform", label: "Platform access", start: "2025-02-01", end: "2026-02-01", need: "required" },
    // No library on this deal, so its dates are genuinely not applicable —
    // never an alert, never a gap in the timeline.
    { key: "library", label: "Go1 library", start: null, end: null, need: "n/a" },
  ],
  brief: null,
};

export const DEALS: Deal[] = [ARMS, SECOND, THIRD];

/* ----------------------------------------------------------------- derive */

export const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/** Renewal = contract start + the contract's own term. The live card hardcodes
 *  +1 year and ignores the term field sitting beside it; this prototype shows
 *  what reading it looks like. Which rule is correct is a product decision —
 *  see the handoff note. */
export function renewalOf(d: Deal): string | null {
  const start = d.milestones.find((m) => m.key === "contract_start")?.date;
  if (!start) return null;
  const years = d.termYears.value ?? 1;
  const dt = new Date(start);
  dt.setUTCFullYear(dt.getUTCFullYear() + years);
  return dt.toISOString().slice(0, 10);
}

export type DeliveryState =
  | { kind: "none" }
  | { kind: "planned"; days: number; launch: string }
  | { kind: "done"; days: number; launch: string }
  | { kind: "running"; days: number };

/** Kick-off → launch. Deliberately distinguishes a launch that has HAPPENED
 *  from one merely scheduled — the live card's "21d" says the same thing for
 *  both, which is the kind of quiet overstatement this redesign is trying to
 *  remove. */
export function deliveryOf(d: Deal, now = NOW): DeliveryState {
  const kickoff = d.milestones.find((m) => m.key === "kickoff")?.date ?? null;
  const launch = d.milestones.find((m) => m.key === "launch")?.date ?? null;
  if (!kickoff) return { kind: "none" };
  if (!launch) return { kind: "running", days: daysBetween(kickoff, now) };
  const days = daysBetween(kickoff, launch);
  return launch <= now ? { kind: "done", days, launch } : { kind: "planned", days, launch };
}

export interface Gaps { required: string[]; optional: string[] }

/** One graded count for the whole card, replacing the scattered triangles. */
export function gapsOf(d: Deal): Gaps {
  const required: string[] = [];
  const optional: string[] = [];
  const add = (need: Need, label: string) => {
    if (need === "required") required.push(label);
    else if (need === "optional") optional.push(label);
  };
  for (const m of d.milestones) if (!m.date) add(m.need, m.label);
  for (const w of d.windows) if (!w.start || !w.end) add(w.need, w.label);
  if (!d.useCases.value?.length) optional.push("Use case");
  if (d.aiCourseCredits.value == null) optional.push("AI course credits");
  return { required, optional };
}

/** How many fields a CSM has overridden — counted once, shown once. */
export function overrideCountOf(d: Deal): number {
  const facts: Fact<unknown>[] = [
    d.acquisitionChannel, d.accountExecutive, d.amount, d.licences, d.complementary,
    d.pricePerUser, d.termYears, d.modules, d.useCases, d.globalLibrary,
    d.globalLibraryLicences, d.aiCourseCredits, d.supportLevel, d.implementationLevel,
  ];
  return facts.filter((f) => f.origin === "csm").length;
}

export const money = (n: number | null) =>
  n == null ? "—" : `$${n.toLocaleString("en-US")}`;

export const shortDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : null;

/* ================================================================ detection

   The card stops being a form here. Rather than rendering every field and
   marking the empty ones, the system reads the deal and says what it found.

   Rules only ever use what is already on the record — no inference, no
   scoring. Each one names a condition a CSM can actually act on, and every
   one of them can be dismissed, because a rule that cannot be wrong becomes
   noise the first time it is.
   ======================================================================== */

export type Level = "act" | "soon" | "note";

export interface Finding {
  id: string;
  level: Level;
  /** The sentence a CSM reads. Written as a statement of fact, not an alert. */
  title: string;
  /** Why it matters — omitted when the title is self-evident. */
  detail?: string;
  /** What the card offers to do about it. */
  action?:
    | { kind: "date"; milestoneKey: string }
    | { kind: "window"; windowKey: string }
    | { kind: "notice" };
  /** Offer "not needed on this deal" — only where absence is a legitimate state. */
  dismissable?: boolean;
  /** Several instances of ONE condition, collapsed into a single row. Three
   *  separate "X has no date" findings read as a checklist and push the
   *  findings worth reading below the fold. */
  group?: { id: string; label: string; action: Finding["action"] }[];
}

const LEVEL_RANK: Record<Level, number> = { act: 0, soon: 1, note: 2 };

export function findingsOf(deal: Deal, now = NOW): Finding[] {
  const out: Finding[] = [];
  const renewal = renewalOf(deal);
  const date = (k: string) => deal.milestones.find((m) => m.key === k)?.date ?? null;

  /* --- the renewal itself ------------------------------------------------ */
  if (renewal) {
    const d = daysBetween(now, renewal);
    if (d < 0) {
      out.push({
        id: "renewal_overdue",
        level: "act",
        title: `Renewal date passed ${Math.abs(d)} days ago`,
        detail: "Either the contract renewed and the dates need updating, or it lapsed.",
      });
    } else if (d <= 120) {
      out.push({
        id: "renewal_near",
        level: "soon",
        title: `Renews in ${d} days`,
        detail: "Inside the 120-day window, so this account now counts as renewing.",
      });
    }
  }

  /* --- notice period: the highest-stakes date on a contract, and the one
         Signal currently has nowhere to record -------------------------- */
  if (renewal && deal.noticeDays != null) {
    const deadline = new Date(renewal);
    deadline.setUTCDate(deadline.getUTCDate() - deal.noticeDays);
    const iso = deadline.toISOString().slice(0, 10);
    const d = daysBetween(now, iso);
    out.push({
      id: "notice",
      level: d < 0 ? "act" : d <= 60 ? "act" : "note",
      title:
        d < 0
          ? `Notice deadline passed ${Math.abs(d)} days ago — ${shortDate(iso)}`
          : `Written notice due by ${shortDate(iso)}`,
      detail: `${deal.noticeDays} days before expiry. Silence past this date renews or ends the contract without a conversation.`,
      action: { kind: "notice" },
    });
  } else if (renewal) {
    out.push({
      id: "notice_unknown",
      level: "soon",
      title: "Notice period isn't recorded",
      detail: "Most contracts require written notice before expiry. Without it there's no deadline to work back from.",
      action: { kind: "notice" },
      dismissable: true,
    });
  }

  /* --- delivery ---------------------------------------------------------- */
  const kickoff = date("kickoff");
  const launch = date("launch");
  /** True once the missing launch date has been reported as a stalled
   *  onboarding. The blank field and the stall are the same fact — saying
   *  both is how a findings list turns back into a checklist. */
  let launchClaimed = false;
  if (kickoff && !launch) {
    const running = daysBetween(kickoff, now);
    if (running > 30) {
      launchClaimed = true;
      out.push({
        id: "onboarding_long",
        level: "act",
        title: `Onboarding has run ${running} days with no launch date`,
        detail: "Kick-off happened; launch was never recorded.",
        action: { kind: "date", milestoneKey: "launch" },
      });
    }
  } else if (launch && launch > now) {
    const d = daysBetween(now, launch);
    if (d <= 30)
      out.push({ id: "launch_soon", level: "note", title: `Launch is ${d} days away — ${shortDate(launch)}` });
  }

  /* --- gaps that are genuinely missing, not merely empty -----------------
         Collapsed into ONE finding: the condition is the same, only the
         field differs, and three identical rows crowd out everything else. */
  const missing: NonNullable<Finding["group"]> = [];
  for (const m of deal.milestones) {
    if (m.date || m.need !== "required") continue;
    if (m.key === "launch" && launchClaimed) continue;
    missing.push({ id: `ms_${m.key}`, label: m.label, action: { kind: "date", milestoneKey: m.key } });
  }
  for (const w of deal.windows) {
    if (w.need === "n/a") continue;
    if (!w.start || !w.end) {
      missing.push({ id: `win_${w.key}`, label: w.label, action: { kind: "window", windowKey: w.key } });
    } else if (renewal && w.end < renewal) {
      // A window that ENDS early is a service gap, not a blank — its own finding.
      out.push({
        id: `gap_${w.key}`,
        level: "act",
        title: `${w.label} ends ${daysBetween(w.end, renewal)} days before the contract does`,
        detail: `Access stops ${shortDate(w.end)}; the term runs to ${shortDate(renewal)}.`,
        action: { kind: "window", windowKey: w.key },
      });
    }
  }
  if (missing.length) {
    out.push({
      id: "missing_dates",
      level: "soon",
      title:
        missing.length === 1
          ? `${missing[0].label} has no date`
          : `${missing.length} dates aren't recorded`,
      detail: renewal ? `The contract runs to ${shortDate(renewal)}.` : undefined,
      group: missing,
    });
  }

  return out.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level]);
}

/** The deal in a sentence — what the grid of twelve cells was for. */
export function summarise(deal: Deal): string {
  const bits: string[] = [];
  const licences = deal.licences.value;
  const mods = deal.modules.value ?? [];
  if (licences && mods.length) {
    const list = mods.length > 1 ? `${mods.slice(0, -1).join(", ")} and ${mods.at(-1)}` : mods[0];
    bits.push(`${licences} licences of ${list}${deal.pricePerUser.value ? ` at ${money(deal.pricePerUser.value)} each` : ""}`);
  } else if (licences) {
    bits.push(`${licences} licences`);
  }
  if (deal.complementary.value) bits.push(`${deal.complementary.value} complimentary`);
  const lib = deal.globalLibrary.value ?? [];
  if (lib.length) bits.push(`the ${lib.join(" and ")} library${deal.globalLibraryLicences.value ? ` (${deal.globalLibraryLicences.value} seats)` : ""}`);

  const start = deal.milestones.find((m) => m.key === "contract_start")?.date;
  const term = `${deal.termYears.value ?? 1}-year term${start ? ` from ${shortDate(start)}` : ""}`;
  const service = [deal.supportLevel.value, deal.implementationLevel.value ? `${deal.implementationLevel.value.toLowerCase()} implementation` : null]
    .filter(Boolean).join(", ");

  const first = bits.length ? `${bits.join(", ")}.` : "";
  return [first, `${term}${service ? `, ${service}` : ""}.`].filter(Boolean).join(" ");
}
