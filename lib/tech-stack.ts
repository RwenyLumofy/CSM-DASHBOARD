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
   ========================================================================= */

export type TechStackField = {
  /** client.properties key. */
  key: string;
  label: string;
  /** Shown in the empty input. */
  placeholder: string;
  /** Offered as you type. Free text is always allowed alongside these. */
  suggestions: string[];
};

export const TECH_STACK_FIELDS: TechStackField[] = [
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

/** Every suggestion across the categories, de-duplicated — the option pool for
 *  the catch-all box. */
export const ALL_TOOL_SUGGESTIONS: string[] = [
  ...new Set(TECH_STACK_FIELDS.flatMap((f) => f.suggestions)),
].sort((a, b) => a.localeCompare(b));

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
