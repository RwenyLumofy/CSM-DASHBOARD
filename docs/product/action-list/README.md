# Action list

**Status:** Partially verified

## Summary

A generated feed of next steps across the accounts a user can see — produced daily by a
deterministic signal engine, optionally reworded by Gemini, and reconciled against what the
user has already dismissed or completed.

## Purpose

Turns account facts into specific work. It answers "what should I actually do about these
accounts", where Today answers "what should I look at".

## Intended users

Operators. Admins and Super Admins see the whole book's actions. Guests can view but not
create or change actions (`permissionCapabilities` in `lib/roles.ts`).

## Entry points

- **Route:** `/inbox`
- **Navigation path:** Sidebar → Action list
- **Also:** the notifications bell links here
  (`components/layout/NotificationsBell.tsx:143`), and the Client Profile's "Action list"
  tab shows the same rows filtered to one account.

## Information architecture

A single filterable feed (`components/actions/ActionFeed.tsx`, `mode="global"`), max-width
constrained. Each item carries: category · priority · title · insight · source · account.

## Primary workflows

### Generation (system, not user)
1. **Trigger** — `/api/cron/client-actions` daily at `0 8 * * *`, or a "Regenerate" button.
2. **Preconditions** — `CRON_SECRET` present (a missing secret is a **503 in production**,
   not a bypass); a configured database.
3. **System behaviour**, per client
   ([`lib/actions/generate.ts`](../../../lib/actions/generate.ts)):
   1. Assemble inputs — client, tracked deals, deal dates, usage, contacts, stakeholder
      mappings, project deadlines.
   2. `detectSignals(inputs)` — a **pure** function returning the signals currently true.
   3. `enrichSignals()` — Gemini rewrites the wording; without `GEMINI_API_KEY` the
      deterministic template text is used verbatim.
   4. Reconcile against the database: insert new, refresh open, **auto-resolve cleared**,
      **respect dismissed**.
4. **Result** — `client_actions` rows reflect the current state of each account.
5. **Failure** — a per-client failure is bounded; usage fetch failures degrade to a
   skipped signal, not a crash. Concurrency is capped (`mapLimit`) so a ~74-account sweep
   does not fan out unbounded.

### Act on an item
1. **Trigger** — complete, dismiss, or open the account.
2. **Preconditions** — not a Guest; the account is in scope.
3. **System behaviour** — writes via `app/(app)/inbox/actions.ts` /
   `client-actions.ts`.
4. **Result** — the item leaves the feed.
5. **Exception** — **dismissal is sticky forever.** `reconcileClientActionsDb` explicitly
   respects a dismissal across regenerations. This is a known trade-off: it also buries a
   signal that legitimately recurs next quarter (named in
   [`lib/today/triage.ts`](../../../lib/today/triage.ts), which chose the opposite
   behaviour for Today priorities).

## The signal rules

From [`lib/actions/signals.ts`](../../../lib/actions/signals.ts). This is the definitive
list of what Signal will ever put in the Action list today.

| # | Category | Condition | Priority |
|---|---|---|---|
| 1 | `incomplete_profile` | One action per missing **red** (must-have) field | high |
| 1 | `incomplete_profile` | One action per missing **yellow** field — **only once every red field is filled** | low |
| 2 | usage | `mau === 0` (dormant this month), or no logins this week | — |
| 5 | health | Health score at-risk (`< 55`) or watch (`55–74`) | — |
| 6a | stakeholders | No stakeholders identified in the mapping | — |
| 4 | sentiment | Low/high NPS or CSAT — **dormant scaffolding**; `csat`/`nps` are null for every client until a sentiment source is wired | — |
| 3 | projects | **Not implemented** — arrives with the feature | — |
| 6b | stakeholder engagement | **Not implemented** | — |

Sentiment thresholds are the feature's own defaults, not a codebase convention:
`CSAT_LOW 60` · `CSAT_HIGH 90` · `NPS_LOW 0` · `NPS_HIGH 50`.

Usage signals fire **only** when `usage.status === "ok"` — an unavailable or unlinked
account is skipped rather than flagged as "no usage". That distinction matters: absence of
data is not evidence of dormancy.

## Fields and data

