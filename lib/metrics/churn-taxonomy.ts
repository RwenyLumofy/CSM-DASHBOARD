/* Churn taxonomy — the reason structure a churned account is bucketed into.
   A two-level tree: categories → reasons. Admin-editable in Settings → Churn
   taxonomy (stored in workspace_config key "churn_taxonomy"). A churned client
   is later tagged with ONE reason id from this tree; the Churn dashboard groups
   by category/reason. IDs are stable slugs so a saved report grouping / a
   client's stored reason survives a label rename. */

export interface ChurnReason {
  /** Stable slug — never shown, used to tag a churned client. */
  id: string;
  label: string;
}

export interface ChurnCategory {
  id: string;
  label: string;
  reasons: ChurnReason[];
}

export type ChurnTaxonomy = ChurnCategory[];

/** The starting taxonomy for a brand-new workspace (until an admin edits it). */
export const DEFAULT_CHURN_TAXONOMY: ChurnTaxonomy = [
  {
    id: "product",
    label: "Product fit",
    reasons: [
      { id: "missing_capability", label: "Missing capability" },
      { id: "reliability", label: "Bugs / reliability" },
      { id: "usability", label: "Hard to use" },
    ],
  },
  {
    id: "value",
    label: "Value & adoption",
    reasons: [
      { id: "low_adoption", label: "Low adoption" },
      { id: "unclear_roi", label: "Unclear ROI" },
      { id: "no_exec_sponsor", label: "No executive sponsor" },
    ],
  },
  {
    id: "commercial",
    label: "Commercial",
    reasons: [
      { id: "price", label: "Price / budget cut" },
      { id: "contract_terms", label: "Contract terms" },
    ],
  },
  {
    id: "relationship",
    label: "Relationship & service",
    reasons: [
      { id: "champion_left", label: "Champion left" },
      { id: "poor_support", label: "Poor support experience" },
      { id: "onboarding_failed", label: "Onboarding failed" },
    ],
  },
  {
    id: "external",
    label: "External",
    reasons: [
      { id: "competitor", label: "Switched to competitor" },
      { id: "acquired", label: "Acquired / merged" },
      { id: "shutdown", label: "Went out of business" },
    ],
  },
];

const slug = (s: string): string =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "item";

/** Coerce stored/loaded JSON into a valid taxonomy, dropping malformed entries
 *  and empty labels, de-duplicating ids, and back-filling missing ids from the
 *  label. Never throws — returns [] if nothing usable. */
export function normalizeChurnTaxonomy(raw: unknown): ChurnTaxonomy {
  if (!Array.isArray(raw)) return [];
  const seenCat = new Set<string>();
  const out: ChurnTaxonomy = [];
  for (const c of raw) {
    if (!c || typeof c !== "object") continue;
    const cat = c as Record<string, unknown>;
    const label = typeof cat.label === "string" ? cat.label.trim() : "";
    if (!label) continue;
    let id = typeof cat.id === "string" && cat.id.trim() ? cat.id.trim() : slug(label);
    while (seenCat.has(id)) id = `${id}_2`;
    seenCat.add(id);

    const seenReason = new Set<string>();
    const reasons: ChurnReason[] = [];
    const rawReasons = Array.isArray(cat.reasons) ? cat.reasons : [];
    for (const r of rawReasons) {
      if (!r || typeof r !== "object") continue;
      const rr = r as Record<string, unknown>;
      const rlabel = typeof rr.label === "string" ? rr.label.trim() : "";
      if (!rlabel) continue;
      let rid = typeof rr.id === "string" && rr.id.trim() ? rr.id.trim() : slug(rlabel);
      while (seenReason.has(rid)) rid = `${rid}_2`;
      seenReason.add(rid);
      reasons.push({ id: rid, label: rlabel });
    }
    out.push({ id, label, reasons });
  }
  return out;
}

/** All valid reason ids across the taxonomy (for validating a client's tag). */
export function churnReasonIds(taxonomy: ChurnTaxonomy): Set<string> {
  const ids = new Set<string>();
  for (const c of taxonomy) for (const r of c.reasons) ids.add(r.id);
  return ids;
}
