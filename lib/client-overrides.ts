/* =========================================================================
   Client-level "core field" manual-override marker — mirrors the
   __deal_overrides pattern (lib/deal-overrides.ts) but for scalar clients
   TABLE COLUMNS that are ALSO populated by the HubSpot sync: name, domain,
   industry, country, employees, segment, startedAt.

   Without this, a CSM's manual correction on the General Information tab
   (e.g. fixing a wrong Industry) gets silently reverted the next time the
   HubSpot sync runs, because upsertClient()'s UPDATE set previously included
   every synced column unconditionally — only csm/implementationOwner and the
   properties JSONB itself were protected.

   Stored under client.properties.__field_overrides (a string[] of touched
   field names) — protected JSONB, survives the sync's `||` merge the same
   way __deal_overrides/__deal_dates/__status_override do.
   ========================================================================= */

export const FIELD_OVERRIDES_KEY = "__field_overrides";

/** Core clients-table columns that are both HubSpot-synced AND editable via
 *  updateClientFields(). Anything in this set gets marked in
 *  __field_overrides when a human sets it, and upsertClient() (HubSpot sync)
 *  / upsertClientFull() (CSV import) must skip re-writing it once marked.
 *  status and renewalDate are deliberately excluded — they're fully
 *  auto-computed by recomputeClient() (see lib/status.ts), not manually set
 *  from this path. */
export const CORE_OVERRIDABLE_FIELDS = ["name", "domain", "industry", "country", "employees", "segment", "startedAt", "churnedAt"] as const;

export function fieldOverridesSet(properties: Record<string, unknown> | undefined | null): Set<string> {
  const arr = (properties?.[FIELD_OVERRIDES_KEY] as string[] | undefined) ?? [];
  return new Set(arr);
}

/** Properties-JSONB fields that are normally auto-derived from deal history
 *  by recomputeClientReferral() on every sync (see lib/repo/drizzle.ts), but
 *  which a human can also set directly (the ClientsTable bulk-edit tool sets
 *  referral_source). Marking one here (via __field_overrides, same as the
 *  core columns above) tells recomputeClientReferral to skip recomputing it. */
export const RECOMPUTED_PROPERTY_FIELDS = ["referral_source", "closed_won_date_prop"] as const;
