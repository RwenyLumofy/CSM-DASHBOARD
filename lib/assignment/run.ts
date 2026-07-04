/* =========================================================================
   Assignment workflow — orchestrator (server-only).

   Runs the pure engine against live data, writes the chosen owner, and emits
   notifications/action-items. Two entry points:
     • runAssignment(ids)  — assign a specific set of clients (sync trigger:
                             brand-new business only).
     • runAssignment()     — assign every active client missing an owner
                             (the super-admin "Run assignment" button).
   Idempotent: only fills an owner that is currently null, and notification ids
   are deterministic so a re-run never duplicates an action item.
   ========================================================================= */

import type { Client, Csm, Deal } from "@/lib/types";
import { roleLabel as labelFor, type Role } from "@/lib/roles";
import { dealOverridesMap, applyDealOverrides } from "@/lib/deal-overrides";
import { getRoleLabels, getSuperAdminEmails, getTeamMembers, type TeamMember } from "@/lib/data";
import { getCsmAssignmentConfig, getImplementationAssignmentConfig } from "@/lib/assignment/config";
import {
  clientImplementationLevel,
  decideCsm,
  decideImplementation,
  normalizeLevel,
  type Candidate,
} from "@/lib/assignment/engine";
import type { AssignmentDecision } from "@/lib/assignment/types";

export interface AssignmentRunSummary {
  processed: number;
  csmAssigned: number;
  implAssigned: number;
  needsAdmin: number;
  noCandidates: number;
}

const EMPTY: AssignmentRunSummary = { processed: 0, csmAssigned: 0, implAssigned: 0, needsAdmin: 0, noCandidates: 0 };

/** Account Executive = the owner of the client's latest tracked deal. */
function accountExecutive(deals: Deal[]): { name: string | null; email: string | null } {
  const tracked = deals.filter((d) => d.tracked !== false && (d.ownerName || d.ownerEmail));
  tracked.sort((a, b) => (b.closeDate ?? "").localeCompare(a.closeDate ?? ""));
  const ae = tracked[0] ?? deals.find((d) => d.ownerName || d.ownerEmail);
  return { name: ae?.ownerName ?? null, email: ae?.ownerEmail ?? null };
}

export async function runAssignment(targetIds?: string[]): Promise<AssignmentRunSummary> {
  const { hasDatabase } = await import("@/lib/config");
  if (!hasDatabase()) return EMPTY;

  const {
    getClientsFromDb,
    getAllDealsFromDb,
    assignCsmToClient,
    assignImplementationOwnerToClient,
    insertNotificationsDb,
  } = await import("@/lib/repo/drizzle");

  const [allClients, allDeals, csmConfig, implConfig, members, superAdmins, roleLabels] = await Promise.all([
    getClientsFromDb(),
    getAllDealsFromDb(),
    getCsmAssignmentConfig(),
    getImplementationAssignmentConfig(),
    getTeamMembers(),
    getSuperAdminEmails(),
    getRoleLabels(),
  ]);

  if (!csmConfig.enabled && !implConfig.enabled) return EMPTY;

  const membersByEmail = new Map<string, TeamMember>(members.map((m) => [m.email, m]));
  const candidates: Candidate[] = members.map((m) => ({ email: m.email, role: m.role }));

  // Deals grouped per client, with each client's own __deal_overrides applied —
  // otherwise a CSM's inline edit to implementation level / support level /
  // Account Executive on the deal card would be invisible to tie-breaking and
  // capacity math below, even though the deal card itself shows the edit.
  const overridesByClientId = new Map(allClients.map((c) => [c.id, dealOverridesMap(c.properties)]));
  const dealsByClient = new Map<string, Deal[]>();
  for (const d of allDeals) {
    const effective = applyDealOverrides(d, overridesByClientId.get(d.clientId)?.[d.id]);
    const arr = dealsByClient.get(d.clientId);
    if (arr) arr.push(effective);
    else dealsByClient.set(d.clientId, [effective]);
  }
  const levelOf = (clientId: string): string | null =>
    clientImplementationLevel(dealsByClient.get(clientId) ?? []);

  // Current load: managed ARR per CSM, and per-implementer account counts keyed
  // by the (normalized) implementation level — the implementation tie-break is
  // "fewest accounts at the client's level" (White Glove being the heaviest).
  const managedArr = new Map<string, number>();
  const levelCount = new Map<string, Map<string, number>>(); // email → level → count
  for (const c of allClients) {
    if (c.status === "churned") continue;
    if (c.csm?.email) {
      const e = c.csm.email.toLowerCase();
      managedArr.set(e, (managedArr.get(e) ?? 0) + (c.arr ?? 0));
    }
    if (c.implementationOwner?.email) {
      const e = c.implementationOwner.email.toLowerCase();
      const lvl = normalizeLevel(levelOf(c.id));
      const m = levelCount.get(e) ?? new Map<string, number>();
      m.set(lvl, (m.get(lvl) ?? 0) + 1);
      levelCount.set(e, m);
    }
  }
  const managedArrOf = (email: string) => managedArr.get(email.toLowerCase()) ?? 0;
  const levelCountOf = (email: string, level: string) =>
    levelCount.get(email.toLowerCase())?.get(normalizeLevel(level)) ?? 0;

  // Targets: the given ids, else every non-churned client missing an owner
  // (a brand-new company is "onboarding", not "active" — it still needs a
  // CSM assigned, so this must not be narrowed to the "active" status alone).
  const byId = new Map(allClients.map((c) => [c.id, c]));
  const targets: Client[] = (targetIds ? targetIds.map((id) => byId.get(id)).filter((c): c is Client => !!c) : allClients).filter(
    (c) => c.status !== "churned" && (!c.csm || !c.implementationOwner),
  );

  const notifications: Parameters<typeof insertNotificationsDb>[0] = [];
  const summary: AssignmentRunSummary = { ...EMPTY };

  const lbl = (role: Role | null) => labelFor(role, roleLabels);

  for (const client of targets) {
    summary.processed++;
    const level = levelOf(client.id);
    const ae = accountExecutive(dealsByClient.get(client.id) ?? []);

    // ---- CSM ----
    if (csmConfig.enabled && !client.csm) {
      const decision = decideCsm(client.arr ?? 0, candidates, csmConfig, managedArrOf);
      const owner = applyDecision(client, decision, membersByEmail, "csm");
      if (owner) {
        await assignCsmToClient(client.id, owner, "auto");
        managedArr.set(owner.email!.toLowerCase(), managedArrOf(owner.email!) + (client.arr ?? 0));
        client.csm = owner;
        summary.csmAssigned++;
      }
      pushNotifications(notifications, { client, decision, owner, membersByEmail, superAdmins, ae, lbl, summary });
    }

    // ---- Implementation ----
    if (implConfig.enabled && !client.implementationOwner) {
      const decision = decideImplementation(level, candidates, implConfig, (email) => levelCountOf(email, level ?? ""));
      const owner = applyDecision(client, decision, membersByEmail, "implementation");
      if (owner) {
        await assignImplementationOwnerToClient(client.id, owner, "auto");
        const e = owner.email!.toLowerCase();
        const m = levelCount.get(e) ?? new Map<string, number>();
        const k = normalizeLevel(level);
        m.set(k, (m.get(k) ?? 0) + 1);
        levelCount.set(e, m);
        client.implementationOwner = owner;
        summary.implAssigned++;
      }
      pushNotifications(notifications, { client, decision, owner, membersByEmail, superAdmins, ae, lbl, summary, level });
    }
  }

  if (notifications.length) await insertNotificationsDb(notifications);
  return summary;
}

