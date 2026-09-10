# Tech stack

**Status:** Partially verified

Part of the [Client Profile](README.md) → **General information** tab.

## Summary

A section on the account's General information tab recording **the systems the account
already runs** — HRIS, LMS, performance, ATS, SSO, collaboration, BI, a catch-all, and a
free-text box for the constraints a tool name cannot carry. Eight lists of chips; each
add or removal is written immediately. It is an editor only for someone who can write the
account; everyone else reads the same lists as plain chips.

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
— and, since the 2026-09-09 read-only pass, a reader is *shown* a reader's interface rather
than inputs that would be refused (see [Permissions](#permissions)).

## Entry points

- **Route:** `/clients/[id]`
- **Navigation path:** Sidebar → Clients → account → **General information** tab → scroll
  to **Tech stack** → click the header to expand. The section is **collapsed by default**
  and sits **below** the admin-defined property groups
  ([`ClientProfileTabs.tsx:504`](../../../components/clients/ClientProfileTabs.tsx)).
- **Links in from:** nothing links directly to the section. It has no anchor and no
  deep-link.
- **Contextual actions:** none. There is no drawer, no modal and no Save button — every
  chip is written as it is added. For a user without write access there are no actions at
  all.

## Information architecture

1. **Section header** — the label "Tech stack", the subtitle "Systems this account already
   runs", and a badge reading **"Not recorded"** or **"N tools"**. The count is the total
   across all eight lists and updates as chips are added, without a page reload.
2. **A two-column grid of eight chip boxes**, in fixed order: HRIS / HRMS · LMS / LXP ·
   Performance management · ATS / recruiting · SSO / identity · Collaboration ·
   BI / analytics · **Other tools**. Each box shows its own tool count and, when the
   section is editable, its own saving/saved indicator and any failure message. Read-only,
   a box is just its chips — or an em dash where the category is empty.
3. **Integration notes** — a free-text box below a divider, edited by click-to-edit with
   explicit Save / Cancel. Read-only it is plain text, or the italic
   “No notes recorded.”

## Primary workflows

### Record a tool

1. **Trigger** — the CSM types into a category box.
2. **Preconditions** — the account is open **and** the server resolved `canEditClient` to
   true for this user when the page rendered. If it did not, there is no input to type
   into; the box shows the recorded chips and nothing else.
3. **User actions** — type a name and press **Enter**, or pick a suggestion with the arrow
   keys or the mouse. Suggestions appear as you type (substring match, case-insensitive,
   **at most 8** shown), already-recorded tools are excluded from them, and the list is
   headed *Suggestions — or type any tool and press Enter*, because it is a typing aid and
   **not** the set of tools that may be recorded.

   **Enter files what you typed unless you arrowed onto a suggestion.** Hovering the list
   lights a row up but does not arm Enter — the pointer resting over a dropdown is where
   the mouse happens to be, not a choice — so an in-house tool whose name merely overlaps
   a known one is recorded as typed. Arrowing back off the top row returns Enter to the
   typed text, and while no row is armed the list shows *Press Enter to add "…"*.
4. **System behaviour** — the chip is added optimistically, then the whole category list is
   `PATCH`ed to `/api/clients/[id]` as `{ properties: { <category key>: [...] } }`. The
   route applies the write gate — the *only* place it is applied on this path — and merges
   the single key into `clients.properties`.
5. **Result** — the chip stays, a tick shows for ~1.6s, and the section's tool count
   increments.
6. **Failure** — any non-2xx response, or a network error, **rolls the chip back out of the
   list** and shows the reason underneath the box. The reason is the API route's own
   `error` string when it sends one — a refused write reads
   *"You don't have permission to edit this account."* — otherwise
   *"Couldn't save (HTTP nnn)."*, or *"Couldn't reach the server — nothing was saved."*
   when the request never left the browser. The header count is not incremented, because
   it only moves on a successful write.

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
`PATCH`ed. A failure restores it and shows the same reason as a failed add. Removing the
**last** chip in a category writes JSON `null` for that key rather than deleting the key.

### Correct a mistyped tool

**Backspace** in an empty input removes the last chip and puts its text back in the input
for editing. This is a real removal — it issues a write — and re-adding the corrected name
issues a second write.

### Write integration notes

1. **Trigger** — click the notes area ("No notes yet — click to add."). The area is only
   clickable for a user who can write the account; otherwise it is plain text.
2. **User actions** — type prose; **Escape** cancels, **Save** commits, **Cancel** discards.
3. **System behaviour** — the trimmed text is `PATCH`ed as `tech_stack_notes`; empty text
   is written as `null`.
4. **Failure** — the previous text is restored **and the reason is shown** below the box,
   from the same wording as a chip failure.

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
| Box: **read-only** | The viewer cannot write the account: chips only, no input, no × , no indicator; an em dash where the category is empty | `canEdit` false on render | Nothing — it is fixed for the session | — | Removes every write affordance |
| Box: **saving** | A write is in flight (spinner). Editable boxes only | Add or remove | The response | — | Nothing persisted yet |
| Box: **saved** | The write succeeded (tick, ~1.6s). Editable boxes only | A 2xx response | Timeout | — | — |
| Box: **failed** | The write was refused or never arrived: the chip is rolled back and the reason sits under the box | A non-2xx response or a thrown `fetch` | The next write attempt (which clears it) | — | Nothing persisted; the header count is unchanged |
| Notes: **viewing / editing** | Click-to-edit. Editing is unreachable when `canEdit` is false, because the control that enters it is not rendered | Clicking the text / Save or Cancel | — | Same | — |
| Notes: **failed** | The note was not saved: the previous text is restored and the reason is shown | A non-2xx response or a thrown `fetch` | The next Save | — | Nothing persisted |

There is no draft state, no dirty state and no unsaved-changes warning — because there is
nothing to lose: every change is already written, or already rolled back with the reason on
screen.

## Business rules

Enforced in the interface unless stated otherwise.

- **R1 — Suggestions are a typing aid, not a closed vocabulary.** Any free text is accepted.
  The suggestion lists are hard-coded in [`lib/tech-stack.ts`](../../../lib/tech-stack.ts)
  and are not configurable in Settings.
- **R2 — One category, one key, one `string[]`.** Each category is its own top-level
  property key, so one edit `PATCH`es one key. Two people filling in different categories
  on the same account cannot clobber each other.
- **R2a — The suggestion lists are not a vocabulary.** Any text is accepted, in any
  category. The lists in `lib/tech-stack.ts` only shorten typing for tools that recur
  across accounts; an unlisted or in-house system is recorded exactly as written, and
  nothing downstream validates a name against them.
- **R3 — A category may not hold the same tool twice**, compared case-insensitively. The
  same tool **may** appear in two different categories; nothing prevents it.
- **R4 — Every add and every removal is written immediately**, with optimistic rollback on
  failure and the failure reason shown under the box. There is no Save button for the chips.
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

**The interface now matches the gate — for this section only.** The profile page resolves
`canEditClient` on the server (`app/(app)/clients/[id]/page.tsx:55`) and has always passed
it to `ClientProfileTabs` as `canEditClient`. Since 2026-09-09 that value is also handed to
`GeneralTab`, and from there to `TechStackSection`, `ToolChipInput` and `TechStackNotes`
([`ClientProfileTabs.tsx:275`, `:504`](../../../components/clients/ClientProfileTabs.tsx)).
When it is false the section renders chips as static text: no text input, no × on a chip,
no click-to-edit on the notes, and no saving/saved indicator. A Guest or a non-owning
operator is therefore not offered a write they cannot make.

**This is an affordance, not the permission.** The gate is still `PATCH /api/clients/[id]`,
unchanged by this pass, and it is re-applied on every write regardless of what the page
rendered.

**The rest of the General information tab is still ungated in the interface.** The
admin-defined property groups above the section, and the Account grid, render
`EditableField` without a `canEdit` (its existing `readOnly` prop is passed by no call site
in `GeneralTab`), so a Guest still gets click-to-edit controls there and still sees a
silent rollback when the server refuses. Only the Tech stack section honours the flag
today. Do not read this section as evidence that the tab as a whole is gated.

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
`app/scratch-tech-stack/page.tsx` · commits `d45a6cd` and the revision carrying this
document

---

**Documentation status:** Partially verified — implementation read end to end (component →
route → `updateClientDetails` → `mergeClientPropertiesDb`); **no test covers any of it**.
**Last verified:** 2026-09-10 (suggestion/free-text behaviour re-verified in the dev
preview after the hover fix)
**Verified against commit:** `d45a6cd`, plus the read-only / failure-message pass committed
alongside this revision (the permissions and error-state sections were re-read against it,
and both states were exercised in the dev preview)
**Documentation owner:** Unassigned
