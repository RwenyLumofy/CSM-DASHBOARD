/* =========================================================================
   Today page — repository facade (store-based). The UI's only data source.

   It reads from an injected TodaySnapshot (real, permission-scoped data built
   server-side — see build.ts — or the mock snapshot in dev). `initTodayStore`
   is called once by TodayWorkspace before children render. Function signatures
   are unchanged from the mock era, so components didn't need edits; swapping
   the snapshot source is the whole integration point.
   ========================================================================= */

import type {
  Account, User, SignalPage, Signal, Commitment, Action,
  Priority, ChangeFeedItem, PortfolioSummary,
  PortfolioScope, MentionRef, MentionEntity, TimelineFilter, TimelineEvent,
  ComparisonBasis, ComparisonDelta, DataFreshness, TodaySnapshot, TodayViewer, TodayNotification,
  LaneKey, LaneItem, TodayTask, StatusOverview,
} from "./types";

/* --------------------------------------------------------------- store */

const EMPTY_METRIC = { status: "loading" as const, value: null, formatted: "—" };
const EMPTY_SUMMARY: PortfolioSummary = {
  needsAttention: EMPTY_METRIC, arrExposed: EMPTY_METRIC, renewing90: EMPTY_METRIC, expansionReady: EMPTY_METRIC,
};

let store: TodaySnapshot = {
  today: new Date().toISOString().slice(0, 10),
  viewer: { userId: "", name: "", email: "", role: "operator", canSeeAll: false, teamUserIds: [] },
  accounts: [], users: [], pages: [], signals: [], commitments: [], actions: [],
  priorities: [], changes: [], patterns: [], summary: EMPTY_SUMMARY, workCounts: { overdue: 0, dueToday: 0, awaitingInternal: 0, awaitingCustomer: 0 },
  notifications: [],
  laneSeeds: { derisking: [], projects: [], escalations: [], expansion: [], stakeholders: [] },
  tasks: [], statusByAccount: {}, projectRefs: [],
};

/** Initialise the client store from a server-built snapshot. Idempotent. */
export function initTodayStore(snapshot: TodaySnapshot): void { store = snapshot; }

const mapOf = <T extends { id: string }>(arr: T[]) => { const m = new Map<string, T>(); for (const x of arr) m.set(x.id, x); return m; };

/* --------------------------------------------------------------- lookups */

export const getToday = (): string => store.today;
export const getUsers = (): User[] => store.users;
export const getViewer = (): TodayViewer => store.viewer;
export const getViewerUser = (): User | undefined => store.users.find((u) => u.id === store.viewer.userId);
export const getAccount = (id: string): Account | undefined => mapOf(store.accounts).get(id);
export const getUser = (id: string): User | undefined => mapOf(store.users).get(id);
export const getPage = (id: string): SignalPage | undefined => mapOf(store.pages).get(id);
export const getSignal = (id: string): Signal | undefined => mapOf(store.signals).get(id);
export const getCommitment = (id: string): Commitment | undefined => mapOf(store.commitments).get(id);
export const getAction = (id: string): Action | undefined => mapOf(store.actions).get(id);
export const getNotifications = (): TodayNotification[] => store.notifications;

/* ------------------------------------------------------------ scope */

/** Optional drill-in: narrow to a single owner's (CSM's) book. Admins only —
 *  it can only NARROW the already-permitted set, never widen it. */
let activeOwner: string | null = null;
export function setOwnerFilter(userId: string | null): void { activeOwner = userId; }

/** Account ids visible under the selected scope. The store already contains
 *  ONLY the permitted set (server-scoped), so this can only narrow, never
 *  widen — authorisation is never "hide the UI". */
