# Tech stack

**Status:** Partially verified

Part of the [Client Profile](README.md) → **General information** tab.

## Summary

A section on the account's General information tab recording **the systems the account
already runs** — a workspace-configurable set of categories (shipped as HRIS, LMS,
performance, ATS, SSO, collaboration and BI), a fixed catch-all, and a free-text box for
the constraints a tool name cannot carry. Lists of chips; each add or removal is written
immediately. It is an editor only for someone who can write the account; everyone else
reads the same lists as plain chips.

Since 2026-09-10 **a Super Admin defines the categories** in Settings → Properties →
Tech stack categories: rename, reorder, add, remove, and curate what each suggests while
typing. A category's storage key is generated once and never changes, so a rename keeps
the tools already recorded under it.

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

**Super Admin as the section's designer.** The categories are workspace configuration, not
account data: a Super Admin decides which boxes every account shows, in what order, and
what each suggests (see [Configure the categories](#configure-the-categories)). No other
role is shown that editor.

## Entry points

- **Route:** `/clients/[id]`
- **Navigation path:** Sidebar → Clients → account → **General information** tab → scroll
  to **Tech stack** → click the header to expand. The section is **collapsed by default**
  and sits **below** the admin-defined property groups
  ([`ClientProfileTabs.tsx:504`](../../../components/clients/ClientProfileTabs.tsx)).
- **Admin route:** `/settings?tab=properties` → **Tech stack categories** — where the
  categories are defined. Sidebar → Settings → Properties, at the bottom of the tab
  alongside Stakeholder types and Attachment categories. **Super Admin only**; the section
  is not rendered for any other role.
- **Links in from:** nothing links directly to the section. It has no anchor and no
  deep-link.
- **Contextual actions:** none. There is no drawer, no modal and no Save button — every
  chip is written as it is added. For a user without write access there are no actions at
  all.

## Information architecture

1. **Section header** — the label "Tech stack", the subtitle "Systems this account already
   runs", and a badge reading **"Not recorded"** or **"N tools"**. The count is the total
   across every box and updates as chips are added, without a page reload.
2. **A two-column grid of chip boxes**, in the order Settings defines, followed by the
   fixed **Other tools** catch-all, which is never configurable. With nothing saved in
   Settings the shipped order is HRIS / HRMS · LMS / LXP · Performance management ·
   ATS / recruiting · SSO / identity · Collaboration · BI / analytics. Each box shows its
   own tool count and, when the
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

### Configure the categories

1. **Trigger** — Settings → Properties → **Tech stack categories**.
2. **Preconditions** — Super Admin. The whole section is inside the page's `superAdmin`
   branch, so Admin, Operator and Guest never see it
   ([`app/(app)/settings/page.tsx`](../../../app/%28app%29/settings/page.tsx)).
3. **User actions** — rename a category, move it up or down, add one, remove one (a browser
   `confirm()` first, whose wording states that recorded tools are kept), or expand it and
   edit its suggested tools as **one name per line** in a textarea.
4. **System behaviour** — every one of those actions `PUT`s the **whole list** to
   `/api/admin/stakeholder-config` as `{ key: "tech_stack_categories", value: [...] }`,
   which writes it to `workspace_config`. Each entry is stored as `{ key, label,
   suggestions }` — the input placeholder is derived on read, never stored. There is no
   Save button for the list itself; only the suggestion textarea has one
   ("Save suggestions"), and it is disabled until the text differs from what is saved.
5. **Result** — every client profile **rendered after the save** shows the new boxes in the
   new order. The profile page reads the configuration server-side on each request, so an
   already-open profile does not change until it is reloaded.
6. **Failure** — the list on screen is left as it was and the reason appears under it:
   *"Only an admin can change these."* on a 403, *"Save failed (HTTP nnn)."* otherwise, or
   *"Couldn't reach the server — nothing was saved."* when the request never left the
   browser. Two checks refuse in the browser before any request is sent: a blank name, and
   a name another category already uses (compared case-insensitively).

**Renaming keeps the data; removing hides it.** This is the rule that matters most in this
section — see [R8](#business-rules).

## Fields and data

All keys are top-level entries in `clients.properties`. None is required; an unset category
is simply absent.

**The key is not the label.** Every category carries a storage key generated once, when the
category is created, and never changed again — renaming "BI / analytics" to "Reporting"
leaves every account's tools under `tech_stack_bi`. The table below is therefore the
**shipped default** set: the labels are what a workspace sees until an admin edits them,
the keys are what is actually stored.

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

**A category an admin adds** gets a key of `tech_stack_` plus the label slugified —
lowercased, every run of non-alphanumeric characters collapsed to `_`, leading and trailing
`_` trimmed, capped at 40 characters — with `_2`, `_3`… appended if that key is already
taken or reserved (`techStackKeyFor()`). "Payroll" becomes `tech_stack_payroll`; a label
that slugifies to nothing becomes `tech_stack_category`. The stored value is the same shape
as every shipped category: a `string[]` of tool names.

**The configuration itself** lives in `workspace_config.tech_stack_categories`, not on the
account — see [Data model](#data-model).

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
| Section: **Not recorded** | No tools in any box | Default | Adding the first chip | Anyone who can edit the account | The header badge only |
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
  The lists ship as defaults in [`lib/tech-stack.ts`](../../../lib/tech-stack.ts) and are
  editable per category in Settings → Properties → Tech stack categories. Editing them
  changes what is *offered*, never what may be *recorded*.
- **R2 — One category, one key, one `string[]`.** Each category is its own top-level
  property key, so one edit `PATCH`es one key. Two people filling in different categories
  on the same account cannot clobber each other.
- **R2a — The suggestion lists are not a vocabulary.** Any text is accepted, in any
  category. The lists in `lib/tech-stack.ts` only shorten typing for tools that recur
  across accounts — or the lists an admin saved over them — and an unlisted or in-house
  system is recorded exactly as written. Nothing downstream validates a name against them.
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
- **R8 — A category's key is generated once and never changes.** The label is a display
  name; the key is the `clients.properties` key holding every account's recorded tools.
  Renaming therefore keeps the data — the Settings editor rewrites `label` and leaves `key`
  untouched — and **removing a category deletes nothing**: the tools stay in
  `clients.properties` and simply stop being rendered anywhere until a category with that
  key exists again. The removal confirm says so in those words. Nothing in the product
  lists keys no category claims, and the only way to bring one back is to recreate a
  category whose generated key happens to match.
- **R9 — An empty or unreadable configuration falls back to the shipped categories.**
  `normalizeTechStackCategories()` returns `DEFAULT_TECH_STACK_CATEGORIES` when the stored
  value is not an array, and again when every entry was dropped. An admin who removes the
  last category therefore gets the seven shipped ones back rather than a blank section.
  This is deliberate — the function's own header states it — and it is arguably surprising;
  see [Open questions](#open-questions).
- **R10 — Entries that could break a profile are dropped on read.** An entry is skipped when
  it is not an object, has no non-empty `key` or `label`, has a key that does not start with
  `tech_stack_`, has a key reserved by the catch-all or the notes box (`tech_stack_other`,
  `tech_stack_notes`), or repeats a key already taken — the first entry with a given key
  wins, because two boxes writing one property key would fight. Only a hand-edited
  `workspace_config` row can produce any of these; the Settings editor cannot.
- **R11 — The catch-all and the notes box are not configurable.** *Other tools*
  (`tech_stack_other`) and Integration notes (`tech_stack_notes`) are always present, and
  their keys are reserved so a configured category can never take one. The catch-all's
  suggestion pool is the union of every **configured** category's suggestions,
  de-duplicated and sorted — so it narrows or widens with the configuration rather than
  staying fixed.

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

**Configuring the categories is a separate, admin-level permission.**

- **Seeing the editor:** Settings → Properties renders the Tech stack categories section
  only inside its `superAdmin` branch, and it only reads the stored configuration at all
  when `superAdmin` is true
  ([`app/(app)/settings/page.tsx`](../../../app/%28app%29/settings/page.tsx)).
- **Server-side enforcement:** **both** `GET` and `PUT /api/admin/stakeholder-config` call
  `isAdminOrSuper()` and return 403 otherwise
  ([`app/api/admin/stakeholder-config/route.ts`](../../../app/api/admin/stakeholder-config/route.ts)).
  The key must appear in the route's `KEYS` allow-list — now
  `stakeholder_types`, `lumofy_staff`, `attachment_categories`, `tech_stack_categories` —
  and anything else is a 400.
- **The gate is wider than the interface.** The editor is Super Admin only, but the route
  accepts any Admin, so a non-super Admin could write the category list with a direct
  request. This is neither new nor specific to this key: Stakeholder types and Attachment
  categories sit behind the same route and the same super-admin-only UI. Flagged in
  [Open questions](#open-questions).
- **The configuration is workspace-wide.** There is no per-account, per-role or per-user
  variation — changing it changes every account's profile for every user.
- **Reading the configuration needs no permission at all**, because the profile page reads
  it server-side and passes it down; a Guest viewing an account sees the same configured
  boxes, as read-only chips.

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
- **Error:** the chip (or the note) is rolled back **and the reason is shown under the box**
  — the route's own refusal wording, `Couldn't save (HTTP nnn).`, or
  `Couldn't reach the server — nothing was saved.` No toast and no retry. In Settings, a
  failed configuration save leaves the list unchanged and shows its own reason under the
  editor.

## Data model

`clients.properties` (JSONB) — one `string[]` key per configured category, plus
`tech_stack_other` and the `tech_stack_notes` string, listed under
[Fields and data](#fields-and-data). No table, no migration, no property definition row:
these keys are **not** in `property_definitions`, so they never appear in the
admin-defined property groups above the section, and they are not editable as fields from
Settings → Properties.

`workspace_config.tech_stack_categories` (JSONB) — the category list itself: an ordered
array of `{ key, label, suggestions }`. Workspace-wide, written only by
`PUT /api/admin/stakeholder-config`, read by the Client Profile page and the Settings page.
Absent until an admin saves for the first time, and absent means "use the shipped
defaults" (R8/R9). It is the same hazard the churn taxonomy solves with stable slug ids: a
label is a display name, the id is what data hangs off.

See [data-model](../../data-model/README.md#on-clientsproperties).

## Technical implementation

| Concern | File |
|---|---|
| Shipped defaults (`DEFAULT_TECH_STACK_CATEGORIES`), config normalisation (`normalizeTechStackCategories`), key generation (`techStackKeyFor`), `placeholderFor`, `allToolSuggestions`, `normalizeTools` | [`lib/tech-stack.ts`](../../../lib/tech-stack.ts) |
| Admin editor (rename, reorder, add, remove, suggestion textarea) | [`components/settings/TechStackCategoriesManager.tsx`](../../../components/settings/TechStackCategoriesManager.tsx) |
| Settings section and its Super Admin branch | `PropertiesTab` in [`app/(app)/settings/page.tsx`](../../../app/%28app%29/settings/page.tsx) |
| Config read/write endpoint (`isAdminOrSuper` on both verbs) | [`app/api/admin/stakeholder-config/route.ts`](../../../app/api/admin/stakeholder-config/route.ts) |
| Server-side config read for the profile | `readTechStackCategories()` in [`app/(app)/clients/[id]/page.tsx`](../../../app/%28app%29/clients/%5Bid%5D/page.tsx) |
| Chip entry box (suggestions, keyboard handling, optimistic writes) | [`components/clients/ToolChipInput.tsx`](../../../components/clients/ToolChipInput.tsx) |
| Section and notes box | `TechStackSection` / `TechStackNotes` in [`components/clients/ClientProfileTabs.tsx:506-640`](../../../components/clients/ClientProfileTabs.tsx) |
| Write endpoint and gate | [`app/api/clients/[id]/route.ts`](../../../app/api/clients/%5Bid%5D/route.ts) |
| Persistence | `updateClientDetails` ([`lib/data.ts:1077`](../../../lib/data.ts)) → `mergeClientPropertiesDb` ([`lib/repo/drizzle.ts:1556`](../../../lib/repo/drizzle.ts)) |
| Dev-only preview | `app/scratch-tech-stack` — **not product**, see [known-limitations](../../known-limitations/README.md) |
| Tests | **None.** No test covers `lib/tech-stack.ts`, the component, or the route |

Notes worth knowing before changing this code:

- **The profile reads the configuration on the server, not in the section.** The Client
  Profile page calls `readTechStackCategories()` in its **third** bounded load wave (now 7
  reads; the waves are 8 / 8 / 7 against the cap of 8 that the long comment in that file
  explains) and hands the result down as a prop through `ClientProfileTabs` → `GeneralTab`
  → `TechStackSection`. The section never fetches it.
- **That read is best-effort.** No database, a thrown error, or an unreadable value all
  degrade to `normalizeTechStackCategories(null)` — the shipped defaults — rather than
  failing the page. It is the same contract as the use-case taxonomy read beside it, and it
  means the prop reaching `TechStackSection` is never empty.
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

- **No tests.** Not the component, not `normalizeTools`, not the permission path — and
  none of the configuration code added on 2026-09-10 either:
  `normalizeTechStackCategories`, `techStackKeyFor`, `placeholderFor`, the Settings
  manager, and the `tech_stack_categories` path through the config route are all uncovered.
  The full suite (287 tests) passes and none of it touches this.
- **A failed write is silent.** The chip rolls back with no explanation — including the
  403 a Guest or non-owning operator gets.
- **The data is write-only in product terms.** No column on the Clients directory, no
  filter, no Insights panel, no export, no completeness contribution, no action item. It is
  readable only by opening the account.
- **No spelling reconciliation.** "Workday", "workday " and "Workday HCM" are three distinct
  strings across accounts (de-duplication is per-category, per-account only), so counting
  adoption of a tool across the book would need normalisation first.
- **A tool can sit in two categories at once**; nothing detects it.
- **Removing a category hides recorded data with no way to see it.** The tools stay in
  `clients.properties`, but nothing in the product lists keys no category claims — an admin
  cannot find out what was hidden, and a CSM sees the account's recorded stack silently
  shrink.
- **A rename is neither confirmed nor recorded.** Nothing logs that "BI / analytics" is now
  "Reporting", so a reader later cannot tell why the label and the stored key disagree.
- **The configuration is workspace-wide, unversioned and unaudited**, like every other
  `workspace_config` value: no history, no rollback, no preview. See
  [settings](../settings/README.md#known-limitations).
- **A suggestion cannot contain a comma.** The Settings editor takes one tool per line but
  parses the text through `normalizeTools`, which splits on commas — so `Acme, Inc.` is
  saved as two suggestions.
- **The categories are configurable; the catch-all and the notes box are not.** A workspace
  cannot rename *Other tools* or *Integration notes*, or remove either.
- **Emptying a category stores `null`, not a removed key.** Harmless to every reader
  (`normalizeTools` treats it as empty) but it leaves the key present in the row.
- **One write per chip.** A CSM entering a ten-tool stack issues ten `PATCH` requests, each
  of which also triggers a `recomputeClient` for the account.
- **No audit trail**, consistent with the rest of the profile.

## Open questions

- Should any of this feed a product surface — an integration-risk signal, an expansion
  angle, a filter on the Clients directory? Today nothing reads it. *Product to decide.*
- **Should clearing every category really restore the defaults?** An admin who deliberately
  removes all seven gets them straight back (R9), with no way to express "this workspace
  records no tech stack". Defensible as a guard against a blank section, surprising as a
  product behaviour. *Product to decide.*
- **What happens to the tools under a removed category?** They are kept and hidden (R8).
  Nothing surfaces them, reports them, or offers to move them into *Other tools*. If a
  workspace reorganises its categories, that data is invisible until someone recreates a
  matching key. *Product to decide whether hidden-forever is the intended end state.*
- **Should a non-super Admin be able to write the category list?** The route allows it, the
  interface does not offer it — the same mismatch as Stakeholder types and Attachment
  categories. *Product / Engineering to settle for all three at once.*
- Who owns resolving name variants if this is ever aggregated across accounts?
- Suggestion lists are now admin-curated per category, but they are still **not**
  `property_definitions` option lists. Whether the two configuration surfaces should
  converge is open. *Product / Admin to decide.*

## Source references

`lib/tech-stack.ts` · `components/clients/ToolChipInput.tsx` ·
`components/clients/ClientProfileTabs.tsx` · `app/api/clients/[id]/route.ts` ·
`lib/data.ts` · `lib/repo/drizzle.ts` · `lib/auth.ts` · `lib/profile-completeness.ts` ·
`components/settings/TechStackCategoriesManager.tsx` ·
`app/api/admin/stakeholder-config/route.ts` · `app/(app)/settings/page.tsx` ·
`app/(app)/clients/[id]/page.tsx` · `app/scratch-tech-stack/page.tsx` · commit `d45a6cd`
and the revisions carrying this document

---

**Documentation status:** Partially verified — implementation read end to end (Settings
editor → `PUT /api/admin/stakeholder-config` → `workspace_config` → profile page read →
`TechStackSection`, and chip write → `PATCH /api/clients/[id]` → `updateClientDetails` →
`mergeClientPropertiesDb`); **no test covers any of it**. The 287-test suite passes and
none of it exercises this code.
**Last verified:** 2026-09-10 (configurable categories: verified in the dev preview that a
saved list of `Core HR (renamed)` / `Payroll` / `Ticketing` renders those boxes, and that a
tool stored under `tech_stack_hris` appears under the renamed "Core HR" label — key
stability working)
**Verified against commit:** `22d85a8` plus the uncommitted working-tree change that makes
the categories configurable. Sections re-read against it: Summary, Intended users, Entry
points, Information architecture, Configure the categories, Fields and data, Business
rules, Permissions, Data model, Technical implementation, Known limitations, Open
questions. The chip-entry workflows and states were **not** re-verified in this pass — they
were last verified 2026-09-10 against `d45a6cd` and this change did not touch them.
**Documentation owner:** Unassigned
