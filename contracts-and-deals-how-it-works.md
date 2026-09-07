# Contracts & deals — how it actually works

A description of the **current, shipped** behaviour of the Contracts & deals section of the
client profile in Signal (`lumofy-signals`), written to be reviewed against the code.

**Repo:** `/Users/mahmoodmalik/Desktop/signal project/CSM-DASHBOARD`
**Written:** 1 Sept 2026. Line numbers drift — search the named symbol if one doesn't match.

Every claim below carries a `file:line`. Claims are marked:

- **[V]** — read directly in the source, high confidence
- **[I]** — inferred from code I read, not executed or observed at runtime
- **[?]** — not verified; flagged for the reviewer

---

## 1. What it is

The account's commercial record inside the client profile. It answers *what has this customer
bought, what is it worth, and does it still count?*

Two jobs beyond display:

1. **The only place a CSM can correct HubSpot's data** without editing HubSpot. **[V]**
2. **The only home for facts HubSpot doesn't hold** — the delivery milestone dates and the
   sales→CS handover brief. **[V]**

It is **not** a tab. It renders as a collapsible panel inside the **General information** tab,
between the Account section and the remaining property groups.
`components/clients/ClientProfileTabs.tsx:472` **[V]**

The whole section lives in a 3,308-line file:
- `DealsTabs` — `ClientProfileTabs.tsx:2587` (bucketing, save handlers, the tracked-draft bar)
- `DealCard` — `ClientProfileTabs.tsx:2835` (one deal, collapsed→expanded)
- `OverrideField` — `ClientProfileTabs.tsx:3204` (an editable synced field)
- `DealDateField` — `ClientProfileTabs.tsx:3164` (a CSM milestone date) **[V]**

---

## 2. Data in — what syncs

HubSpot's scope is deliberately narrow: **Closed Won deals in the Direct and Indirect Sales
pipelines**, plus **CS-pipeline deals** in the Renewed / Expanded / Confirmed Churned /
Downgraded stages. `lib/integrations/hubspot.ts:4`, `:47`, `:224` **[V]**

CS stages are classified into a tab bucket by `classifyCsCategory()`
(`lib/integrations/hubspot.ts:54`): **[V]**

| `dealstage` | `category` |
|---|---|
| CS Expanded | `expansion` |
| CS Confirmed Churned | `confirmed_churn` |
| CS Downgraded | `downgraded` |
| anything else in CS | `renewal` ← **catch-all** |

> **Review point.** `renewal` is the fallback for *any unrecognised CS stage*, so a deal in a
> new or mis-set HubSpot stage silently presents as a renewal. The UI repeats this: the
> "Renewal" tab is `pipeline === "cs"` minus the three explicit buckets
> (`ClientProfileTabs.tsx:2603`). Nothing distinguishes a real renewal from an unclassified
> deal. **[V]**

Deals land in `client_deals`. The `Deal` type is `lib/types.ts` (`export interface Deal`).
**It has no `currency` column** — the UI hardcodes `"USD"` at `ClientProfileTabs.tsx:2929`
and `:2965`. Per `lib/db/schema.ts:670`, all 132 accounts are USD and `arr_events` has no
currency column either, so single-currency is the design, not an oversight. **[V]**

---

## 3. Storage model

Four write targets. Only one is a real column.

| What | Where | Shape |
|---|---|---|
| Tracked flag | `client_deals.tracked` column | boolean, defaults true |
| Field overrides | `clients.properties.__deal_overrides` | `{ [dealId]: { [field]: value } }` |
| Milestone dates | `clients.properties.__deal_dates` | `{ [dealId]: { [dateKey]: iso } }` |
| Handover brief | `clients.properties.__deal_briefs` | `{ [dealId]: string }` |

Keys at `lib/deal-overrides.ts:25-27`. **[V]**

**Effective deal = synced values with overrides spread on top**, a shallow merge:
```ts
// lib/deal-overrides.ts:105
export function applyDealOverrides(deal: Deal, override: Record<string, unknown> | undefined): Deal {
  if (!override || Object.keys(override).length === 0) return deal;
  return { ...deal, ...override } as Deal;
}
```
**[V]** The presence of a key in the override bag is what renders the "edited" badge.

