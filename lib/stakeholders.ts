/* =========================================================================
   Stakeholder mapping — single source of truth for the shape stored at
   client.properties.stakeholder_mappings (the Communication tab's Stakeholder
   Mapping matrix). Each row maps a stakeholder TYPE (e.g. "Champion") to
   client contacts and Lumofy team members.

   Both sides became multi-select (contactIds/staffIds arrays) — previously
   each row held a single contactId/staffId. normalizeStakeholderMappings
   tolerates that pre-multi-select singular shape on old rows already
   persisted in the DB (no migration needed: it upgrades in memory on every
   read, and is only written back in the new array shape once a user re-saves
   the matrix in the UI).
   ========================================================================= */

export interface StakeholderMapping {
  type: string;
  contactIds: string[];
  staffIds: string[];
}

function normalizeIds(arrField: unknown, legacySingularField: unknown): string[] {
  if (Array.isArray(arrField)) {
    return arrField.filter((x): x is string => typeof x === "string" && x.length > 0);
  }
  if (typeof legacySingularField === "string" && legacySingularField.length > 0) {
    return [legacySingularField];
  }
  return [];
}

export function normalizeStakeholderMappings(raw: unknown): StakeholderMapping[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
    .map((m) => ({
      type: String(m.type ?? ""),
      contactIds: normalizeIds(m.contactIds, m.contactId),
      staffIds: normalizeIds(m.staffIds, m.staffId),
    }));
}
