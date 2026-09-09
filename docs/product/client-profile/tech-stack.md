# Tech stack

**Status:** Partially verified

Part of the [Client Profile](README.md) → **General information** tab.

## Summary

A section on the account's General information tab recording **the systems the account
already runs** — HRIS, LMS, performance, ATS, SSO, collaboration, BI, a catch-all, and a
free-text box for the constraints a tool name cannot carry. Eight lists of chips; each
add or removal is written immediately.

## Purpose

Signal could describe an account's package, its people and its health, but not what it
already runs — the HRIS the org chart has to come out of, the LMS Lumofy sits beside, the
identity provider that gates every login. That answer lived in call notes and left with
whoever took them. Recording it on the account makes it available to whoever handles the
integration, the migration or the renewal conversation next.

It supports integration and implementation planning and displacement/competitive context.
It is **reference data**: nothing in Signal calculates anything from it (see
[Known limitations](#known-limitations)).

## Intended users

CSM (operator) who owns the account, Admin and Super Admin on any account — these are the
roles that can write it. Implementation, Support and Revenue as readers. Guest as a reader
(but see [Permissions](#permissions) — the interface does not stop a Guest typing).

## Entry points

- **Route:** `/clients/[id]`
- **Navigation path:** Sidebar → Clients → account → **General information** tab → scroll
  to **Tech stack** → click the header to expand. The section is **collapsed by default**
  and sits **below** the admin-defined property groups
  ([`ClientProfileTabs.tsx:494`](../../../components/clients/ClientProfileTabs.tsx)).
- **Links in from:** nothing links directly to the section. It has no anchor and no
  deep-link.
- **Contextual actions:** none. There is no drawer, no modal and no Save button — every
  chip is written as it is added.

## Information architecture

1. **Section header** — the label "Tech stack", the subtitle "Systems this account already
   runs", and a badge reading **"Not recorded"** or **"N tools"**. The count is the total
   across all eight lists and updates as chips are added, without a page reload.
2. **A two-column grid of eight chip boxes**, in fixed order: HRIS / HRMS · LMS / LXP ·
   Performance management · ATS / recruiting · SSO / identity · Collaboration ·
   BI / analytics · **Other tools**. Each box shows its own tool count and its own
   saving/saved indicator.
3. **Integration notes** — a free-text box below a divider, edited by click-to-edit with
   explicit Save / Cancel.

## Primary workflows

### Record a tool

1. **Trigger** — the CSM types into a category box.
2. **Preconditions** — the account is open and the user passes `canEditClient` **on the
   server**; nothing in the interface checks first.
3. **User actions** — type a name and press **Enter**, or pick a suggestion with the arrow
   keys or the mouse. Suggestions appear as you type (substring match, case-insensitive,
   **at most 8** shown), already-recorded tools are excluded from them, and free text that
   matches nothing is accepted — the box shows *Press Enter to add "…"*.
4. **System behaviour** — the chip is added optimistically, then the whole category list is
   `PATCH`ed to `/api/clients/[id]` as `{ properties: { <category key>: [...] } }`. The
   route applies the write gate — the *only* place it is applied on this path — and merges
   the single key into `clients.properties`.
5. **Result** — the chip stays, a tick shows for ~1.6s, and the section's tool count
   increments.
6. **Failure** — any non-2xx response, or a network error, **rolls the chip back out of the
   list**. No message is shown; the chip simply disappears. This is what a Guest or a
   non-owning operator sees, because their 403 arrives after the chip has been drawn.

### Paste several tools at once

Typing or pasting `Workday, BambooHR, Personio` and pressing Enter — or typing a comma —
files **three chips**, not one. The raw text is split on commas, each part trimmed, blanks
dropped, and duplicates (case-insensitive, within that category) skipped. One `PATCH` is
sent for the resulting list.

### Leave the box with something half-typed

Blurring the input commits whatever is in it after a 150ms delay, so a name is not lost to
a stray click. Clicking a suggestion cancels that pending commit, so `gree` + a click on
**Greenhouse** files *Greenhouse* — not `gree`.

### Remove a tool

Click the × on the chip. The chip is removed optimistically and the shortened list is
`PATCH`ed. A failure restores it. Removing the **last** chip in a category writes JSON
`null` for that key rather than deleting the key.

### Correct a mistyped tool

**Backspace** in an empty input removes the last chip and puts its text back in the input
for editing. This is a real removal — it issues a write — and re-adding the corrected name
issues a second write.

### Write integration notes

1. **Trigger** — click the notes area ("No notes yet — click to add.").
2. **User actions** — type prose; **Escape** cancels, **Save** commits, **Cancel** discards.
3. **System behaviour** — the trimmed text is `PATCH`ed as `tech_stack_notes`; empty text
   is written as `null`.
4. **Failure** — the previous text is restored silently. No message.

## Fields and data

All keys are top-level entries in `clients.properties`. None is required; an unset category
is simply absent.

| Label | Meaning | Type | Required | Default | Editable by | Source | Validation | Downstream effects |
|---|---|---|---|---|---|---|---|---|
| HRIS / HRMS (`tech_stack_hris`) | The account's HR system of record | `string[]` | No | absent | anyone passing `canEditClient` | CSM-entered | trimmed; comma-split; case-insensitive de-duplication within the category | **None** |
| LMS / LXP (`tech_stack_lms`) | Learning platforms Lumofy sits beside or replaces | `string[]` | No | absent | same | CSM-entered | same | **None** |
| Performance management (`tech_stack_performance`) | Review / goal tooling | `string[]` | No | absent | same | CSM-entered | same | **None** |
| ATS / recruiting (`tech_stack_ats`) | Hiring systems | `string[]` | No | absent | same | CSM-entered | same | **None** |
| SSO / identity (`tech_stack_sso`) | The identity provider gating access | `string[]` | No | absent | same | CSM-entered | same | **None** |
| Collaboration (`tech_stack_collaboration`) | Where the account's people work | `string[]` | No | absent | same | CSM-entered | same | **None** |
| BI / analytics (`tech_stack_bi`) | Where reporting happens | `string[]` | No | absent | same | CSM-entered | same | **None** |
| Other tools (`tech_stack_other`) | Anything the categories have no slot for — payroll, ticketing, an in-house portal | `string[]` | No | absent | same | CSM-entered | same; suggestions are the union of every category's list, de-duplicated and sorted | **None** |
| Integration notes (`tech_stack_notes`) | Who owns a system, how it can be connected, what blocks a migration | `string` | No | absent | same | CSM-entered | trimmed; empty stored as `null`; no length limit; stored and rendered as plain text | **None** |

**Nothing here is synced.** No HubSpot, Intercom or Metabase field maps to any of these
keys — verified by searching the repository for `tech_stack` (only `lib/tech-stack.ts`, the
profile section and the preview route match).

**Reading is tolerant.** `normalizeTools()` accepts the array the product writes, a bare
string (an older single-value edit or a hand-patched row), or a comma-separated string from
an import; anything else reads as an empty list rather than throwing inside a render. It
trims, drops blanks and de-duplicates case-insensitively on read as well as on write.

## States and statuses

| State | Meaning | Entered by | Exited by | Who can change it | What it affects |
|---|---|---|---|---|---|
| Section: **Not recorded** | No tools in any of the eight lists | Default | Adding the first chip | Anyone who can edit the account | The header badge only |
| Section: **N tools** | Total chips across all lists | A successful write | Removing chips | Same | The header badge only |
| Box: **saving** | A write is in flight (spinner) | Add or remove | The response | — | Nothing persisted yet |
| Box: **saved** | The write succeeded (tick, ~1.6s) | A 2xx response | Timeout | — | — |
| Notes: **viewing / editing** | Click-to-edit | Clicking the text / Save or Cancel | — | Same | — |

There is no draft state, no dirty state and no unsaved-changes warning — because there is
nothing to lose: every change is already written or already rolled back.

## Business rules

Enforced in the interface unless stated otherwise.

- **R1 — Suggestions are a typing aid, not a closed vocabulary.** Any free text is accepted.
  The suggestion lists are hard-coded in [`lib/tech-stack.ts`](../../../lib/tech-stack.ts)
  and are not configurable in Settings.
- **R2 — One category, one key, one `string[]`.** Each category is its own top-level
  property key, so one edit `PATCH`es one key. Two people filling in different categories
  on the same account cannot clobber each other.
- **R3 — A category may not hold the same tool twice**, compared case-insensitively. The
  same tool **may** appear in two different categories; nothing prevents it.
- **R4 — Every add and every removal is written immediately**, with optimistic rollback on
  failure. There is no Save button for the chips.
- **R5 — The write is a top-level key merge, not a replace.** The route calls
  `updateClientDetails`, which calls `mergeClientPropertiesDb`
  ([`lib/repo/drizzle.ts:1556`](../../../lib/repo/drizzle.ts)) — a single
  `properties = properties || patch` statement in Postgres. Keys absent from the patch are
  preserved; the patched key is replaced wholesale. See
  [client-profile business rules](README.md#business-rules).
- **R6 — Sync never touches these keys.** Both `upsertClient` and `upsertClientFull` merge
  properties with `||` rather than replacing them
  ([`lib/repo/drizzle.ts:1017-1097`](../../../lib/repo/drizzle.ts)), so a HubSpot sync or a
  re-import cannot clear a recorded stack.
- **R7 — Tech stack does not count towards profile completeness.** The red and yellow field
  lists in [`lib/profile-completeness.ts`](../../../lib/profile-completeness.ts) are
  hard-coded and contain none of these keys, so an account with no stack recorded is not
  flagged, does not appear in a completeness notification, and generates no action item.
  See [profile-completeness](../../business-rules/profile-completeness.md).

## Permissions

- **View:** anyone who can open the profile — Super Admin, Admin, Guest (all accounts) and
  Operator (owned or granted).
- **Create / edit / delete:** everyone except Guest, within scope — i.e. whoever passes
  `canEditClient`.
- **Protected actions:** none specific to this section.
- **Server-side enforcement:** `PATCH /api/clients/[id]` resolves the account, then applies
  `canSeeClient` (404 if it fails) and `canEditClient` (403 if it fails) —
  [`app/api/clients/[id]/route.ts:65-70`](../../../app/api/clients/%5Bid%5D/route.ts) —
  before calling `updateClientDetails`. The tech-stack keys are **not** in
  `COLLABORATIVE_PROPERTY_KEYS` (currently empty), so they get no carve-out from the
  owner-scope gate: an operator can only record a stack on an account they own or have been
  granted.

**The interface does not gate.** `TechStackSection` receives no `canEdit` prop — the whole
General information tab is rendered without one — so a Guest or a non-owning operator sees
live inputs, can type a chip, and watches it vanish when the 403 comes back. The permission
is real and server-side; the affordance is misleading. This follows the existing General-tab
pattern rather than introducing it.

## Automations and side effects

- **`recomputeClient(clientId)` runs after every properties write**
  ([`lib/data.ts:1095-1120`](../../../lib/data.ts)) — it exists so a deal-override edit
  re-materialises ARR and status immediately. No tech-stack key is an input to it, so the
  effect here is a redundant recompute, not a behaviour change. A failure is swallowed and
  logged; the save still succeeds.
- **No notifications, no action items, no tasks, no health input, no Insights panel.**
  Nothing observes these keys.
- **No audit trail.** Consistent with the rest of the profile.

## Empty, loading and error states

- **Empty:** the header badge reads "Not recorded"; each empty box shows its own placeholder
  (e.g. *Workday, BambooHR…*); the notes area reads "No notes yet — click to add."
- **Loading:** the section renders from the server-rendered client row — there is no
  separate fetch and no skeleton. Per-write state is the spinner in the box header.
- **Error:** **silent rollback only.** No toast, no inline message, no retry. A CSM who has
  lost connectivity, or who lacks permission, sees chips that refuse to stick with no
  explanation.

## Data model

`clients.properties` (JSONB) — eight `string[]` keys plus one string key, listed under
[Fields and data](#fields-and-data). No table, no migration, no property definition row:
these keys are **not** in `property_definitions`, so they never appear in the
admin-defined property groups above the section, and they are not editable from
Settings → Properties.

See [data-model](../../data-model/README.md#on-clientsproperties).

## Technical implementation

| Concern | File |
|---|---|
| Category definitions, per-category suggestions, `normalizeTools` | [`lib/tech-stack.ts`](../../../lib/tech-stack.ts) |
| Chip entry box (suggestions, keyboard handling, optimistic writes) | [`components/clients/ToolChipInput.tsx`](../../../components/clients/ToolChipInput.tsx) |
| Section and notes box | `TechStackSection` / `TechStackNotes` in [`components/clients/ClientProfileTabs.tsx:506-640`](../../../components/clients/ClientProfileTabs.tsx) |
| Write endpoint and gate | [`app/api/clients/[id]/route.ts`](../../../app/api/clients/%5Bid%5D/route.ts) |
| Persistence | `updateClientDetails` ([`lib/data.ts:1077`](../../../lib/data.ts)) → `mergeClientPropertiesDb` ([`lib/repo/drizzle.ts:1556`](../../../lib/repo/drizzle.ts)) |
| Dev-only preview | `app/scratch-tech-stack` — **not product**, see [known-limitations](../../known-limitations/README.md) |
| Tests | **None.** No test covers `lib/tech-stack.ts`, the component, or the route |

Two implementation notes worth knowing before changing this code:

- The chip box is deliberately **always live**, unlike the click-to-edit treatment every
  other field on the tab uses. The module header states the reason: recording a stack is
  list-building, not single-value correction.
- The same commit added an optional `placeholder` prop to the tab's shared `EditableField`
  and `EditInput`. **No call site passes it**, so it has no user-visible effect today.

## Analytics and observability

None. Signal has no product analytics SDK, and nothing here logs. A failed write is not
recorded anywhere — the client swallows it to return `false`, and the server only logs a
500. There is no way to answer "how many accounts have a stack recorded" from within the
product; it requires a database query.

## Dependencies

[Client Profile](README.md) · the client `PATCH` route and its write gate
([permissions-and-scoping](../../business-rules/permissions-and-scoping.md)) ·
`clients.properties` JSONB merge. **No external system.**

## Known limitations

- **No tests.** Not the component, not `normalizeTools`, not the permission path.
- **A failed write is silent.** The chip rolls back with no explanation — including the
  403 a Guest or non-owning operator gets.
- **The inputs are shown to users who cannot save.** The section takes no `canEdit` prop.
- **The data is write-only in product terms.** No column on the Clients directory, no
  filter, no Insights panel, no export, no completeness contribution, no action item. It is
  readable only by opening the account.
- **No spelling reconciliation.** "Workday", "workday " and "Workday HCM" are three distinct
  strings across accounts (de-duplication is per-category, per-account only), so counting
  adoption of a tool across the book would need normalisation first.
- **A tool can sit in two categories at once**; nothing detects it.
- **The suggestion lists are code constants.** Adding a tool to the offered list is a code
  change; an admin cannot curate them in Settings the way they curate property options.
- **Emptying a category stores `null`, not a removed key.** Harmless to every reader
  (`normalizeTools` treats it as empty) but it leaves the key present in the row.
- **One write per chip.** A CSM entering a ten-tool stack issues ten `PATCH` requests, each
  of which also triggers a `recomputeClient` for the account.
- **No audit trail**, consistent with the rest of the profile.

## Open questions

- Should any of this feed a product surface — an integration-risk signal, an expansion
  angle, a filter on the Clients directory? Today nothing reads it. *Product to decide.*
- Should the suggestion lists become admin-curated property options rather than code
  constants? *Product / Admin to decide.*
- Should the categories be workspace-configurable? They are fixed and Lumofy-specific
  (HRIS, LMS, performance, ATS, SSO, collaboration, BI).
- Who owns resolving name variants if this is ever aggregated across accounts?

## Source references

`lib/tech-stack.ts` · `components/clients/ToolChipInput.tsx` ·
`components/clients/ClientProfileTabs.tsx` · `app/api/clients/[id]/route.ts` ·
`lib/data.ts` · `lib/repo/drizzle.ts` · `lib/auth.ts` · `lib/profile-completeness.ts` ·
`app/scratch-tech-stack/page.tsx` · commit `d45a6cd`

---

**Documentation status:** Partially verified — implementation read end to end (component →
route → `updateClientDetails` → `mergeClientPropertiesDb`); **no test covers any of it**.
**Last verified:** 2026-09-09
**Verified against commit:** `d45a6cd`
**Documentation owner:** Unassigned
