/* =========================================================================
   The systems an account already runs — the tools Lumofy has to sit next to,
   pull people and skills data from, or replace.

   CSM-entered only: nothing here comes from HubSpot, so the keys are plain
   client.properties entries that the sync's jsonb `||` merge preserves (same
   treatment as stakeholder_profiles). Each category is its own top-level key
   holding a string[], so adding a tool is a one-key PATCH and two CSMs
   editing different categories can't clobber each other.

   The suggestion lists below are a typing aid, not a closed vocabulary — the
   input takes any free text, because half of what accounts run is an in-house
   tool nobody outside the company has heard of.

   The categories themselves are workspace-configurable: an admin can rename,
   reorder, add and remove them in Settings, and what is stored under
   workspace_config."tech_stack_categories" wins over the defaults here. A
   category's `key` is generated once and never changes when its label is
   edited — the key IS the clients.properties key holding every account's
   recorded tools, so renaming "BI / analytics" to "Reporting" must not orphan
   the data already filed under it.
   ========================================================================= */

export type TechStackField = {
  /** client.properties key. Stable for the life of the category. */
  key: string;
  label: string;
  /** Shown in the empty input. Derived from the suggestions when configured. */
  placeholder: string;
  /** Offered as you type. Free text is always allowed alongside these. */
  suggestions: string[];
};

/** workspace_config key holding the admin-configured category list. */
export const TECH_STACK_CONFIG_KEY = "tech_stack_categories";

/** Every generated category key carries this prefix, so a tech-stack key can
 *  never collide with a HubSpot-synced or admin-defined client property. */
export const TECH_STACK_KEY_PREFIX = "tech_stack_";

/** Shipped defaults. Used until an admin saves a list of their own, and as the
 *  fallback whenever a stored list is empty or unreadable. */
export const DEFAULT_TECH_STACK_CATEGORIES: TechStackField[] = [
  {
    key: "tech_stack_hris",
    label: "HRIS / HRMS",
    placeholder: "Workday, BambooHR…",
    suggestions: [
      "Workday", "SAP SuccessFactors", "Oracle HCM Cloud", "BambooHR", "Personio", "HiBob",
      "ADP Workforce Now", "UKG Pro", "Ceridian Dayforce", "Namely", "Gusto", "Zoho People",
      "Darwinbox", "Bayzat", "ZenHR", "Sage People", "Cezanne HR", "Odoo HR", "Microsoft Dynamics 365 HR",
    ],
  },
  {
    key: "tech_stack_lms",
    label: "LMS / LXP",
    placeholder: "Cornerstone, Docebo…",
    suggestions: [
      "Cornerstone OnDemand", "Docebo", "360Learning", "TalentLMS", "SAP Litmos", "Absorb LMS",
      "Moodle", "Open edX", "Canvas", "Blackboard", "Degreed", "EdCast", "LinkedIn Learning",
      "Coursera for Business", "Udemy Business", "Skillsoft Percipio", "Go1", "Workday Learning",
      "SAP SuccessFactors Learning", "Totara", "Thinkific",
    ],
  },
  {
    key: "tech_stack_performance",
    label: "Performance management",
    placeholder: "Lattice, Culture Amp…",
    suggestions: [
      "Lattice", "15Five", "Culture Amp", "Leapsome", "Betterworks", "Workday Performance",
      "SAP SuccessFactors Performance", "Reflektive", "Small Improvements", "Peakon", "Officevibe",
      "Engagedly", "Synergita", "Perdoo", "WorkBoard",
    ],
  },
  {
    key: "tech_stack_ats",
    label: "ATS / recruiting",
    placeholder: "Greenhouse, Workable…",
    suggestions: [
      "Greenhouse", "Lever", "Workable", "SmartRecruiters", "Oracle Taleo", "iCIMS", "Ashby",
      "Recruitee", "Teamtailor", "Workday Recruiting", "SAP SuccessFactors Recruiting",
      "BambooHR Hiring", "JazzHR", "Breezy HR", "Manatal",
    ],
  },
  {
    key: "tech_stack_sso",
    label: "SSO / identity",
    placeholder: "Okta, Entra ID…",
    suggestions: [
      "Okta", "Microsoft Entra ID", "Azure AD", "Google Workspace", "OneLogin", "Ping Identity",
      "JumpCloud", "Auth0", "Active Directory (on-prem)", "Keycloak", "Duo", "SAML (custom IdP)",
    ],
  },
  {
    key: "tech_stack_collaboration",
    label: "Collaboration",
    placeholder: "Slack, Microsoft Teams…",
    suggestions: [
      "Slack", "Microsoft Teams", "Google Chat", "Zoom", "Cisco Webex", "Confluence", "Notion",
      "SharePoint", "Google Workspace", "Asana", "Jira", "Monday.com", "ClickUp", "Trello", "Miro",
    ],
  },
  {
    key: "tech_stack_bi",
    label: "BI / analytics",
    placeholder: "Power BI, Tableau…",
    suggestions: [
      "Power BI", "Tableau", "Looker", "Looker Studio", "Qlik Sense", "Metabase", "Domo", "Sisense",
      "Amazon QuickSight", "SAP Analytics Cloud", "Oracle Analytics Cloud", "Excel (manual reporting)",
    ],
  },
];