**A full re-sync clears `__deal_overrides`** — stated in the module comment at
`ClientProfileTabs.tsx:333`. **[V]** (Whether the Settings action actually does this is **[?]**
— I read the comment, not the re-sync implementation.)

### The seven CSM milestone dates
`ClientProfileTabs.tsx:323` — `invoice_sent_date`, `kickoff_meeting_date`, `launch_date`,
`platform_start_date`, `platform_end_date`, `global_library_start_date`,
`global_library_expiry_date`. **[V]**

The two library dates are dimmed and unrequired when the deal has no library, via
`hasGlobalLibrary()` (`lib/deal-overrides.ts:120`) — which treats a literal `"None"` in the
multi-select as "no library". The deal card and the completeness badge share this one
function so they can't disagree. **[V]**

---

## 4. Write path — four separate flows

All in `DealsTabs`:

| Flow | Function | Endpoint | Commits |
|---|---|---|---|
| Field override | `saveDealField` `:2660` | `PATCH /api/clients/[id]` | on blur |
| Multi-field | `saveDealFields` `:2679` | same | on blur |
| Milestone date | `saveDealDate` `:2698` | same | on blur |
| Brief | `saveDealBrief` `:2645` | same | on Save button |
| **Tracked** | `save()` `:2628` | `PATCH /api/deals/[id]` | **explicit Save, batched** |

**[V]**

> **Review point — two save models in one card.** Every field commits on blur except
> `tracked`, which edits a draft and needs an explicit Save from a bar at the bottom of the
> *whole section* (`:2810`), far from the checkbox. That one field is also the one that moves
> revenue. **[V]**

> **Review point — all four save paths fail silently.** `catch { revert }` at `:2655`, `:2676`,
> `:2695`, `:2711`. No toast, no inline error, no retry. A 403, a dropped connection and a
> value that wouldn't stick are indistinguishable. **[V]**

### Property merge depth — a concurrency hazard

The route merges in Postgres, not JS, deliberately:
```sql
-- lib/repo/drizzle.ts:1516
SET properties = COALESCE(properties, '{}'::jsonb) || $patch::jsonb
```
The comment at `lib/data.ts:1069` explains why: a JS read-modify-write raced other writers on
the same row (cs_pulse, cs_health, churn_reasons, usage sync) and silently erased keys. **[V]**

**But `||` is a *shallow* merge.** The browser sends the **entire** `__deal_overrides` map,
rebuilt from the props it loaded at render (`ClientProfileTabs.tsx:2672`). So:

- Cross-key races are fixed (`__deal_overrides` vs `cs_pulse`). **[V]**
- **Within-key races are not.** Two CSMs editing *different deals on the same account*
  concurrently: the second save replaces the whole map and drops the first's edit. **[I]** —
  follows from the shallow merge plus the whole-map payload; I did not reproduce it.

---

## 5. What an edit recomputes — three freshness horizons

**This is the least obvious part of the page and the most important to get right.**

`recomputeClient()` (`lib/repo/drizzle.ts:633`) writes **exactly four columns**:
```ts
// lib/repo/drizzle.ts:707
.set({ arr, previousArr, renewalDate, status, updatedAt: new Date() })
```
**[V]**

Everything else is computed elsewhere, on a different cadence:

| Fact | Computed where | Refresh after a deal edit |
|---|---|---|
| `arr`, `previousArr`, `renewalDate`, `status` | `recomputeClient()` `drizzle.ts:642` | **immediate** |
| Profile-completeness badge (what you see) | on read, `clients/[id]/page.tsx:181`, `clients/page.tsx:48` | **immediate** (every render) |
| Use-case rollup | `recomputeClientHealth()` `drizzle.ts:829` | daily cron / manual Recalculate |
| Stored completeness severity (for health) | `recomputeClientHealth()` `drizzle.ts:830` | same |
| Support / SLA tier | `lib/support/sync.ts:222` | **daily Intercom sync** |
| Referral source | `recomputeClientReferral()` `drizzle.ts:725` | separate call, not the hot path |

