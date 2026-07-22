/* =========================================================================
   Today page — server-side snapshot builder. Turns REAL, permission-scoped
   data (clients, app users, notifications, client actions) into a TodaySnapshot
   the client repo reads from. Because getClients() is already role-scoped
   (super-admins/admins see the whole book, CSMs see only owned accounts), the
   snapshot inherently reflects what THIS viewer is allowed to see.

   Signals / priorities / commitments / changes / patterns are DERIVED from real
   account facts (renewal dates, health, ARR) — they reference real accounts and
   real owners; they are not fabricated external claims. When no DB is
   configured (dev/sample), it falls back to the illustrative mock snapshot.
   ========================================================================= */

import "server-only";
import type {
  Account, AccountTier, User, Signal, SignalCategory, SignalSeverity, Commitment, Action, Priority, ChangeFeedItem,
  Pattern, PortfolioSummary, SummaryMetric, WorkCounts, TodaySnapshot, TodayViewer,
  TodayNotification, OperationalState, Confidence, ActionPriorityLevel, DataFreshness,
  LaneItem, LaneKey, LaneItemTone, TodayTask,
} from "./types";
import type { Client, Notification } from "@/lib/types";
import { getClients, getAppUsers, getMyNotifications, getMyClientActions, getPortfolioSummary } from "@/lib/data";
import { getCurrentUserEmail, getCurrentUserRole, isAdminOrSuper } from "@/lib/auth";
import { teamForRole, DEFAULT_ROLE_LABELS, type Role } from "@/lib/roles";
import { getAllProjectBoards } from "@/lib/repo/projects";
import { getProjectConfig } from "@/lib/projects/data";
import { isProjectComplete } from "@/lib/projects/config";
import { getTodayTasksVisibleDb } from "@/lib/repo/drizzle";
import { formatMoney } from "./format";
import * as MOCK from "./mock";

/* --------------------------------------------------- lane derivation */

const STATE_TONE: Record<OperationalState, LaneItemTone> = {
  rescue: "danger", renew: "warning", stabilise: "warning", grow: "success", activate: "info", investigate: "eclipse", maintain: "neutral",
};

/** Bucket the derived priorities/signals/commitments into board lanes. Shared
 *  by the real and mock paths (both produce the same domain types). */
function buildLaneSeeds(accounts: Account[], priorities: Priority[], signals: Signal[], commitments: Commitment[], projectSeeds: LaneItem[]): Record<LaneKey, LaneItem[]> {
  const name = (id: string) => accounts.find((a) => a.id === id)?.name ?? id;
  const RISK = new Set<OperationalState>(["rescue", "stabilise", "renew", "investigate"]);
  const derisking: LaneItem[] = [];
  for (const p of priorities) if (RISK.has(p.state)) derisking.push({ id: `dr_${p.accountId}`, source: "signal", title: name(p.accountId), subtitle: p.reason, accountId: p.accountId, tone: STATE_TONE[p.state], dueDate: p.dueDate ?? null });
  const escalations: LaneItem[] = [];
  for (const c of commitments) if (c.status === "overdue" || c.status === "escalation_required") escalations.push({ id: `es_${c.id}`, source: "commitment", title: `${name(c.accountId)} — ${c.title}`, subtitle: c.status === "overdue" ? "Overdue" : "Escalation required", accountId: c.accountId, tone: "danger", dueDate: c.dueDate });
  for (const s of signals) if (s.category === "delivery") escalations.push({ id: `es_${s.id}`, source: "signal", title: `${name(s.accountId)} — ${s.type}`, subtitle: "Delivery risk", accountId: s.accountId, tone: "danger" });
  const stakeholders: LaneItem[] = [];
  for (const s of signals) if (s.category === "relationship") stakeholders.push({ id: `sk_${s.id}`, source: "signal", title: name(s.accountId), subtitle: s.type, accountId: s.accountId, tone: "warning" });
  const expansion: LaneItem[] = [];
  for (const s of [...signals].filter((s) => s.category === "expansion" && s.direction === "positive").sort((a, b) => b.commercialImpact - a.commercialImpact)) {
    expansion.push({ id: `ex_${s.id}`, source: "signal", title: name(s.accountId), subtitle: s.type, accountId: s.accountId, tone: "success" });
  }
  return { derisking, projects: projectSeeds, escalations, expansion, stakeholders };
}

const todayIso = () => new Date().toISOString().slice(0, 10);
const daysBetween = (iso: string, ref: string) => Math.round((new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime() - new Date(`${ref}T00:00:00Z`).getTime()) / 86_400_000);
const lc = (s: string | null | undefined) => (s ?? "").toLowerCase();

