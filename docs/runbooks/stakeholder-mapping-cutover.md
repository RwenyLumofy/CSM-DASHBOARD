# Runbook — stakeholder mapping cutover

Migrating the retired Communication → Stakeholder Mapping matrix into stakeholder
profiles, in production.

**Status: not yet run in production.** The code is deployed as of `9d83a22`.
Every figure below is from the production clone.

---

## What is already true in production

The application code shipped ahead of the data, which is deliberate but has a
visible consequence until step 3 completes:

- The legacy Stakeholder Mapping sub-tab is **gone**, and its write path is
  deleted — nothing can create a new legacy mapping.
- The Stakeholders tab, Health, and the Action List all read
  `stakeholder_profiles`, which on the 31 affected accounts is currently
  **empty**.
- `clients.properties.stakeholder_mappings` is **untouched**. No data has been
  lost; it simply has not been migrated yet.

So those 31 accounts currently read "No stakeholders mapped" and will start
raising missing-critical-role signals once actions regenerate. That is the
window this runbook closes.

Health is unaffected either way: with no profiles the roster derivation returns
all-null and the CS Pulse answers behave exactly as they did before.

---

## Preconditions

1. `9d83a22` or later is deployed.
2. You have a database URL for production and know which one it is. **Both
   scripts read `DATABASE_URL` from `.env.local`** — pointing them at production
   is a deliberate act, not a flag.
3. A database backup or point-in-time-restore window covering the run.
4. Nobody is mid-edit on the Stakeholders tab. Runtime is seconds, so a quiet
   moment is enough; there is no maintenance window needed.

---

## Step 1 — Dry run

```bash
npx tsx scripts/migrate-stakeholder-mappings.mjs
```

Writes nothing. Expected, matching the clone:

```
 31  clients with legacy mappings
 79  profiles created
  0  existing profiles reconciled
107  role associations preserved
  0  exceptions for review
  0  clients that failed
```

**Stop and investigate if:**

- `exceptions` is non-zero — read them; each carries a recommended resolution.
  The usual causes are a legacy role with no equivalent in `STAKEHOLDER_ROLES`,
  or a mapping pointing at a contact that has since been deleted.
- `existing profiles reconciled` is non-zero — somebody has created stakeholders
  by hand since the clone was taken. That is fine and supported, but it narrows
  the rollback (see below), so decide knowingly.
- The client count is far from 31 — you may be pointed at the wrong database.

Capture the exception report for the record:

```bash
npx tsx scripts/migrate-stakeholder-mappings.mjs --exceptions=stakeholder-exceptions.json
```

---

## Step 2 — Apply

```bash
npx tsx scripts/migrate-stakeholder-mappings.mjs --apply
```

Each account is written in a single statement, so a mid-run failure cannot leave
one account holding half a migration. Failed accounts are listed and the script
exits non-zero; it is safe to re-run.

**Verify idempotency immediately** — run the same command again. It must report
`0 created`, `79 already migrated, untouched`, and still `107 role associations
preserved`:

```bash
npx tsx scripts/migrate-stakeholder-mappings.mjs --apply
```

---

## Step 3 — Refresh the derived layers

Neither is automatic; both are needed before the UI tells the truth.

1. **Actions** — regenerate, so "No stakeholders mapped" clears and the
   missing-critical-role signals reflect the migrated roles. The daily cron does
   this, or use the Regenerate button per account.
2. **Health** — recompute. Settings → Client health → Save, or the 09:00 cron.

---

## Step 4 — Verify

- Open two or three of the 31 accounts. The Stakeholders tab should list the
  migrated people with their roles, every graded field reading **Not assessed**,
  and no relationship-map connections. That is correct: the matrix held no
  evidence for any of it.
- Communication still shows **Emails, Meetings, Contacts** and no Stakeholder
  Mapping.
- Spot-check an account that had a person in several legacy roles — GCCIA and
  MEWA both have one — and confirm it is **one person with several roles**, not
  several people.
- Confirm no account's Health status moved for a reason you cannot explain.

### The known gap in this step

`scripts/stakeholder-health-impact.mjs` compares scores with and without the
roster, but it scores with `usage` and `support` null, so most accounts land
Not Assessed in both arms and never reach the rules the stakeholder facts feed.
**Its "0 changed" result is not evidence of no impact.** A trustworthy
before/after needs the real recompute path, which needs `METABASE_URL`. Until
that is run, treat health impact as unmeasured.

---

## Rollback

```bash
npx tsx scripts/rollback-stakeholder-migration.mjs          # dry run
npx tsx scripts/rollback-stakeholder-migration.mjs --apply
```

Removes only profiles carrying `source: "migration"`. Anything created by hand
is kept, and `stakeholder_mappings` is never modified — so the legacy matrix
remains the source it was migrated from, and the backfill can simply be re-run.

Verified on the clone: 79 removed, then re-migrated to 79 with all 107 role
associations preserved.

**The rollback narrows over time.** A profile the backfill *reconciled* — one
that already existed and had legacy roles merged in — cannot be cleanly
reversed: deleting it destroys somebody's work, and once merged, nothing
distinguishes a role the migration added from one a CSM added afterwards. Those
are reported for manual reversal. Today that count is zero, which is what makes
the rollback exact. Every profile created by hand after the migration reduces
that guarantee, so the practical rollback window is short.

Dropping `stakeholder_mappings` is a **separate, explicitly reviewed change**
and should not happen until this cutover is formally accepted.

---

## Acceptance

- [ ] 107 role associations accounted for — migrated, reconciled, or documented
- [ ] Zero unexplained exceptions
- [ ] Re-run reports zero created
- [ ] Stakeholders tab shows migrated people under the right accounts
- [ ] Multi-role people appear once, with all their roles
- [ ] Emails, Meetings and Contacts still work
- [ ] Missing-role signals reflect the migrated roles
- [ ] Health before/after produced **with usage data** and every difference explained
- [ ] `stakeholder_mappings` retained as rollback evidence

Only after all of these: schedule the separate migration that drops the legacy
key.