function visibleAccountIds(scope: PortfolioScope): Set<string> {
  let ids: Set<string>;
  if (scope === "company") ids = new Set(store.accounts.map((a) => a.id));
  else if (scope === "my_team") {
    const team = new Set(store.viewer.teamUserIds);
    ids = new Set(store.accounts.filter((a) => team.has(a.csmUserId)).map((a) => a.id));
  } else ids = new Set(store.accounts.filter((a) => a.csmUserId === store.viewer.userId).map((a) => a.id));

  if (activeOwner) {
    const owned = new Set(store.accounts.filter((a) => a.csmUserId === activeOwner).map((a) => a.id));
    ids = new Set([...ids].filter((id) => owned.has(id)));
  }
  return ids;
}

/** CSMs (owners) the current user may drill into — those who actually own
 *  accounts in the visible set. Empty for a non-admin (nothing to drill). */
export function getOwners(): User[] {
  const ownerIds = new Set(store.accounts.map((a) => a.csmUserId));
  return store.users.filter((u) => ownerIds.has(u.id) && u.id !== "unassigned").sort((a, b) => a.name.localeCompare(b.name));
}

/** At-a-glance summary of the accounts in the current scope — powers the
 *  "healthy / quiet book" state when nothing needs focus. */
export function getScopeOverview(scope: PortfolioScope): {
  accountCount: number; totalArr: number;
  nextRenewal: { accountId: string; name: string; date: string; days: number } | null;
} {
  const visible = visibleAccountIds(scope);
  const accts = store.accounts.filter((a) => visible.has(a.id));
  const upcoming = accts
    .filter((a) => a.renewalDate && a.renewalDate >= store.today)
    .sort((a, b) => (a.renewalDate ?? "").localeCompare(b.renewalDate ?? ""));
  const next = upcoming[0];
  const days = next?.renewalDate ? Math.round((new Date(`${next.renewalDate.slice(0, 10)}T00:00:00Z`).getTime() - new Date(`${store.today}T00:00:00Z`).getTime()) / 86_400_000) : 0;
  return {
    accountCount: accts.length,
    totalArr: accts.reduce((s, a) => s + a.arr, 0),
    nextRenewal: next && next.renewalDate ? { accountId: next.id, name: next.name, date: next.renewalDate, days } : null,
  };
}

/* ----------------------------------------------------------- pulse */

/** Scope-consistent portfolio metrics. Every figure is computed from the SAME
 *  scope-filtered population so exposure/attention numbers reconcile.
 *  "ARR requiring attention" = ARR of accounts currently banded at-risk. */
export interface Pulse {
  arrOwned: number; accountCount: number;
  arrAttention: number; attentionCount: number;
  renew90Arr: number; renew90Count: number; renew90PctOfArr: number;
  dueCount: number; overdueCount: number;
  /** Honest data-coverage: accounts with a real health band ÷ total in scope.
   *  Accounts absent from statusByAccount are genuinely un-scored, never healthy. */
  healthScored: number; healthTotal: number;
}
export function getPulse(scope: PortfolioScope): Pulse {
  const visible = visibleAccountIds(scope);
  const accts = store.accounts.filter((a) => visible.has(a.id));
  const today = store.today;
  const cutoff = new Date(`${today.slice(0, 10)}T00:00:00Z`).getTime() + 90 * 86_400_000;
  let arrOwned = 0, arrAttention = 0, attentionCount = 0, renew90Arr = 0, renew90Count = 0, healthScored = 0;
  for (const a of accts) {
    arrOwned += a.arr;
    if (store.statusByAccount[a.id] !== undefined) healthScored++;
    if (store.statusByAccount[a.id] === "atrisk") { attentionCount++; arrAttention += a.arr; }
    if (a.renewalDate && a.renewalDate >= today && new Date(`${a.renewalDate.slice(0, 10)}T00:00:00Z`).getTime() <= cutoff) { renew90Count++; renew90Arr += a.arr; }
  }
  let dueCount = 0, overdueCount = 0;
  for (const act of store.actions) {
    if (!visible.has(act.accountId) || act.state === "completed" || act.state === "dismissed" || !act.dueDate) continue;
    if (act.dueDate < today) overdueCount++;
    else if (act.dueDate.slice(0, 10) === today.slice(0, 10)) dueCount++;
  }
  return { arrOwned, accountCount: accts.length, arrAttention, attentionCount, renew90Arr, renew90Count, renew90PctOfArr: arrOwned ? Math.round((renew90Arr / arrOwned) * 100) : 0, dueCount, overdueCount, healthScored, healthTotal: accts.length };
}