function tierFor(c: Client): AccountTier {
  if (c.arr >= 100_000) return "strategic";
  return c.segment; // enterprise | mid_market | smb
}
function freshnessFrom(updatedAt: string | null, ref: string): DataFreshness {
  if (!updatedAt) return { level: "missing", updatedAt: null, source: "Product telemetry" };
  const age = -daysBetween(updatedAt, ref);
  const level = age < 2 ? "fresh" : age < 7 ? "recent" : age < 14 ? "aging" : "stale";
  return { level, updatedAt, source: "Health & usage" };
}

/* ------------------------------------------------------------ builder */

export async function buildTodaySnapshot(): Promise<TodaySnapshot> {
  const [role, email, canSeeAll, clients, appUsers, notifications, myActions, portfolio] = await Promise.all([
    getCurrentUserRole(), getCurrentUserEmail(), isAdminOrSuper(),
    getClients(), getAppUsers(), getMyNotifications(50), getMyClientActions(), getPortfolioSummary(),
  ]);

  // No real clients visible (no DB / empty) → illustrative mock so the page still demos.
  if (clients.length === 0) return buildMockSnapshot();

  const today = todayIso();
  const viewerEmail = lc(email) || "viewer";

  /* ---- users (app users + every account owner) ---- */
  const users = new Map<string, User>();
  const roleTeam = (r: string): string | undefined => {
    const t = teamForRole(r as Role);
    return t === "csm" ? "Customer Success" : t === "implementation" ? "Implementation" : undefined;
  };
  for (const u of appUsers) {
    const id = lc(u.email);
    users.set(id, { id, name: u.name ?? u.email, role: DEFAULT_ROLE_LABELS[u.role] ?? u.role, team: roleTeam(u.role), email: u.email, route: `/settings?tab=members`, accountIds: [] });
  }
  const ensureOwner = (csm: Client["csm"]): string => {
    if (!csm) return "unassigned";
    // Key by email when present (matches auth/scope), else by the CSM's stable id
    // — so an owner with a name but no email keeps their NAME instead of being
    // dumped into "Unassigned".
    const id = lc(csm.email) || csm.id;
    if (!id) return "unassigned";
    const existing = users.get(id);
    if (!existing) users.set(id, { id, name: csm.name, role: "CSM", team: "Customer Success", email: csm.email, route: `/settings?tab=members`, accountIds: [] });
    else if (!existing.name || existing.name === existing.email) existing.name = csm.name; // backfill the real name over an email placeholder
    return id;
  };
  users.set("unassigned", { id: "unassigned", name: "Unassigned", route: "/settings?tab=members", accountIds: [] });
  // Ensure the viewer exists.
  if (!users.has(viewerEmail)) users.set(viewerEmail, { id: viewerEmail, name: email ?? "You", role: DEFAULT_ROLE_LABELS[role ?? "operator"] ?? "", team: roleTeam(role ?? ""), email: email ?? undefined, route: "/settings?tab=members", accountIds: [] });

  /* ---- accounts ---- */
  const accounts: Account[] = clients.map((c) => {
    const owner = ensureOwner(c.csm);
    users.get(owner)!.accountIds.push(c.id);
    return { id: c.id, name: c.name, logoUrl: c.logoUrl ?? undefined, tier: tierFor(c), arr: c.arr, renewalDate: c.renewalDate, csmUserId: owner, route: `/clients/${c.id}`, industry: c.industry ?? undefined, region: c.country ?? undefined };
  });
  const clientById = new Map(clients.map((c) => [c.id, c]));

  /* ---- proactive assessment inputs ---- */
  // The app's real per-account engine (lib/actions/signals.detectSignals) already
  // assesses profile / usage / health / stakeholders / SLA / sentiment and stores
  // the results as ClientActions. Reuse them so Today reflects that assessment.
  const actionsByClient = new Map<string, typeof myActions>();
  for (const a of myActions) (actionsByClient.get(a.clientId) ?? actionsByClient.set(a.clientId, []).get(a.clientId)!).push(a);
  const CA: Record<string, { category: SignalCategory; rec: string }> = {
    incomplete_profile: { category: "data_quality", rec: "Complete the account profile" },
    usage: { category: "adoption", rec: "Drive adoption with the champion" },
    health: { category: "adoption", rec: "Stabilise declining health" },
    stakeholders: { category: "relationship", rec: "Map the key stakeholders" },
    sentiment: { category: "relationship", rec: "Address the sentiment signal" },
    sla: { category: "delivery", rec: "Resolve the SLA breach" },
    project: { category: "delivery", rec: "Unblock the delivery item" },
  };
  const sevFromPriority = (p: string): SignalSeverity => (p === "high" ? "high" : p === "medium" ? "medium" : "low");
  // No dedicated "days since we talked" metric exists — approximate from the last
  // product activity and the last support conversation (both on getClients()).
  const daysSinceContact = (c: Client): number | null => {
    const dates = [c.usage?.lastActiveAt, c.support?.lastConversationAt].filter(Boolean) as string[];
    if (!dates.length) return null;
    return -daysBetween(dates.sort().pop()!, today);
  };

  /* ---- derived signals ---- */
  const signals: Signal[] = [];
  const addSignal = (s: Signal) => signals.push(s);
  for (const c of clients) {
    if (c.status === "churned") continue;
    const fresh = freshnessFrom(c.health?.updatedAt ?? null, today);
    const detected = c.health?.updatedAt ?? `${today}T00:00:00Z`;
    const dRenew = c.renewalDate ? daysBetween(c.renewalDate, today) : null;
    if (dRenew !== null && dRenew <= 90) {
      const overdue = dRenew < 0;
      addSignal({ id: `sig_${c.id}_renewal`, accountId: c.id, type: overdue ? "Renewal overdue" : `Renewal in ${dRenew} days`, category: "commercial", direction: "negative", severity: overdue ? "critical" : dRenew <= 14 ? "high" : "medium", confidence: "high", detectedAt: detected, source: "CRM", evidence: [{ id: `ev_${c.id}_r`, label: overdue ? `Contract end passed ${Math.abs(dRenew)} days ago` : `Contract ends ${c.renewalDate}`, observedAt: `${today}T00:00:00Z`, source: "CRM" }], commercialImpact: c.arr, recommendedAction: overdue ? "Escalate and secure a decision date" : "Confirm the renewal decision plan", status: "active", dataFreshness: fresh });
    }
    if (c.health && c.health.score < 55) {
      addSignal({ id: `sig_${c.id}_health`, accountId: c.id, type: `Health at ${c.health.score} (${c.health.tier})`, category: "adoption", direction: "negative", severity: c.health.score < 40 ? "high" : "medium", confidence: fresh.level === "stale" ? "low" : "medium", detectedAt: detected, source: "Health & usage", evidence: [{ id: `ev_${c.id}_h`, label: `Composite health ${c.health.score}, trend ${c.health.trend > 0 ? "+" : ""}${c.health.trend}`, observedAt: detected, source: "Health & usage" }], commercialImpact: c.arr, recommendedAction: "Investigate declining engagement and stabilise", status: "active", dataFreshness: fresh });
    }
    if (fresh.level === "stale") {
      addSignal({ id: `sig_${c.id}_data`, accountId: c.id, type: "Health data is stale", category: "data_quality", direction: "systemic", severity: "medium", confidence: "low", detectedAt: detected, source: "Data pipeline", evidence: [{ id: `ev_${c.id}_d`, label: `Health last refreshed ${c.health?.updatedAt?.slice(0, 10) ?? "never"}`, observedAt: detected, source: "Data pipeline" }], commercialImpact: c.arr, recommendedAction: "Investigate the data connection before assessing risk", status: "active", dataFreshness: fresh });
    }
    if (c.arr > c.previousArr && c.previousArr > 0 && (c.health?.score ?? 0) >= 60) {
      addSignal({ id: `sig_${c.id}_expand`, accountId: c.id, type: "Expansion momentum", category: "expansion", direction: "positive", severity: "low", confidence: "medium", detectedAt: detected, source: "Commercial", evidence: [{ id: `ev_${c.id}_e`, label: `ARR grew ${formatMoney(c.arr - c.previousArr)} with healthy adoption`, observedAt: detected, source: "Commercial" }], commercialImpact: Math.round((c.arr - c.previousArr) * 1.5), recommendedAction: "Qualify an expansion opportunity", status: "new", dataFreshness: fresh });
    }
    // Usage scan for expansion — seats near capacity, or deep sticky adoption not yet monetised.
    if (c.usage && c.usage.seats > 0) {
      const util = c.usage.activeUsers / c.usage.seats;
      const sticky = c.usage.stickiness ?? 0;
      if (util >= 0.85) {
        addSignal({ id: `sig_${c.id}_seats`, accountId: c.id, type: `Near seat capacity (${Math.round(util * 100)}%)`, category: "expansion", direction: "positive", severity: "low", confidence: "high", detectedAt: detected, source: "Product telemetry", evidence: [{ id: `ev_${c.id}_seat`, label: `${c.usage.activeUsers} of ${c.usage.seats} seats active`, observedAt: detected, source: "Product telemetry" }], commercialImpact: Math.round(c.arr * 0.3), recommendedAction: "Propose a seat expansion", status: "new", dataFreshness: fresh });
      } else if (c.usage.adoptionRate >= 0.65 && sticky >= 0.35 && c.arr <= c.previousArr) {
        addSignal({ id: `sig_${c.id}_upsell`, accountId: c.id, type: "Strong, sticky adoption — expansion-ready", category: "expansion", direction: "positive", severity: "low", confidence: "medium", detectedAt: detected, source: "Product telemetry", evidence: [{ id: `ev_${c.id}_up`, label: `Adoption ${Math.round(c.usage.adoptionRate * 100)}%, stickiness ${Math.round(sticky * 100)}%`, observedAt: detected, source: "Product telemetry" }], commercialImpact: Math.round(c.arr * 0.2), recommendedAction: "Qualify an upsell", status: "new", dataFreshness: fresh });
      }
    }
    // Proactive signals from the real assessment engine (stakeholders, usage, SLA, sentiment, profile).
    for (const a of actionsByClient.get(c.id) ?? []) {
      const meta = CA[a.category] ?? { category: "adoption" as SignalCategory, rec: "Review and act" };
      addSignal({ id: `sig_${a.id}`, accountId: c.id, type: a.title, category: meta.category, direction: "negative", severity: sevFromPriority(a.priority), confidence: "medium", detectedAt: a.updatedAt ?? detected, source: "Signal assessment", evidence: a.insight ? [{ id: `ev_${a.id}`, label: a.insight, observedAt: a.updatedAt ?? detected, source: "Signal assessment" }] : [], commercialImpact: c.arr, recommendedAction: meta.rec, status: "active", dataFreshness: fresh });
    }
    // Engagement recency — reconnect before it becomes risk.
    const dContact = daysSinceContact(c);
    if (dContact !== null && dContact >= 30) {
      addSignal({ id: `sig_${c.id}_contact`, accountId: c.id, type: `No engagement in ${dContact} days`, category: "relationship", direction: "negative", severity: dContact >= 60 ? "high" : "medium", confidence: "medium", detectedAt: detected, source: "Engagement", evidence: [{ id: `ev_${c.id}_c`, label: `Last product activity or conversation ${dContact} days ago`, observedAt: detected, source: "Engagement" }], commercialImpact: c.arr, recommendedAction: "Schedule a check-in with the account", status: "active", dataFreshness: fresh });
    }
    // Adoption depth (power-user coverage).
    if (c.usage?.seats && c.usage.seats >= 3 && c.usage.activeUsers / c.usage.seats < 0.4) {
      const pct = Math.round((c.usage.activeUsers / c.usage.seats) * 100);
      addSignal({ id: `sig_${c.id}_adopt`, accountId: c.id, type: `Low licence adoption (${pct}%)`, category: "adoption", direction: "negative", severity: "medium", confidence: "medium", detectedAt: detected, source: "Product telemetry", evidence: [{ id: `ev_${c.id}_a`, label: `${c.usage.activeUsers} of ${c.usage.seats} seats active`, observedAt: detected, source: "Product telemetry" }], commercialImpact: c.arr, recommendedAction: "Run an adoption play with the champion", status: "active", dataFreshness: fresh });
    }
  }
  const signalsByAccount = new Map<string, Signal[]>();
  for (const s of signals) (signalsByAccount.get(s.accountId) ?? signalsByAccount.set(s.accountId, []).get(s.accountId)!).push(s);

  /* ---- priorities (transparent, multi-dimensional scoring) ---- */
  const prioRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const scored = clients.filter((c) => c.status !== "churned").map((c) => {
    const dRenew = c.renewalDate ? daysBetween(c.renewalDate, today) : null;
    const fresh = freshnessFrom(c.health?.updatedAt ?? null, today);
    const health = c.health?.score ?? 100;
    const acts = [...(actionsByClient.get(c.id) ?? [])].sort((a, b) => prioRank[a.priority] - prioRank[b.priority]);
    const dContact = daysSinceContact(c);
    const sigCount = signalsByAccount.get(c.id)?.length ?? 0;
    let score = 0;
    if (dRenew !== null) score += dRenew < 0 ? 50 : dRenew <= 14 ? 40 : dRenew <= 30 ? 30 : dRenew <= 90 ? 15 : 0;
    if (health < 40) score += 30; else if (health < 55) score += 20; else if (health < 70) score += 8;
    if (fresh.level === "stale") score += 12;
    if (c.arr > c.previousArr && c.previousArr > 0) score += 12;
    score += acts.reduce((s, a) => s + (a.priority === "high" ? 15 : a.priority === "medium" ? 8 : 4), 0);
    if (dContact !== null && dContact >= 60) score += 15; else if (dContact !== null && dContact >= 30) score += 8;
    score += Math.min(15, c.arr / 12_000);
    return { c, dRenew, fresh, health, acts, dContact, sigCount, score };
  }).filter((x) => x.sigCount > 0 || x.score >= 10).sort((a, b) => b.score - a.score).slice(0, 8);

  const priorities: Priority[] = scored.map(({ c, dRenew, fresh, health, acts, dContact, score }, i) => {
    const overdue = dRenew !== null && dRenew < 0;
    const expanding = c.arr > c.previousArr && c.previousArr > 0 && health >= 60;
    const top = acts[0];
    const topMeta = top ? (CA[top.category] ?? { category: "adoption" as SignalCategory, rec: "Review and act" }) : null;
    const staleContact = dContact !== null && dContact >= 45;

    let state: OperationalState; let reason: string; let recommendedAction: string;
    if (overdue) { state = "rescue"; reason = "Renewal is overdue with no confirmed decision."; recommendedAction = "Escalate to the executive sponsor"; }
    else if (dRenew !== null && dRenew <= 30) { state = "renew"; reason = `Renews in ${dRenew} days and needs a confirmed plan.`; recommendedAction = "Confirm the renewal decision plan"; }
    else if (fresh.level === "stale") { state = "investigate"; reason = "Health data is stale — risk can't be trusted."; recommendedAction = "Investigate the data connection"; }
    else if (top && (top.category === "stakeholders" || top.category === "sentiment")) { state = "stabilise"; reason = top.title; recommendedAction = topMeta!.rec; }
    else if (health < 55 || (top && top.category === "health")) { state = "stabilise"; reason = top?.title ?? `Health at ${health} needs stabilising.`; recommendedAction = topMeta?.rec ?? "Stabilise declining health"; }
    else if (top && (top.category === "usage" || top.category === "incomplete_profile")) { state = "activate"; reason = top.title; recommendedAction = topMeta!.rec; }
    else if (staleContact) { state = "stabilise"; reason = `No engagement in ${dContact} days — reconnect before it drifts.`; recommendedAction = "Schedule a check-in with the account"; }
    else if (expanding) { state = "grow"; reason = "Growing ARR with healthy adoption — expansion candidate."; recommendedAction = "Qualify an expansion opportunity"; }
    else if (top) { state = "stabilise"; reason = top.title; recommendedAction = topMeta!.rec; }
    else { state = "maintain"; reason = "Steady — confirm stakeholder coverage and value."; recommendedAction = "Review the account and confirm coverage"; }

    const confidence: Confidence = fresh.level === "stale" ? "low" : health < 40 ? "high" : "medium";
    const drivers: Priority["drivers"] = [];
    if (dRenew !== null && dRenew <= 90) drivers.push({ label: overdue ? `Overdue ${Math.abs(dRenew)}d` : `Renews in ${dRenew}d`, weight: "primary" });
    drivers.push({ label: `${expanding ? "Expansion" : "ARR"} ${formatMoney(expanding ? Math.round((c.arr - c.previousArr) * 1.5) : c.arr)}`, weight: "primary" });
    if (health < 70) drivers.push({ label: `Health ${health}`, weight: "secondary" });
    if (acts.length) drivers.push({ label: `${acts.length} open signal${acts.length === 1 ? "" : "s"}`, weight: "secondary" });
    if (staleContact) drivers.push({ label: `No contact ${dContact}d`, weight: "secondary" });
    if (fresh.level === "stale") drivers.push({ label: "Data stale", weight: "secondary" });

    const sigs = signalsByAccount.get(c.id) ?? [];
    return {
      id: `pri_${c.id}`, rank: i + 1, accountId: c.id, state, confidence, reason, drivers,
      signalIds: sigs.map((s) => s.id), valueAtStake: expanding ? Math.round((c.arr - c.previousArr) * 1.5) : c.arr, valueKind: expanding ? "expansion" : "exposure",
      timing: dRenew !== null && dRenew <= 90 ? (overdue ? `Overdue ${Math.abs(dRenew)}d` : `Renews in ${dRenew}d`) : staleContact ? `Last touch ${dContact}d ago` : undefined,
      recommendedAction, suggestedActionOwnerId: ensureOwner(c.csm), dueDate: c.renewalDate ?? undefined,
      primaryCta: overdue ? "escalate" : state === "grow" ? "create_opportunity" : state === "investigate" ? "investigate" : "take_action",
      secondaryCta: "review_account", _score: Math.round(score),
    };
  });

  /* ---- commitments (derived, at-risk only surface) ---- */
  const commitments: Commitment[] = [];
  for (const c of clients) {
    if (c.status === "churned" || !c.renewalDate) continue;
    const d = daysBetween(c.renewalDate, today);
    if (d > 45) continue;
    commitments.push({ id: `cmt_${c.id}_renewal`, accountId: c.id, title: "Confirm renewal decision", kind: "Renewal confirmation", ownerUserId: ensureOwner(c.csm), dueDate: c.renewalDate, impact: "Renewal · ARR", status: d < 0 ? "overdue" : d <= 14 ? "at_risk" : "on_track", relatedSignalId: `sig_${c.id}_renewal` });
  }

  /* ---- what changed ---- */
  const changes: ChangeFeedItem[] = [];
  for (const c of clients) {
    if (c.status === "churned") continue;
    const when = c.health?.updatedAt ?? `${today}T00:00:00Z`;
    const d = c.renewalDate ? daysBetween(c.renewalDate, today) : null;
    if (d !== null && d < 0) changes.push({ id: `chg_${c.id}_overdue`, kind: "risk", accountId: c.id, title: `${c.name} renewal became overdue`, explanation: `Contract end passed ${Math.abs(d)} days ago with no recorded decision.`, occurredAt: when, significance: "high", evidenceIds: [] });
    if (c.health && c.health.trend <= -3) changes.push({ id: `chg_${c.id}_health`, kind: "relationship", accountId: c.id, title: `${c.name} health declined`, explanation: `Composite health trending ${c.health.trend}pp to ${c.health.score}.`, occurredAt: when, significance: "medium", evidenceIds: [] });
    if (c.arr > c.previousArr && c.previousArr > 0) changes.push({ id: `chg_${c.id}_expand`, kind: "opportunity", accountId: c.id, title: `${c.name} shows expansion momentum`, explanation: `ARR grew ${formatMoney(c.arr - c.previousArr)} this period.`, occurredAt: when, significance: "medium", evidenceIds: [] });
    if (freshnessFrom(c.health?.updatedAt ?? null, today).level === "stale") changes.push({ id: `chg_${c.id}_stale`, kind: "data_confidence", accountId: c.id, title: `${c.name} health data went stale`, explanation: `No refresh recently — confidence downgraded.`, occurredAt: when, significance: "low", evidenceIds: [] });
  }
  changes.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  /* ---- patterns (cross-account) ---- */
  const patterns: Pattern[] = [];
  const bySeg = new Map<string, Client[]>();
  for (const c of clients) if (c.status !== "churned" && (c.health?.score ?? 100) < 55) (bySeg.get(c.segment) ?? bySeg.set(c.segment, []).get(c.segment)!).push(c);
  for (const [seg, list] of bySeg) if (list.length >= 2) patterns.push({ id: `pat_health_${seg}`, title: `Declining health across ${seg.replace("_", " ")} accounts`, explanation: `${list.length} ${seg.replace("_", " ")} accounts are below a healthy score.`, accountIds: list.map((c) => c.id), arrAffected: list.reduce((s, c) => s + c.arr, 0), arrKind: "exposure", confidence: "medium", freshness: { level: "recent", updatedAt: `${today}T00:00:00Z`, source: "Health & usage" } });
  const renewingSoon = clients.filter((c) => c.status !== "churned" && c.renewalDate && daysBetween(c.renewalDate, today) >= 0 && daysBetween(c.renewalDate, today) <= 30);
  if (renewingSoon.length >= 2) patterns.push({ id: "pat_renewals", title: "Cluster of renewals in the next 30 days", explanation: `${renewingSoon.length} accounts renew within a month — confirm decision plans now.`, accountIds: renewingSoon.map((c) => c.id), arrAffected: renewingSoon.reduce((s, c) => s + c.arr, 0), arrKind: "exposure", confidence: "high", freshness: { level: "fresh", updatedAt: `${today}T00:00:00Z`, source: "CRM" } });
  const expanding = clients.filter((c) => c.status !== "churned" && c.arr > c.previousArr && c.previousArr > 0);
  if (expanding.length >= 2) patterns.push({ id: "pat_expansion", title: "Expansion momentum across the book", explanation: `${expanding.length} accounts grew ARR this period — credible expansion capacity.`, accountIds: expanding.map((c) => c.id), arrAffected: expanding.reduce((s, c) => s + (c.arr - c.previousArr), 0), arrKind: "opportunity", confidence: "medium", freshness: { level: "fresh", updatedAt: `${today}T00:00:00Z`, source: "Commercial" } });

  /* ---- actions (My work + account drawer) ---- */
  const actions: Action[] = [];
  const ntfPriority = (n: Notification): ActionPriorityLevel => n.type === "assignment_needs_admin" || n.type === "profile_incomplete_red" ? "high" : n.type === "system" ? "low" : "normal";
  for (const n of notifications) {
    if (n.status !== "open" || !n.clientId || !clientById.has(n.clientId)) continue;
    actions.push({ id: `act_ntf_${n.id}`, accountId: n.clientId, title: n.title, ownerUserId: viewerEmail, dueDate: n.dueDate, priority: ntfPriority(n), state: "open", intendedOutcome: n.body ?? "Resolve this action" });
  }
  const caPriority: Record<string, ActionPriorityLevel> = { high: "high", medium: "normal", low: "low" };
  for (const a of myActions) {
    if (!clientById.has(a.clientId)) continue;
    actions.push({ id: `act_ca_${a.id}`, accountId: a.clientId, title: a.title, ownerUserId: ensureOwner(clientById.get(a.clientId)!.csm), dueDate: null, priority: caPriority[a.priority] ?? "normal", state: "open", intendedOutcome: a.insight ?? a.category });
  }

  /* ---- work counts (from the viewer's dated notifications) ---- */
  const mine = actions.filter((a) => a.ownerUserId === viewerEmail);
  const workCounts: WorkCounts = {
    overdue: mine.filter((a) => a.dueDate && a.dueDate < today).length,
    dueToday: mine.filter((a) => a.dueDate === today).length,
    awaitingInternal: 0, awaitingCustomer: 0,
  };

  /* ---- summary ---- */
  const expansionReady = expanding.length;
  const expansionArr = expanding.reduce((s, c) => s + Math.round((c.arr - c.previousArr) * 1.5), 0);
  const summary: PortfolioSummary = {
    needsAttention: metric(portfolio.atRisk + portfolio.watch, String(portfolio.atRisk + portfolio.watch), { sub: "accounts" }),
    arrExposed: metric(exposedArr(clients, today), formatMoney(exposedArr(clients, today)), { sub: "at risk" }),
    renewing90: metric(portfolio.arrUpForRenewal90d, formatMoney(portfolio.arrUpForRenewal90d), { sub: `${portfolio.renewalsNext90d} accounts` }),
    expansionReady: metric(expansionArr, formatMoney(expansionArr), { sub: `${expansionReady} qualified accounts` }),
  };

  /* ---- board: projects, tasks, lanes, status ---- */
  let boards: Awaited<ReturnType<typeof getAllProjectBoards>> = new Map();
  let projConfig: Awaited<ReturnType<typeof getProjectConfig>> | null = null;
  try { [boards, projConfig] = await Promise.all([getAllProjectBoards(), getProjectConfig()]); } catch { /* projects unavailable */ }
  const projectRefs: { id: string; name: string; accountId: string }[] = [];
  const projectSeeds: LaneItem[] = [];
  for (const [clientId, projs] of boards) {
    if (!clientById.has(clientId)) continue;
    for (const p of projs) {
      projectRefs.push({ id: p.id, name: p.name, accountId: clientId });
      if (projConfig && isProjectComplete(projConfig, p.status)) continue;
      const dd = p.deliveryDate ? daysBetween(p.deliveryDate, today) : null;
      let tone: LaneItemTone; let sub: string;
      if (p.status === "at_risk") { tone = "warning"; sub = "At risk"; }
      else if (dd !== null && dd < 0) { tone = "danger"; sub = `Overdue ${Math.abs(dd)}d`; }
      else if (dd !== null && dd <= 7) { tone = "warning"; sub = `Due in ${dd}d`; }
      else continue;
      projectSeeds.push({ id: `pj_${p.id}`, source: "project", title: `${clientById.get(clientId)!.name} — ${p.name}`, subtitle: sub, accountId: clientId, projectId: p.id, tone });
    }
  }

  const laneSeeds = buildLaneSeeds(accounts, priorities, signals, commitments, projectSeeds);

  const bandOf = (score: number): "healthy" | "watch" | "atrisk" => (score >= 75 ? "healthy" : score >= 55 ? "watch" : "atrisk");
  const statusByAccount: Record<string, "healthy" | "watch" | "atrisk"> = {};
  for (const c of clients) if (c.status !== "churned") statusByAccount[c.id] = bandOf(c.health?.score ?? 100);

  // Tasks the viewer should see: their own (as assignee) plus any task attached
  // to an account in their scope (delegated to/from them, or created by peers).
  const taskRows = email ? await getTodayTasksVisibleDb(email, clients.map((c) => c.id)) : [];
  const prio = (p: string): TodayTask["priority"] => (p === "urgent" || p === "high" || p === "low" ? p : "normal");
  const tasks: TodayTask[] = taskRows.map((t) => ({
    id: t.id, category: t.category as LaneKey, title: t.title, accountId: t.accountId, projectId: t.projectId, dueDate: t.dueDate,
    priority: prio(t.priority), notes: t.notes, ownerEmail: t.ownerEmail,
    sourceType: t.sourceType === "signal" || t.sourceType === "commitment" ? t.sourceType : null, sourceId: t.sourceId,
    status: t.status === "done" ? "done" : "open", createdAt: t.createdAt,
  }));

  const viewer: TodayViewer = { userId: viewerEmail, name: users.get(viewerEmail)?.name ?? "You", email: email ?? "", role: role ?? "operator", canSeeAll, teamUserIds: [...users.values()].filter((u) => u.team === users.get(viewerEmail)?.team).map((u) => u.id) };

  return {
    today, viewer, accounts, users: [...users.values()], pages: [], signals, commitments, actions,
    priorities, changes: changes.slice(0, 10), patterns: patterns.slice(0, 3), summary, workCounts,
    notifications: notifications.map(toTodayNotification),
    laneSeeds, tasks, statusByAccount, projectRefs,
  };
}