**[V]**

This is deliberate and documented — `drizzle.ts:781` explains `recomputeClientHealth` is
"Deliberately NOT called from recomputeClient()'s hot paths" because it makes a live
Metabase-backed call, and putting that on every deal edit risks "the exact 'unbounded op pins
a pooler backend' class of bug this project already spent an audit pass fixing." **[V]**

> **Review point.** Sound engineering, but nothing in the UI tells a CSM which of their edits
> took effect now and which take a day. Change a deal's support level and the account's SLA
> tier does not move until the next Intercom sync.

`recomputeClient()` callers: `drizzle.ts:444` (tracked toggle), `:617`, `:1120`, `:1129` (ARR
event), `:1140`, `:1161` (sync persistence), `lib/data.ts:1089` (profile save). **[V]**

---

## 6. The derived rules, exactly

### ARR
```ts
// lib/repo/drizzle.ts:683
const arr = sum(tracked.map(d => d.amount)) + sum(ledger.map(e => e.amount));
```
where `tracked` = deals with `tracked !== false`, **with CSM amount/contract-start overrides
applied first** (`:666`), and `ledger` = `arr_events` with `source !== "hubspot"` (`:678`).
**[V]**

> ### ⚠ Review point — two ARR definitions, one of which documents itself falsely
>
> `lib/metrics/arr.ts` opens by asserting ARR is *"the running balance of its ArrEvents — **not**
> a value scraped from HubSpot deals with a hardcoded 'active this year' rule."* **[V]**
>
> That is not what writes `clients.arr`. `recomputeClientBody` sums HubSpot deal amounts
> exactly that way. `deriveClientArr()` **is** called during sync (`lib/integrations/sync.ts:456`)
> but its result is a **transient seed** that `recomputeClient()` overwrites immediately — the
> adjacent comment at `sync.ts:478` says so about the neighbouring field. **[V]**
>
> CLAUDE.md states module headers are treated as decision evidence and must be kept true.
> This one is the header a reader would consult to understand ARR, and it is wrong.
>
> **This is the third instance of one-concept-two-definitions in this codebase** — after
> `isOverdue()` (`components/clients/projects/shared.tsx:42`) vs `computeProjectDeadlines()`
> (`lib/projects/deadlines.ts`), and six independent renewal windows (since unified to
> `RENEWAL_WINDOW_DAYS = 120` in `lib/status.ts:50`).

### Renewal date
**Account-level** (`drizzle.ts:695`): latest tracked deal's `contractStartDate`, falling back to
latest `closeDate`, **+ 1 year**. **[V]**

**Deal-level** (`lib/deal-overrides.ts:137`): that deal's `contractStartDate` **+ 1 year**.
**[V]**

> **Review point.** Two implementations of the same +1yr rule at different scopes. Both ignore
> the deal's `contractDuration` ("Contract Length (Years)") field — which the card renders
> immediately beside the computed renewal, labelled "Auto · +1yr". A 3-year contract shows a
> renewal 2 years early, and that date drives account status and the 120-day renewal window.
> **[V]**

### Account status
`computeClientStatus(effectiveDeals, launchDateByDealId, statusOverride, arr)` —
`lib/status.ts`. Fully auto-derived; the only manual input is a churn override
(`STATUS_OVERRIDE_KEY`). Renewal status fires when a tracked deal's renewal date is within
`RENEWAL_WINDOW_DAYS` (120) **and not already past** — overdue is deliberately excluded, see
the header comment at `lib/status.ts:13`. **[V]**

### Profile completeness
`lib/profile-completeness.ts`. Two tiers; yellow is only evaluated once every red field is
filled (`:131`). **Scope rule: a per-deal field is missing if ANY tracked deal lacks it**, and
an account with zero tracked deals is missing every per-deal field by definition (`:14`,
`:116`). **[V]**

12 red fields + 2 conditional library dates + launch + kick-off (`:61-92`); 9 yellow (`:94-104`).
`FIELD_SEVERITY` (`:108`) maps field key → tier and drives the per-field ⚠ icons on the card.
**[V]**