/** Resolve a decision to the owner identity to persist, or null. */
function applyDecision(
  client: Client,
  decision: AssignmentDecision,
  membersByEmail: Map<string, TeamMember>,
  _team: "csm" | "implementation",
): Csm | null {
  void client;
  void _team;
  if (decision.status !== "assigned" || !decision.ownerEmail) return null;
  return membersByEmail.get(decision.ownerEmail)?.identity ?? null;
}

interface NotifyCtx {
  client: Client;
  decision: AssignmentDecision;
  owner: Csm | null;
  membersByEmail: Map<string, TeamMember>;
  superAdmins: string[];
  ae: { name: string | null; email: string | null };
  lbl: (role: Role | null) => string;
  summary: AssignmentRunSummary;
  level?: string | null;
}

function pushNotifications(out: Parameters<typeof import("@/lib/repo/drizzle").insertNotificationsDb>[0], ctx: NotifyCtx) {
  const { client, decision, owner, superAdmins, ae, lbl, summary } = ctx;
  const teamWord = decision.team === "csm" ? "CSM" : "Implementation";
  const roleWord = lbl(decision.role);

  if (decision.status === "assigned" && owner) {
    // Super-admins: review/override (one per client+team+admin — the id must
    // include the recipient or onConflictDoNothing would drop all but the first).
    for (const admin of superAdmins) {
      out.push({
        id: `nt-review-${decision.team}-${client.id}-${admin}`,
        recipientEmail: admin,
        type: "assignment_review",
        title: `${client.name} → ${teamWord}: ${owner.name}`,
        body: `Auto-assigned ${owner.name} (${roleWord}) as ${teamWord}. Review or reassign if needed.`,
        clientId: client.id,
      });
    }
    // The assignee: contact the AE to set the kick-off meeting.
    const aePart = ae.name ? ` (${ae.name}${ae.email ? `, ${ae.email}` : ""})` : "";
    out.push({
      id: `nt-assigned-${decision.team}-${client.id}`,
      recipientEmail: owner.email!,
      type: "client_assigned",
      title: `New client assigned: ${client.name}`,
      body: `You're the ${teamWord} for ${client.name}. Contact the Account Executive${aePart} to set the kick-off meeting date.`,
      clientId: client.id,
    });
    return;
  }

  if (decision.status === "needs_admin") {
    summary.needsAdmin++;
    const names = decision.tied
      .map((e) => ctx.membersByEmail.get(e)?.name ?? e)
      .join(", ");
    for (const admin of superAdmins) {
      out.push({
        id: `nt-needsadmin-${decision.team}-${client.id}-${admin}`,
        recipientEmail: admin,
        type: "assignment_needs_admin",
        title: `Choose a ${teamWord} owner: ${client.name}`,
        body: `${decision.reason}${names ? ` Candidates: ${names}.` : ""} Assign manually on the client profile.`,
        clientId: client.id,
      });
    }
    return;
  }

  if (decision.status === "no_candidates") {
    summary.noCandidates++;
    for (const admin of superAdmins) {
      out.push({
        id: `nt-nocand-${decision.team}-${client.id}-${admin}`,
        recipientEmail: admin,
        type: "assignment_needs_admin",
        title: `No ${teamWord} available: ${client.name}`,
        body: `${decision.reason} Add a team member with the ${roleWord} role, or assign manually on the client profile.`,
        clientId: client.id,
      });
    }
  }
}
