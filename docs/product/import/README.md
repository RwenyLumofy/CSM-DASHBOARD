# Import clients

**Status:** Partially verified

## Summary

Bulk-add existing ARR customers from an Excel (`.xlsx`) or CSV file, with a dry-run preview
before anything is written. Super Admin only.

## Purpose

New customers flow in automatically from HubSpot Closed Won deals. This is for the accounts
that already existed when Signal was adopted. Renewals and expansions are then managed
in-app, on the ARR ledger.

## Intended users

Super Admin only. A CSM sees an explanatory message, not the tool.

## Entry points

- **Route:** `/import` — **no navigation entry.** Reachable by direct URL, or from the
  Clients page import dialog (`components/clients/ImportDialog.tsx`).
- **Template:** `GET /api/import/clients?template=1` (Super Admin only)

## Primary workflow

1. **Trigger** — open `/import`, download the template, upload a file.
2. **Preconditions** — Super Admin. The API route enforces this itself on commit; the page
   gate only stops a CSM seeing a feature they cannot use.
3. **System behaviour:**
   1. `parseWorkbook` — reads the sheet.
   2. `validateRows` — produces a **preview with per-row errors** (the dry run).
   3. On confirm: `rowsToRecords` → `persistImport`.
4. **Result** — clients created, with ARR events, owners and properties.
5. **Failure** — invalid rows are reported per row in the preview; the commit is a separate,
   explicit step.

The importer is **column-tolerant**: headers match case-insensitively against
`COLUMN_ALIASES`, which lists common spellings for each field (e.g. `name` accepts
"client", "company", "account", "company_name", "client_name"). Adapting to a new supplied
layout is intended to be a one-line change.

## Fields

`ClientImportRow` in `lib/types.ts`, plus `csmEmail`. Columns include name, HubSpot company
id, owner email, ARR, and arbitrary client properties. See `COLUMN_ALIASES` in
[`lib/import/clients.ts`](../../../lib/import/clients.ts) for the accepted header spellings.

## Business rules

- **Import writes across the entire clients table**, not just "my clients" — which is
  exactly why it is Super Admin only.
- **Preview before commit.** Parse and validate run as a dry run; nothing is written until
  the user confirms.
- Imported accounts enter the same ARR ledger as everything else, so retention math treats
  them identically.

## Permissions

- **View the tool, download the template, commit an import:** Super Admin.
- **Server-side enforcement:** `isSuperAdmin()` on the page **and** on
  `app/api/import/clients/route.ts`.

## Automations and side effects

Newly created accounts are subject to the assignment workflow if their owner slots are
empty.

## Empty, loading and error states

Non-super-admins see: *"Only an admin can bulk-import clients. Contact your admin for
access."* Per-row validation errors surface in the preview.

## Data model

Writes `clients`, `arr_events`, and client properties.

## Technical implementation

`app/(app)/import/page.tsx` · `components/import/ImportClient.tsx` ·
`components/clients/ImportDialog.tsx` · `lib/import/clients.ts` ·
`app/api/import/clients/route.ts` · `xlsx` dependency.

## Analytics and observability

None. No record of who imported what, or when.

## Known limitations

1. **No import audit trail.**
2. **No undo.** A bad import must be corrected by hand or by a maintenance script.
3. **No navigation entry** — the route is undiscoverable without the Clients-page dialog.
4. **The final column layout was still pending** when the importer was written
   (`lib/import/clients.ts` header); the alias list is a stand-in.
5. **No tests.**

## Open questions

- Has the final column layout been supplied? If so, `COLUMN_ALIASES` may be stale.
- Should imports be reversible, given there is no undo?

## Source references

`app/(app)/import/page.tsx` · `lib/import/clients.ts` · `app/api/import/clients/route.ts`

---

**Documentation status:** Partially verified
**Last verified:** 2026-07-31 · **Commit:** `4214349` · **Owner:** Unassigned