### Support / SLA tier
Highest support level among tracked deals — `resolveAccountSupportLevel()` `lib/sla.ts:100`,
called only from `lib/support/sync.ts:222`. **[V]**

### Onboarding period
`computeOnboardingPeriod()` `lib/metrics/onboarding.ts`. Measured on the tracked deal with the
**latest kick-off**; kick-off→launch once launched, kick-off→today while not. A newer deal
supersedes an older figure; averaging happens **only** on a true tie of identical latest
kick-off dates. **[V]**

---

## 7. Permissions

Server gates are correct: **[V]**
- `PATCH /api/deals/[id]` — `canEditClient` → 403 (`app/api/deals/[id]/route.ts:24`)
- `PATCH /api/clients/[id]` — `canSeeClient` → 404, then `canEditClient` → 403
  (`app/api/clients/[id]/route.ts:65,68`). The comment explains the 404-before-403 ordering is
  deliberate anti-IDOR.

> ### ⚠ Review point — the UI has no write gate at all
>
> `canEditClient` is resolved on the profile (`ClientProfileTabs.tsx:160`) and passed to the
> Stakeholders tab (`:265`) and others (`:281`) — but **`GeneralTab` is called without it**
> (`:272`). `DealsTabs` → `DealCard` → `OverrideField` therefore never see a write gate, and
> `OverrideField` has **no `readOnly` prop** (`:3204`). **[V]**
>
> Consequence: a guest gets fully interactive edit controls on every deal field. The server
> correctly refuses with 403 — **so this is not a security hole** — but combined with the silent
> `catch { revert }` in §4, the value simply snaps back with no message.

---

## 8. Summary of defects for review

Ordered by consequence. All **[V]** unless noted.

1. **`lib/metrics/arr.ts` header contradicts shipped ARR behaviour.** Comment-only fix.
2. **Renewal ignores `contractDuration`**, in two separate implementations. Business-rule
   change; needs a product decision on the intended formula.
3. **No UI write gate** — read-only users get live edit controls that 403 silently.
4. **All four save paths fail silently.**
5. **Two save models in one card**, with the revenue-moving field on the unfamiliar one.
6. **Within-key concurrency**: whole-`__deal_overrides` payload + shallow jsonb merge. **[I]**
7. **"Renewal" tab is a catch-all** for unclassified CS stages, indistinguishable from real
   renewals.
8. **Three freshness horizons are invisible** to the user.
9. **Editing an amount strips formatting** — the input shows bare `24480` while the same value
   displays as `$24,480` elsewhere (`:3204` / `:2178`).
10. **Landing tab varies per account** — first non-empty bucket (`:2616`), so the section opens
    somewhere different on each client.
11. **3,308-line file.** Extraction to `components/clients/deals/` would match the existing
    `projects/`, `stakeholders/`, `notes/` folders.

---

## 9. What I did not verify — please check

- **[?]** Whether the Settings "Full re-sync" action actually clears `__deal_overrides`. I read
  the claim in a code comment (`ClientProfileTabs.tsx:333`), not the implementation.
- **[?]** Runtime behaviour of the within-key concurrency race in §4 — reasoned, not reproduced.
- **[?]** Whether `recomputeClientHealth`'s daily cron is actually scheduled and running in
  production, or only invocable on demand.
- **[?]** Whether any account in production has a non-USD `clients.currency`, which would make
  the account-level currency fields disagree with the hardcoded USD on deal amounts.
  `AddClientDialog.tsx:197` still offers a currency picker.
- **[?]** All line numbers post-date my read; they drift on the first edit.

---

## 10. Context on direction

Separately from this description, seven structural decisions were taken to replace the
underlying object model (Relationship → Term → Deal; Signal owns Terms, HubSpot owns Deals;
terms proposed by the system and confirmed by a CSM; obligations first-class on the Term;
confirmation generates a project; a Contracts tab with terms on their own routes).

That work is **decided, not specified**, and is not reflected anywhere in the code described
above. Prototypes exist at `/scratch-contracts` and `/scratch-deal-card` (dev-only routes,
`notFound()` in production, sample data). **Nothing in this document describes them** — this is
the shipped system only.
