# Handoff — two production issues, 2026-08-27

Self-contained brief. You do not need the conversation this came from.

**Everything below was found by reading code and Vercel logs. Nothing was
verified against the production database — no access from that session.** Each
issue therefore leads with the check that settles it, not with a fix. Do the
check first. If it comes back clean, stop and say so; do not implement the fix
on the strength of this document alone.

Priority order: **Issue 1 blocks the team today. Issue 2 may be inflating the
headline revenue number.** Both matter; 1 is more urgent, 2 is more serious.

---

## Issue 1 — Team members cannot save; profile pages are very slow

### Symptom
Two named users (Zainab, Sakeena) repeatedly failed to save **notes** and **use
cases** on client profiles. Separately reported: "the pages are too laggy."

### Verified

- Notes and use cases share **exactly one** dependency: `denyClientWrite()`
  ([`lib/auth.ts:210`](../lib/auth.ts)). Different tables, different helpers,
  different validation. Two features failing together through one shared gate.
- `denyClientWrite` → `canEditClient` → denies on: role `guest`, **role `null`**,
  scope `none`, or scope not admitting the account.
- Vercel production, 48h window: **zero 500s** (909×200, 26×307, 22×404, 1×403).
  A permission denial returns `{ ok: false, error }` at **HTTP 200**, so it is
  invisible in status codes. The absence of errors is not evidence of health.
- One error group only: `Vercel Runtime Timeout Error: Task timed out after 300
  seconds`, route `/clients/[id].rsc`, count 2, users 1, last 2026-08-26 09:37Z.
- `getCurrentUserEmail()` ([`lib/auth.ts:11`](../lib/auth.ts)) has a fast path
  reading `email` off the session JWT, **conditional on a custom Clerk claim
  being configured**. Without it, every call is a live Clerk Backend API request,
  raced against a 6s timeout and **retried twice** — up to 12s before any query
  runs. Its own comment: *"previously EVERY page paid a live round-trip to
  Clerk's Backend API before anything else could render."*
- `canEditClient`, `getCurrentUserEmail`, `getCurrentUserRole`, `isSuperAdmin`
  and `isAdminOrSuper` all resolve through that lookup. Every server action calls
  it via `denyClientWrite`.
- The profile page runs a sequential preamble, then **22 queries in one
  `Promise.all`** ([`app/(app)/clients/[id]/page.tsx:92`](app/(app)/clients/[id]/page.tsx)),
  then a sequential tail.

### Hypothesis
One cause, both symptoms. If the Clerk `email` session claim is not configured,
every page load and every save blocks on a live Clerk call. Slow → laggy pages.
Times out → `getCurrentUserEmail()` returns null → role resolves to null →
`canEditClient` returns false → **save denied with a permission message the user
has every right to be confused by.** It hits some users and not others because it
depends on when their session token was issued.

### The check — do this first
1. Clerk Dashboard → **Sessions → Customize session token**. Is this present?
   ```json
   {"email": "{{user.primary_email_address}}"}
   ```
2. If missing, add it, then have both users **sign out and back in** — tokens
   issued before the claim was added do not carry it and keep taking the slow path.
3. Ask either user for the **exact error text**. It discriminates:
   - "You don't have permission to edit this account." → role or scope
   - "Not found, or you don't have access to this account." → scope or visibility
   - **Nothing at all** → not this gate; look at the client-side action instead.
4. Confirm both users' `role` and `scope` in `app_users` (Settings → users).
   Modes are `all` / `assigned` / `selected` / `none`.

### If the check is clean
Then it is role/scope data, not latency — fix the data, not the code.

### Secondary, worth doing regardless
22 concurrent queries can exhaust a Supabase pooler connection limit, adding
queueing on top of everything above. Rule out Clerk first — one config field
versus a refactor.

### Do not
Do not widen `canEditClient` or add a fallback role to "fix" the denial. A null
role currently fails closed, which is correct. Making it fail open would hand
edit rights to guests.

---

## Issue 2 — Portfolio ARR may be inflated by stacked renewals

### Symptom
None reported. Found while tracing how the clients page computes total ARR. **No
one has complained, which is what makes this worth checking.**

### Verified

- Clients page total is a plain sum:
  ```ts
  // components/clients/ClientsTable.tsx:391
  const totalArr = useMemo(() => filtered.reduce((sum, c) => sum + c.arr, 0), [filtered]);
  ```
