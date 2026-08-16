import "server-only";

/* =========================================================================
   Expansion — the scoped read layer.

   Everything the page renders comes through here, and everything here is
   scoped by `scopeClientsToUser` FIRST. An opportunity is account data: a user
   who cannot see the account must not see its expansion motion, its value or
   even that it exists. Scoping the accounts and then reading opportunities for
   exactly those ids means there is no path where a filter is forgotten — the
   id list is the boundary.

   `today` is resolved ONCE here and passed down, so the header count, the
   cards, the list column and the Action list can never disagree about what day
   it is (they used to be able to: each component calling its own clock is how
   a board reads "3 need attention" above four red cards).
   ========================================================================= */

import { cache } from "react";
import { getCurrentUserEmail, getCurrentUserRole, scopeClientsToUser } from "@/lib/auth";
import { hasDatabase } from "@/lib/config";
import { dbHealthy } from "@/lib/db/health";
import { getClients, getRoleLabels } from "@/lib/data";
import { permissionTier, roleLabel, type Role } from "@/lib/roles";
import { canEditExpansion, canSeeExpansion } from "@/lib/expansion/access";
import { attention, needsAttention, surfacesOnActionList, todayIso, ATTENTION_ORDER } from "@/lib/expansion/attention";
import {
  getAccountPlansDb, getAccountsWithOpenOpportunitiesDb, getOpportunitiesForClientsDb,
  getOpportunityHistoryDb,
} from "@/lib/expansion/repo";
import type {
  ExpansionAccount, ExpansionBoardData, ExpansionPerson, Opportunity, OpportunityDetail,
} from "@/lib/expansion/types";

const EMPTY: ExpansionBoardData = {
  opportunities: [], accounts: [], people: [], me: null, canWrite: false,
  today: todayIso(), unavailable: false,
};

/**
 * The app-user directory, read ONCE per request.
 *
 * Both the name lookup and the owner picker need it, and the profile page and
 * the Action list each ask for a board. Without this cache that is four reads
 * of the same table in one render — and the dev pool is 10 connections, which
 * is precisely how a page ends up queueing past `withDbTimeout` (see the note
 * on getDb in lib/db/client.ts).
 */
const appUserDirectory = cache(async (): Promise<{ email: string; name: string; role: string }[]> => {
  try {
    const { getAppUsersFromDb } = await import("@/lib/repo/drizzle");
    return (await getAppUsersFromDb()).map((u) => ({
      email: u.email.toLowerCase(),
      name: u.name || u.email,
      role: (u.role as string) ?? "operator",
    }));
  } catch {
    return [];
  }
});

/** Display names keyed by lower-cased email — for an owner, a note author and
 *  an activity actor, without a join per row. */
async function userNames(): Promise<Map<string, string>> {
  return new Map((await appUserDirectory()).map((u) => [u.email, u.name]));
}

/**
 * The assignable owners: every app user whose permission tier can write.
 *
 * A `guest` is read-only, so a guest owner would be an owner who cannot act —
 * the picker leaving them out is a CONVENIENCE. The real enforcement is in the
 * server action, which refuses a guest owner regardless of what the client sent.
 */