function metric(value: number, formatted: string, extra: Partial<SummaryMetric> = {}): SummaryMetric {
  return { status: "ok", value, formatted, ...extra };
}
function exposedArr(clients: Client[], today: string): number {
  return clients.filter((c) => c.status !== "churned" && ((c.health?.score ?? 100) < 55 || (c.renewalDate && daysBetween(c.renewalDate, today) < 14))).reduce((s, c) => s + c.arr, 0);
}
function toTodayNotification(n: Notification): TodayNotification {
  return { id: n.id, kind: n.type, title: n.title, body: n.body, accountId: n.clientId, status: n.status, read: n.readAt != null, dueDate: n.dueDate, createdAt: n.createdAt };
}

/* ------------------------------------------------------ mock fallback */

export function buildMockSnapshot(): TodaySnapshot {
  const m = MOCK;
  const laneSeeds = buildLaneSeeds(m.ACCOUNTS, m.PRIORITIES, m.SIGNALS, m.COMMITMENTS, [
    { id: "pj_mock1", source: "project", title: "Ministry of Economy — Implementation", subtitle: "1 overdue task", accountId: "acc_mep", projectId: "prj_mep", tone: "danger" },
    { id: "pj_mock2", source: "project", title: "Gulf Air — Rollout", subtitle: "Milestone in 6d", accountId: "acc_gulfair", projectId: "prj_gulf", tone: "success" },
  ]);
  const statusByAccount: Record<string, "healthy" | "watch" | "atrisk"> = {};
  for (const a of m.ACCOUNTS) statusByAccount[a.id] = "healthy";
  for (const p of m.PRIORITIES) statusByAccount[p.accountId] = p.state === "rescue" ? "atrisk" : p.state === "grow" || p.state === "maintain" ? "healthy" : "watch";
  return {
    today: m.TODAY_ISO,
    viewer: { userId: m.VIEWER_USER_ID, name: "Mahmood Malik", email: "mahmood@lumofy.com", role: "super_admin", canSeeAll: true, teamUserIds: m.USERS.filter((u) => u.team === "Customer Success").map((u) => u.id) },
    accounts: m.ACCOUNTS, users: m.USERS, pages: m.PAGES, signals: m.SIGNALS, commitments: m.COMMITMENTS, actions: m.ACTIONS,
    priorities: m.PRIORITIES, changes: m.CHANGES, patterns: m.PATTERNS, summary: m.PORTFOLIO_SUMMARY, workCounts: m.WORK_COUNTS,
    notifications: [
      { id: "ntf1", kind: "assignment_review", title: "Review new account assignments", body: "3 accounts await your review", accountId: null, status: "open", read: false, dueDate: m.TODAY_ISO, createdAt: `${m.TODAY_ISO}T08:00:00Z` },
      { id: "ntf2", kind: "client_assigned", title: "Arla Foods assigned to you", body: null, accountId: "acc_arla", status: "open", read: false, dueDate: null, createdAt: `${m.TODAY_ISO}T07:00:00Z` },
    ],
    laneSeeds, tasks: [], statusByAccount,
    projectRefs: [{ id: "prj_mep", name: "Implementation", accountId: "acc_mep" }, { id: "prj_gulf", name: "Rollout", accountId: "acc_gulfair" }],
  };
}