/** The DISTINCT work objects attached to an account, so a single Focus entry can
 *  name them without blurring signal / task / escalation together (spec §12).
 *  We surface an escalation only when a real commitment is overdue / needs
 *  escalation, and count genuinely overdue tasks — never invent a "plan". */
export interface FocusRelated { escalationOpen: boolean; overdueTasks: number; openTasks: number }
export function getFocusRelated(accountId: string): FocusRelated {
  const today = store.today;
  const escalationOpen = store.commitments.some((c) => c.accountId === accountId && (c.status === "overdue" || c.status === "escalation_required"));
  let overdueTasks = 0, openTasks = 0;
  for (const a of store.actions) {
    if (a.accountId !== accountId || a.state === "completed" || a.state === "dismissed") continue;
    openTasks++;
    if (a.dueDate && a.dueDate < today) overdueTasks++;
  }
  return { escalationOpen, overdueTasks, openTasks };
}

/* ------------------------------------------------------------- upcoming */

/** Time-ordered commitments for the agenda rail: tasks due and renewal dates
 *  in scope, grouped Today / This week / Next 30 days. A different axis to
 *  Focus now (which is by priority) — same objects, ordered by when. */
export interface UpcomingItem { id: string; title: string; sub: string; date: string; kind: "task" | "renewal"; accountId?: string; tone?: "danger" | "warning" | "neutral" }
export interface Upcoming { today: UpcomingItem[]; week: UpcomingItem[]; month: UpcomingItem[] }
export function getUpcoming(scope: PortfolioScope, tasks: TodayTask[]): Upcoming {
  const visible = visibleAccountIds(scope);
  const me = store.viewer.userId;
  const today = store.today;
  const ms = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00Z`).getTime();
  const d0 = ms(today);
  const DAY = 86_400_000;
  const acc = mapOf(store.accounts);
  const items: UpcomingItem[] = [];
  for (const t of tasks) {
    if (!t.dueDate || t.status === "done") continue;
    if (t.accountId ? !visible.has(t.accountId) : t.ownerEmail !== me) continue;
    items.push({ id: `t_${t.id}`, title: t.title, sub: t.accountId ? (acc.get(t.accountId)?.name ?? "Account") : "Personal task", date: t.dueDate, kind: "task", accountId: t.accountId ?? undefined, tone: t.dueDate < today ? "danger" : undefined });
  }
  for (const a of store.accounts) {
    if (!visible.has(a.id) || !a.renewalDate || ms(a.renewalDate) > d0 + 30 * DAY) continue;
    items.push({ id: `r_${a.id}`, title: `${a.name} renewal`, sub: "Renewal", date: a.renewalDate, kind: "renewal", accountId: a.id, tone: a.renewalDate < today ? "danger" : ms(a.renewalDate) <= d0 + 7 * DAY ? "warning" : undefined });
  }
  const out: Upcoming = { today: [], week: [], month: [] };
  for (const it of items.sort((a, b) => a.date.localeCompare(b.date))) {
    const t = ms(it.date);
    if (t <= d0) out.today.push(it);
    else if (t <= d0 + 7 * DAY) out.week.push(it);
    else out.month.push(it);
  }
  out.today = out.today.slice(0, 6); out.week = out.week.slice(0, 6); out.month = out.month.slice(0, 6);
  return out;
}

/* ------------------------------------------------------- operating board */

export interface BoardLane { key: LaneKey; items: LaneItem[]; taskCount: number; seedCount: number }
export const getProjectRefs = (): { id: string; name: string; accountId: string }[] => store.projectRefs;
export const getTasks = (): TodayTask[] => store.tasks;
export const getAccountBand = (id: string): "healthy" | "watch" | "atrisk" | undefined => store.statusByAccount[id];

/** Build the board for a scope over the given focus areas (`categoryIds` —
 *  defaults + any user-created ones). `tasks` is the effective task list
 *  (persisted + session-local, with status overrides). Auto-seeds are
 *  read-only; tasks render first + checkable. */
export function getBoard(scope: PortfolioScope, tasks: TodayTask[], categoryIds: string[]): { lanes: BoardLane[]; overview: StatusOverview } {
  const visible = visibleAccountIds(scope);
  const acc = mapOf(store.accounts);
  const usersById = mapOf(store.users);
  const me = store.viewer.userId;
  const taskToItem = (t: TodayTask): LaneItem => ({
    id: `task_${t.id}`, source: "task", title: t.title,
    subtitle: t.accountId ? acc.get(t.accountId)?.name : undefined,
    accountId: t.accountId ?? undefined, projectId: t.projectId ?? undefined,
    tone: t.status === "done" ? "neutral" : "info", dueDate: t.dueDate, taskId: t.id, done: t.status === "done",
    priority: t.priority,
    assigneeName: t.ownerEmail && t.ownerEmail !== me ? (usersById.get(t.ownerEmail)?.name ?? t.ownerEmail) : undefined,
  });
  const lanes: BoardLane[] = categoryIds.map((key) => {
    const seeds = (store.laneSeeds[key] ?? []).filter((i) => !i.accountId || visible.has(i.accountId)).slice(0, 6);
    // Account-linked tasks follow account visibility; standalone tasks only
    // show on the assignee's own board (they aren't scoped to a book).
    const laneTasks = tasks.filter((t) => t.category === key && (t.accountId ? visible.has(t.accountId) : t.ownerEmail === me));
    const open = laneTasks.filter((t) => t.status !== "done").map(taskToItem);
    const done = laneTasks.filter((t) => t.status === "done").map(taskToItem);
    return { key, items: [...open, ...seeds, ...done], taskCount: laneTasks.length, seedCount: seeds.length };
  });
  const accts = store.accounts.filter((a) => visible.has(a.id));
  let healthy = 0, watch = 0, atRisk = 0, exposedArr = 0;
  for (const a of accts) { const b = store.statusByAccount[a.id]; if (b === "healthy") healthy++; else if (b === "watch") watch++; else if (b === "atrisk") { atRisk++; exposedArr += a.arr; } }
  const overview: StatusOverview = { healthy, watch, atRisk, totalArr: accts.reduce((s, a) => s + a.arr, 0), exposedArr, expansionArr: store.summary.expansionReady.value ?? 0, accountCount: accts.length };
  return { lanes, overview };
}

/** Per-CSM allocation across the current scope — for the admin "compare books"
 *  summary. Sorted by exposed ARR (where the risk is), then book size. */
export interface AllocationRow { userId: string; name: string; role?: string; accountCount: number; arr: number; atRisk: number; exposedArr: number; overdue: number }
export function getTeamAllocation(scope: PortfolioScope): AllocationRow[] {
  const visible = visibleAccountIds(scope);
  const today = store.today;
  // Overdue open actions grouped by the owning CSM (via the action's account).
  const csmOf = new Map<string, string>();
  for (const a of store.accounts) csmOf.set(a.id, a.csmUserId);
  const overdueByOwner = new Map<string, number>();
  for (const act of store.actions) {
    if (!visible.has(act.accountId) || act.state === "completed" || act.state === "dismissed") continue;
    if (act.dueDate && act.dueDate < today) {
      const owner = csmOf.get(act.accountId);
      if (owner) overdueByOwner.set(owner, (overdueByOwner.get(owner) ?? 0) + 1);
    }
  }
  const byOwner = new Map<string, Account[]>();
  for (const a of store.accounts) if (visible.has(a.id)) (byOwner.get(a.csmUserId) ?? byOwner.set(a.csmUserId, []).get(a.csmUserId)!).push(a);
  const rows: AllocationRow[] = [...byOwner.entries()].map(([userId, accts]) => {
    const u = mapOf(store.users).get(userId);
    let atRisk = 0, exposedArr = 0;
    for (const a of accts) if (store.statusByAccount[a.id] === "atrisk") { atRisk++; exposedArr += a.arr; }
    return { userId, name: u?.name ?? userId, role: u?.role, accountCount: accts.length, arr: accts.reduce((s, a) => s + a.arr, 0), atRisk, exposedArr, overdue: overdueByOwner.get(userId) ?? 0 };
  });
  return rows.sort((a, b) => b.exposedArr - a.exposedArr || b.arr - a.arr);
}

/* ------------------------------------------------------------ history */

// Real-data mode carries no historical snapshots — the past is never
// recomputed from current data, so past dates render a "no snapshot" state.
export const isHistorical = (date: string | null): boolean => !!date && date !== store.today;
export function snapshotFor(_date: string | null): null { return null; }

/* ---------------------------------------------------------- sections */

export function getPortfolioSummary(_scope: PortfolioScope, date: string | null): PortfolioSummary {
  if (isHistorical(date)) {
    const partial = { status: "partial" as const, value: null, formatted: "—" };
    return { needsAttention: partial, arrExposed: partial, renewing90: partial, expansionReady: partial };
  }
  return store.summary;
}

export function getPriorities(scope: PortfolioScope, date: string | null): Priority[] {
  if (isHistorical(date)) return [];
  const visible = visibleAccountIds(scope);
  return store.priorities
    .filter((p) => visible.has(p.accountId))
    .sort((a, b) => b._score - a._score)
    .map((p, i) => ({ ...p, rank: i + 1 }));
}

export const getSignalsForPriority = (p: Priority): Signal[] => {
  const m = mapOf(store.signals);
  return p.signalIds.map((id) => m.get(id)).filter(Boolean) as Signal[];
};

export function getChanges(scope: PortfolioScope, date: string | null): ChangeFeedItem[] {
  if (isHistorical(date)) return [];
  const visible = visibleAccountIds(scope);
  return store.changes
    .filter((c) => !c.accountId || visible.has(c.accountId))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

/* ------------------------------------------------ account intelligence */

export const getAccountSignals = (accountId: string): Signal[] =>
  store.signals.filter((s) => s.accountId === accountId).sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
export const getAccountCommitments = (accountId: string): Commitment[] => store.commitments.filter((c) => c.accountId === accountId);
export const getAccountPages = (accountId: string): SignalPage[] => store.pages.filter((p) => p.primaryAccountId === accountId);

/** Timeline derived from the account's signals + changes (real system carries
 *  no dedicated timeline entity yet). */
export function getAccountTimeline(accountId: string, filter: TimelineFilter): TimelineEvent[] {
  const catToFilter: Record<string, TimelineEvent["filter"]> = {
    commercial: "commercial", expansion: "commercial", relationship: "relationship", organisational_change: "relationship",
    adoption: "adoption", value_realisation: "adoption", product: "product", delivery: "product", data_quality: "product",
  };
  // The event title already carries the meaning; we don't surface the raw
  // signal direction / change kind as a "state" (those are internal enums).
  const fromSignals: TimelineEvent[] = store.signals.filter((s) => s.accountId === accountId).map((s) => ({
    id: `tl_${s.id}`, accountId, filter: catToFilter[s.category] ?? "product", title: s.type,
    evidenceSource: s.source, occurredAt: s.detectedAt, recordedAt: s.detectedAt,
  }));
  const fromChanges: TimelineEvent[] = store.changes.filter((c) => c.accountId === accountId).map((c) => ({
    id: `tl_${c.id}`, accountId, filter: "commercial", title: c.title, evidenceSource: "Signal", occurredAt: c.occurredAt, recordedAt: c.occurredAt,
  }));
  return [...fromSignals, ...fromChanges]
    .filter((e) => filter === "all" || e.filter === filter)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

/* -------------------------------------- user operational profile */

export function getUserProfile(userId: string): { user: User; accounts: Account[]; portfolioArr: number; overdueActions: number; openActions: number; renewals: Account[] } | null {
  const user = mapOf(store.users).get(userId);
  if (!user) return null;
  const accounts = store.accounts.filter((a) => a.csmUserId === userId);
  const acts = store.actions.filter((a) => a.ownerUserId === userId);
  const renewals = accounts.filter((a) => a.renewalDate && a.renewalDate >= store.today).sort((a, b) => (a.renewalDate ?? "").localeCompare(b.renewalDate ?? ""));
  return {
    user, accounts,
    portfolioArr: accounts.reduce((s, a) => s + a.arr, 0),
    overdueActions: acts.filter((a) => a.dueDate && a.dueDate < store.today && a.state !== "completed").length,
    openActions: acts.filter((a) => a.state !== "completed" && a.state !== "dismissed").length,
    renewals,
  };
}

/* --------------------------------------------------------- backlinks */

export function getBacklinks(pageId: string): { actions: Action[]; commitments: Commitment[]; pages: SignalPage[] } {
  return {
    actions: store.actions.filter((a) => a.relatedPageId === pageId),
    commitments: store.commitments.filter((c) => c.relatedPageId === pageId),
    pages: store.pages.filter((p) => p.id !== pageId && p.parentPageId === pageId),
  };
}

/* --------------------------------------------------------- mentions */

export function resolveMention(ref: MentionRef): MentionEntity | null {
  if (ref.type === "account") {
    const a = mapOf(store.accounts).get(ref.id);
    return a ? { type: "account", id: a.id, name: a.name, logoUrl: a.logoUrl, route: a.route, tier: a.tier, arr: a.arr, renewalDate: a.renewalDate, csmName: getUser(a.csmUserId)?.name } : null;
  }
  if (ref.type === "user") {
    const u = mapOf(store.users).get(ref.id);
    return u ? { type: "user", id: u.id, name: u.name, avatarUrl: u.avatarUrl, role: u.role, team: u.team, email: u.email, route: u.route } : null;
  }
  const p = mapOf(store.pages).get(ref.id);
  return p ? { type: "page", id: p.id, title: p.title, icon: p.icon, relatedAccountId: p.primaryAccountId, parentPageId: p.parentPageId, route: p.route } : null;
}

export function searchMentions(query: string): { accounts: MentionEntity[]; users: MentionEntity[]; pages: MentionEntity[] } {
  const q = query.trim().toLowerCase();
  const match = (s: string) => q === "" || s.toLowerCase().includes(q);
  return {
    accounts: store.accounts.filter((a) => match(a.name)).slice(0, 6).map((a) => resolveMention({ type: "account", id: a.id })!),
    users: store.users.filter((u) => match(u.name)).slice(0, 6).map((u) => resolveMention({ type: "user", id: u.id })!),
    pages: store.pages.filter((p) => match(p.title)).slice(0, 6).map((p) => resolveMention({ type: "page", id: p.id })!),
  };
}

/* ------------------------------------------------------- comparison */

export function getComparison(_fromDate: string | null, _basis: ComparisonBasis, _customDate?: string): ComparisonDelta[] {
  // Real-data mode has no stored historical snapshots to diff against yet.
  return [];
}

/* --------------------------------------------------------- freshness */

export function relativeTime(iso: string): string {
  const now = new Date(`${store.today}T12:00:00Z`).getTime();
  const diff = now - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.round(days / 30)}mo ago`;
}

export function freshnessLabel(f: DataFreshness): string {
  if (f.level === "missing" || !f.updatedAt) return `${f.source}: no data`;
  return `${f.source} · updated ${relativeTime(f.updatedAt)}`;
}