async function assignablePeople(labels: Record<string, string>): Promise<ExpansionPerson[]> {
  return (await appUserDirectory())
    .map((u) => ({ u, tier: permissionTier(u.role as Role) }))
    .filter(({ tier }) => tier !== "guest")
    .map(({ u, tier }) => ({
      email: u.email,
      name: u.name,
      tier: tier as ExpansionPerson["tier"],
      roleLabel: roleLabel(u.role as Role, labels),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function toAccount(
  c: Awaited<ReturnType<typeof getClients>>[number],
  plans: Map<string, string>,
): ExpansionAccount {
  return {
    id: c.id,
    name: c.name,
    currency: c.currency || "USD",
    arr: c.arr ?? 0,
    plan: plans.get(c.id) || null,
    healthTier: c.health?.tier ?? null,
    healthColor: c.health?.tierColor ?? null,
    healthScore: typeof c.health?.score === "number" ? c.health.score : null,
    since: c.startedAt ?? null,
  };
}

/**
 * Everything the board and list need, scoped to the signed-in user.
 *
 * CACHED PER REQUEST. Four callers derive from this — the board itself, the
 * record overlay, the client-profile card and the Action list — and on a page
 * that uses two of them an uncached read would run the whole thing twice
 * (clients, deals, app users, opportunities, steps, notes) against a 10
 * connection dev pool. Same `cache()` discipline as lib/auth.ts, and for the
 * same reason: correctness of the numbers plus one round-trip, not several.
 */
export const getExpansionBoard = cache(async (): Promise<ExpansionBoardData> => {
  if (!hasDatabase()) return EMPTY;
  const today = todayIso();

  const [clients, email, role] = await Promise.all([
    getClients(), // already role-scoped in lib/data
    getCurrentUserEmail(),
    getCurrentUserRole(),
  ]);

  /* A guest has no access to Expansion AT ALL — not read-only access, none.
     Returning before any opportunity is read is what makes that true rather
     than merely displayed: no pipeline, no amount and no account name reaches
     the response, so there is nothing for a hidden control or a crafted URL to
     reveal. Every other surface (profile card, Action list, Today lane) derives
     from this call, so all four are gated by this one return. */
  if (!canSeeExpansion(role)) return { ...EMPTY, me: email, today };
  // Belt and braces: getClients() scopes, and so do we. The board is the one
  // place a scoping miss would expose a whole account book's commercial plans.
  const visible = await scopeClientsToUser(clients);
  const names = new Map(visible.map((c) => [c.id, c.name]));

  const [labels, directory, plans] = await Promise.all([
    getRoleLabels(), userNames(), getAccountPlansDb([...names.keys()]).catch(() => new Map<string, string>()),
  ]);
  /* A failed read and an empty pipeline produce the same empty array, and the
     page must not confuse them. getClients() swallows a DB failure and returns
     [], so an outage would otherwise render "No expansion opportunities yet" —
     the one lie this page exists to prevent. The breaker (lib/db/health) is the
     app's own answer to "is the database readable right now". */
  let unavailable = hasDatabase() && !dbHealthy();
  let opportunities: Opportunity[] = [];
  let assignable: ExpansionPerson[] = [];
  try {
    [assignable, opportunities] = await Promise.all([
      assignablePeople(labels),
      getOpportunitiesForClientsDb([...names.keys()], names, directory),
    ]);
  } catch (err) {
    console.warn("[expansion] board read failed:", err);
    unavailable = true;
  }

  return {
    opportunities,
    accounts: visible.map((c) => toAccount(c, plans)).sort((a, b) => a.name.localeCompare(b.name)),
    people: assignable,
    me: email,
    // Hiding the controls is courtesy; every action re-checks server-side.
    canWrite: canEditExpansion(role),
    today,
    unavailable,
  };
});

/** Whether the signed-in user may reach Expansion at all. Used by the route to
 *  404 and by the shell to decide whether the nav entry exists. */
export const viewerCanSeeExpansion = cache(async (): Promise<boolean> =>
  canSeeExpansion(await getCurrentUserRole()));

/** The record overlay's extra half: notes and the activity log. Gated on the
 *  same account visibility as the board — an id alone is not access. */
export async function getOpportunityDetail(id: string): Promise<OpportunityDetail | null> {
  if (!hasDatabase()) return null;
  const board = await getExpansionBoard();
  const o = board.opportunities.find((x) => x.id === id);
  if (!o) return null;
  const { notes, history } = await getOpportunityHistoryDb(id, await userNames());
  return { ...o, notes, history };
}

/* ── What the write path needs to know about people ───────────────────────── */

/**
 * The set of emails allowed to own an opportunity — the server-side half of the
 * owner picker.
 *
 * The picker leaving guests out is a courtesy. This is the rule: a guest cannot
 * write, so a guest owner would be an owner who cannot act on their own
 * opportunity, and the promise of the page is that every motion has someone who
 * can. An empty set (directory unreadable) refuses every owner rather than
 * accepting any — the safe direction.
 */
export async function assignableOwnerEmails(): Promise<Set<string>> {
  const labels = await getRoleLabels().catch(() => ({} as Record<string, string>));
  const people = await assignablePeople(labels);
  return new Set(people.map((p) => p.email));
}

/** One person's display name, for an activity line. Falls back to the email. */
export async function ownerNameFor(email: string): Promise<string> {
  const names = await userNames();
  return names.get(email.toLowerCase()) ?? email;
}

/* ── Other surfaces ───────────────────────────────────────────────────────── */

/**
 * One account's opportunities, for the client profile. Scoped through the same
 * board read, so a profile can never show expansion for an account the viewer
 * reached by guessing a URL.
 */
export async function getExpansionForClient(clientId: string): Promise<{
  opportunities: Opportunity[];
  openCount: number;
  openArr: number;
  wonArr: number;
  needsAttentionCount: number;
  today: string;
}> {
  const board = await getExpansionBoard();
  const mine = board.opportunities.filter((o) => o.clientId === clientId);
  const open = mine.filter((o) => o.outcome === null);
  return {
    opportunities: mine,
    openCount: open.length,
    openArr: open.reduce((s, o) => s + (o.expectedArr ?? 0), 0),
    wonArr: mine.filter((o) => o.outcome === "won").reduce((s, o) => s + (o.finalArr ?? 0), 0),
    // The one definition, again. Not a second count.
    needsAttentionCount: open.filter((o) => needsAttention(o, board.today)).length,
    today: board.today,
  };
}

/**
 * The opportunities that belong on Today / the Action list.
 *
 * Reads `attention()` — it does NOT re-implement the rule. The Action list and
 * the board's count are the same five opportunities or the page is lying.
 *
 * WHO SEES WHAT. Two groups, and the second is the whole point:
 *
 *   1. Opportunities you OWN. The Action list is a personal work queue — an
 *      admin who can see all 132 accounts does not want every CSM's overdue
 *      step on their own list.
 *   2. Opportunities NOBODY owns, on an account you can see. An owner-only
 *      filter drops these onto no list at all, which is exactly the failure
 *      the page exists to prevent: "no credible expansion motion should be
 *      invisible, OWNERLESS, or without a next step". An unowned motion is the
 *      most urgent case, not the one to hide — so it goes to everyone who
 *      could pick it up, until someone does.
 *
 * Ordered by the same precedence the board uses, so the top of this list is the
 * top of that board.
 */
export async function getExpansionActionItems(): Promise<{
  items: { opportunity: Opportunity; state: string; line: string }[];
  today: string;
}> {
  const board = await getExpansionBoard();
  const me = board.me?.toLowerCase() ?? null;
  const items = board.opportunities
    .filter((o) => o.outcome === null)
    .filter((o) => {
      const owner = o.ownerEmail?.toLowerCase() ?? null;
      return owner === null || !me || owner === me;
    })
    .map((o) => ({ o, a: attention(o, board.today) }))
    /* The brief's rule for this surface is FOUR cases: overdue, due today, no
       next step, or untouched for 14 days. `a.needs` is only the first, third
       and fourth — it deliberately excludes due_soon, which is right for the
       board (a step due in three days is not a problem) and wrong here (a step
       due TODAY is exactly what a daily work list is for).

       surfacesOnActionList() is that rule, and it reads attention() rather than
       restating it. Filtering on `a.needs` here was a fifth place quietly
       deciding what "needs attention" means. */
    .filter(({ o }) => surfacesOnActionList(o, board.today))
    .sort((x, y) => ATTENTION_ORDER.indexOf(x.a.state) - ATTENTION_ORDER.indexOf(y.a.state))
    .map(({ o, a }) => ({ opportunity: o, state: a.state, line: a.label }));
  return { items, today: board.today };
}

/**
 * Which of these accounts have an OPEN expansion motion — a set of ids, never
 * the amounts. Used to suppress Today's derived "this account might expand"
 * signal for an account that already has a recorded opportunity.
 *
 * Gated like every other read here. A guest gets an empty set, which is the
 * right answer for them twice over: they must learn nothing about the pipeline,
 * and they should still see the ordinary expansion SIGNALS on their board,
 * which an unguarded set would have silently suppressed.
 */
export async function getAccountsWithOpenExpansion(clientIds: string[]): Promise<Set<string>> {
  if (!hasDatabase() || !clientIds.length) return new Set();
  if (!canSeeExpansion(await getCurrentUserRole())) return new Set();
  try {
    return await getAccountsWithOpenOpportunitiesDb(clientIds);
  } catch {
    return new Set();
  }
}