/** Anything the categories above don't have a slot for — payroll, ticketing,
 *  an in-house portal. Suggests every known tool, since it's the catch-all. */
export const TECH_STACK_OTHER = {
  key: "tech_stack_other",
  label: "Other tools",
  placeholder: "Anything else they run…",
} as const;

/** Free-text box kept alongside the chips: who owns a system, how it can be
 *  connected, why a migration is blocked — the things a tool name can't say. */
export const TECH_STACK_NOTES_KEY = "tech_stack_notes";

/** Keys the catch-all and the notes box own. A configured category may never
 *  take one of these, or a rename would start overwriting a different field. */
export const RESERVED_TECH_STACK_KEYS: ReadonlySet<string> = new Set([
  TECH_STACK_OTHER.key,
  "tech_stack_notes",
]);

/** Every suggestion across the active categories, de-duplicated — the option
 *  pool for the catch-all box. */
export function allToolSuggestions(categories: TechStackField[]): string[] {
  return [...new Set(categories.flatMap((f) => f.suggestions))].sort((a, b) => a.localeCompare(b));
}

/** "Workday, BambooHR…" — the first couple of suggestions, so an empty box
 *  shows the shape of an answer rather than an instruction. */
export function placeholderFor(label: string, suggestions: string[]): string {
  const shown = suggestions.slice(0, 2).filter(Boolean);
  return shown.length > 0 ? `${shown.join(", ")}…` : `Which ${label.toLowerCase()} do they use?`;
}

/**
 * Turn a label into a storage key, avoiding every key already in use.
 *
 * Only ever called when an admin ADDS a category — an edited label keeps the
 * key it was created with. A label that slugifies to nothing (or to a taken
 * key) falls back to a numbered suffix rather than failing silently.
 */
export function techStackKeyFor(label: string, taken: Iterable<string>): string {
  const used = new Set([...taken, ...RESERVED_TECH_STACK_KEYS]);
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  const base = `${TECH_STACK_KEY_PREFIX}${slug || "category"}`;
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}_${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

/**
 * Read the admin-configured category list.
 *
 * Everything here is defensive on purpose: workspace_config is schemaless
 * JSONB, so this has to survive a hand-edited row, a half-written value, and a
 * shape from a future version of the settings UI. An entry without a usable
 * key or label is dropped rather than rendered as a nameless box, duplicate
 * keys keep the first entry (two boxes writing one property key would fight),
 * and an empty or unreadable list falls back to the shipped defaults — an
 * admin who clears every category gets the defaults back, not a blank section.
 */
export function normalizeTechStackCategories(value: unknown): TechStackField[] {
  if (!Array.isArray(value)) return DEFAULT_TECH_STACK_CATEGORIES;
  const out: TechStackField[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    const key = typeof entry.key === "string" ? entry.key.trim() : "";
    const label = typeof entry.label === "string" ? entry.label.trim() : "";
    if (!key || !label) continue;
    if (!key.startsWith(TECH_STACK_KEY_PREFIX)) continue;
    if (RESERVED_TECH_STACK_KEYS.has(key) || seen.has(key)) continue;
    seen.add(key);
    const suggestions = normalizeTools(entry.suggestions);
    out.push({ key, label, suggestions, placeholder: placeholderFor(label, suggestions) });
  }
  return out.length > 0 ? out : DEFAULT_TECH_STACK_CATEGORIES;
}

/**
 * Read a stored category value as a tool list.
 *
 * Tolerates the shapes a jsonb column can actually hand back: the array we
 * write, a bare string (an earlier single-value edit, or a hand-patched row),
 * or a comma-separated string from an import. Anything else reads as empty
 * rather than throwing inside a render.
 */
export function normalizeTools(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const name = String(item ?? "").trim();
    if (!name) continue;
    const dedupeKey = name.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push(name);
  }
  return out;
}