- `client.arr` is **derived, not stored input**:
  HubSpot deals → `arr_events` → `deriveClientArr(events)` → `client.arr`
  ([`lib/integrations/sync.ts:457`](../lib/integrations/sync.ts)).
- `arr_events.amount` is documented as a **signed delta**. `ArrEventType` is
  `new_business | renewal | expansion | contraction | churn | reactivation`, and
  the type comment states *"renewal can be ±"*.
- **The sync emits only `new_business`, with the full deal amount, and never
  computes a delta** ([`lib/integrations/sync.ts:411`](../lib/integrations/sync.ts)):
  ```ts
  /** One `new_business` ledger event per Closed Won deal (deduped by deal id). */
  const events = co.wonDeals.map((d) => ({
    type: "new_business",
    amount: d.amount,      // full deal value
    externalId: d.id,
  }));
  ```
- `deriveClientArr` accumulates: `bal = Math.max(0, bal + e.amount)`.
- Dedupe is by **deal id**, so a new deal id is always additive.

### Hypothesis
If renewals exist in HubSpot as **separate deal records**, each renewal adds its
full value again:

| Event | Booked | Running ARR |
|---|---|---|
| Initial contract 100k | +100k | 100k |
| Renewal 100k | +100k | **200k** |
| Renewal 100k | +100k | **300k** |

That is cumulative lifetime bookings, not ARR. A flat renewal should book `0`.
The portfolio total would be inflated **most by the accounts retained longest**.

Two signals suggest renewals *are* separate records: `Deal` has a bucket
classification where `"renewal" = direct/indirect Closed Won + CS Renewed`, and
`externalId` exists specifically for *"new_business dedupe"* — which only matters
if multiple deals per client are expected.

If your team renews by **editing the original deal**, the id is stable, dedupe
holds, and the number is correct.

### The check — read-only, settles it
For accounts more than a year old, compare `client.arr` against the **largest
single tracked deal amount** for that account. If ARR is roughly an integer
multiple of it, renewals are stacking. Long-tenured accounts show it most
starkly — a five-year customer would read at roughly 5× true ARR.

Also worth confirming what stage filter populates `co.wonDeals`, and whether it
includes the CS pipeline's `Renewed` stage.

### If confirmed
Booking renewals correctly means emitting a `renewal` event whose amount is the
**difference** against prior ARR, not the contract value. That is a change to
`buildHubspotEvents` **plus a backfill of `arr_events`**, and it will move the
headline revenue number. Treat as a product/finance decision, not a bug fix —
run `signal-product-manager` and `signal-product-data-analyst` before touching it.

### Do not
Do not auto-correct `client.arr` to match deals. `arr_events.source` allows
`manual` and `import`, and those are deliberate human adjustments. A job that
overwrites them destroys real data. **Flag, never fix.**

---

## Also found, not urgent

**Latent currency bug.** `components/clients/ClientsTable.tsx:390` sets
`arrCurrency = clients[0]?.currency ?? "USD"` and labels the whole total with the
first client's currency, while summing `c.arr` across all of them regardless.
Harmless **today** — `clients.currency` defaults to `USD`, the sync hardcodes
`currency: "USD"` ([`lib/integrations/sync.ts:490`](../lib/integrations/sync.ts)),
and `lib/db/schema.ts:670` records that all 132 accounts were verified USD on
2026-08-16. It activates the day a non-USD account is onboarded, and the total
would then also shift with sort order. Already documented in the schema comment.

**Suggested first deliverable for Issue 2:** a read-only script in `scripts/`
(the repo has 56 precedents) that prints, per account, deal-derived ARR vs
`client.arr` with the delta, and flags four divergence classes — orphaned
`hubspot` events whose `externalId` matches no tracked deal; tracked won deals
with no event; amount drift; and `manual`/`import` events as a share of total.
No migration, no UI, no product decision, and it answers "is the number right"
in one run.

**Unverified, worth a look:** `arr_events.arr` stores a *running balance*. A
backdated or out-of-order event invalidates every stored balance after it.
Confirm `deriveClientArr` recomputes the chain rather than trusting stored
values — if it trusts them, one backdated event silently corrupts that account's
ARR from that date forward.