| Field | Meaning | Source |
|---|---|---|
| `category` | `ActionCategory` — the signal family | `lib/types.ts` |
| `signalKey` | Unique within (client, category); part of the stable action id | `signals.ts` |
| `priority` | high / medium / low | `signals.ts` |
| `title`, `insight` | Wording — template, or Gemini-rewritten | `signals.ts` / `enrich.ts` |
| `source` | What produced it | `client_actions` |
| `clientId`, `clientName` | The account | `clients` |

Stable ids mean a re-run refreshes an existing item rather than duplicating it.

## States and statuses

Open · completed · dismissed · auto-resolved (the underlying signal cleared).

## Business rules

- **A signal is not a task.** These items are generated observations with suggested
  actions. They are not `today_tasks` and not `project_tasks`, and nothing promotes one
  into the other automatically.
- **Deterministic detection, cosmetic AI.** Gemini changes *wording only*. It never decides
  what is flagged. Without a key, the feed is fully functional.
- **Red gates yellow** for profile completeness, matching the completeness rule itself.
- **Dismissal survives regeneration.**

## Permissions

- **View:** everyone; scoped by `getMyClientActions()`, which inherits client scoping.
- **Complete / dismiss / regenerate:** not Guest.
- **Server-side enforcement:** through the scoped data reads and the write gate in
  `app/(app)/inbox/*-actions.ts`.

## Automations and side effects

The generating job also calls `syncProjectDeadlineNotifications()`, isolated so an
action-generation success is not lost if the notification step fails
([`app/api/cron/client-actions/route.ts`](../../../app/api/cron/client-actions/route.ts)).

Cron ordering is deliberate: sync (`0 6`) → profile-completeness (`0 7`) →
client-actions (`0 8`) → client-health (`0 9`). Actions therefore read *that day's* fresh
deal and completeness data — but **health used by the signal engine is the previous day's**,
because health recomputes an hour later.

## Empty, loading and error states

An account with no true signals produces no items. There is no distinction in the UI
between "nothing to do" and "generation has never run".

## Data model

`client_actions` (`lib/db/schema.ts:458`). Reads `clients`, `client_deals`,
`client_usage_*`, `client_contacts`, `clients.properties.stakeholder_mappings`,
`client_projects`/`project_tasks`.

## Technical implementation

| Concern | File |
|---|---|
| Page | [`app/(app)/inbox/page.tsx`](../../../app/%28app%29/inbox/page.tsx) |
| Feed UI | `components/actions/ActionFeed.tsx` |
| Signal rules (pure) | [`lib/actions/signals.ts`](../../../lib/actions/signals.ts) |
| Orchestration | [`lib/actions/generate.ts`](../../../lib/actions/generate.ts) |
| AI wording | `lib/actions/enrich.ts`, `lib/integrations/gemini.ts` |
| Job | `app/api/cron/client-actions/route.ts` |
| Actions | `app/(app)/inbox/actions.ts`, `client-actions.ts` |
| Reconciliation | `reconcileClientActionsDb` in `lib/repo/drizzle.ts` |

## Analytics and observability

The job returns a summary (`clients`, `actionsUpserted`, `durationMs`, `ai`) in its HTTP
response. It is not persisted or monitored — the only way to see it is to call the
endpoint. No product analytics events.

## Dependencies

Profile completeness · usage (Metabase) · health · stakeholder mappings · project
deadlines · Gemini (optional).

## Known limitations

1. **Health input lags by a day** because of cron ordering.
2. **Sentiment signals never fire** — `csat` and `nps` are null for every client.
3. **Project and stakeholder-engagement signals are unimplemented.**
4. **Dismissal is permanent**, with no expiry and no way to un-dismiss from the UI that
   this pass confirmed.
5. **Regeneration cost** — one Gemini call per client per run when the key is set.
6. **No test coverage** of the signal rules, despite them being pure functions and the
   easiest thing in the codebase to test.

## Open questions

- Should dismissal expire, as Today's snooze does? The two systems chose opposite answers
  and neither is documented as the intended product behaviour.
- Is the sentiment scaffolding waiting on a specific source, or abandoned?

## Source references

`lib/actions/signals.ts` · `lib/actions/generate.ts` · `app/(app)/inbox/page.tsx` ·
`app/api/cron/client-actions/route.ts` · `lib/today/triage.ts` · `lib/profile-completeness.ts`

---

**Documentation status:** Partially verified — signal rules read end to end, no tests exist
**Last verified:** 2026-07-31 · **Commit:** `4214349` · **Owner:** Unassigned
