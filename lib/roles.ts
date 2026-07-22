/* =========================================================================
   User roles — the app's permission tiers. Import-safe from both client and
   server (pure data, no Clerk/DB imports).

   The user list offers exactly FOUR flat permission categories:

     super_admin  — the crown: manage admins, integrations, destructive actions.
     admin        — runs the workspace: manage members & config, see + edit all
                    clients; can't escalate (touch admins) or infra.
     operator     — does the work: sees + edits ONLY the accounts they own
                    (matched by email, either owner slot).
     guest        — read-only: sees every account, edits nothing.

   A person's job TITLE (e.g. "Strategic CSM", "Growth Lead") is free text on
   their record, NOT a permission — see app_users.title.

   The granular tiers below (strategic_csm … implementation_manager) are LEGACY:
   they all resolve to the "operator" permission (see permissionTier) and are no
   longer offered in the picker, but remain valid values so existing rows resolve
   and the assignment-routing config can still target a seniority band.

   Note: "Account Executive" is a deal-level field only (HubSpot's
   `account_executive` deal property, synced into Deal.ownerName/ownerEmail —
   see lib/integrations/hubspot.ts and lib/integrations/sync.ts). There is no
   account-executive user role or team; that scaffolding (an account-level,
   manually-assigned AE list) was removed since nothing ever wrote to it and
   no user was ever assigned it.
   ========================================================================= */

export const ROLES = [
  // The four PERMISSION tiers — the only categories offered in the user list.
  "super_admin",
  "admin",
  "operator",
  "guest",
  // Legacy granular operator tiers. No longer offered as a permission (they all
  // resolve to the "operator" tier via permissionTier), but kept as valid values
  // so existing rows resolve AND so the assignment-routing config
  // (WorkflowManager capacity bands, health.ts) can still target a seniority tier.
  "strategic_csm",
  "senior_csm",
  "csm_officer",
  "implementation_officer",
  "implementation_manager",
] as const;

export type Role = (typeof ROLES)[number];

/** Fallback labels used when no workspace-level overrides have been saved. */
export const DEFAULT_ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  operator: "Operator",
  guest: "Guest",
  strategic_csm: "Strategic CSM",
  senior_csm: "Senior CSM",
  csm_officer: "CSM Officer",
  implementation_officer: "Implementation Officer",
  implementation_manager: "Implementation Manager",
};

/* -------------------------------------------------------------------------
   Permission TIERS — the four-level model the UI groups roles by:

     super_admin  the crown: manage admins, integrations, destructive actions
     admin        runs the workspace: manage members & config, edit all data,
                  but can't escalate (create/edit admins) or touch infra
     operator     owns and edits their own accounts (the CSM/Implementation
                  tiers — kept granular because assignment routing needs them)
     guest        read-only, sees everything, edits nothing

   Neither admin nor guest belongs to a team (like super_admin).
   ------------------------------------------------------------------------- */
export type PermissionTier = "super_admin" | "admin" | "operator" | "guest";

export function permissionTier(role: Role): PermissionTier {
  if (role === "super_admin") return "super_admin";
  if (role === "admin") return "admin";
  if (role === "guest") return "guest";
  return "operator"; // "operator" itself + every legacy granular tier
}

/** The four permission categories a person can be assigned in the user list —
 *  flat, no sub-roles. A person's job title lives in their `title`, not here. */
export const PERMISSION_ROLES: Role[] = ["super_admin", "admin", "operator", "guest"];

/** Collapse any role (incl. legacy granular tiers) to the flat permission
 *  category it belongs to — the value the user-list dropdown should show. */
export function permissionRole(role: Role | null): Role {
  return role ? (permissionTier(role) as Role) : "operator";
}

/** Roles that SEE every client — derived from the permission tier so the flat
 *  `operator` and every legacy granular tier behave identically. */
export function seesAllClients(role: Role | null): boolean {
  if (!role) return false;
  const t = permissionTier(role);
  return t === "super_admin" || t === "admin" || t === "guest";
}

/** Roles that may EDIT any client — narrower than seesAllClients (guest sees
 *  all, edits none; operators edit only what they own). */
export function editsAllClients(role: Role | null): boolean {
  if (!role) return false;
  const t = permissionTier(role);
  return t === "super_admin" || t === "admin";
}

/** UI grouping for the role picker — flat, the four permission categories only. */
export const ROLE_GROUPS: { label: string | null; roles: Role[] }[] = [
  { label: null, roles: PERMISSION_ROLES },
];

/* -------------------------------------------------------------------------
   Member-facing derivations — descriptions, capability summaries and access
   scope. Everything here is DERIVED from the same boolean gates auth uses
   (seesAllClients / editsAllClients / permissionTier) so the words shown in
   the UI can never claim a permission the backend doesn't enforce.
   ------------------------------------------------------------------------- */

/** How much of the account book a member can reach. Distinct from `role`:
 *  a role sets the default, but scope can be narrowed to specific accounts. */
export type AccessScope = "assigned" | "selected" | "all";

/** Membership state — NOT a role. "No access" is the absence of membership. */
export type MemberStatus = "active" | "invited" | "suspended";

/** One-line role description, verified against lib/auth.ts. Keyed by the flat
 *  permission tier; a legacy granular role resolves through permissionTier. */
export function roleDescription(role: Role): string {
  switch (permissionTier(role)) {
    case "super_admin":
      return "Full access to every account, plus members, settings and integrations.";
    case "admin":
      return "Manages accounts, members and most settings — excludes admins and integrations.";
    case "operator":
      return "Works their own accounts: sees and edits only accounts assigned to them.";
    case "guest":
      return "View-only access to permitted accounts. Makes no changes.";
  }
}

/** Default access scope for a role — matches how auth actually scopes today. */
export function defaultScopeForRole(role: Role): AccessScope {
  const t = permissionTier(role);
  if (t === "operator") return "assigned"; // owns-only in scopeClientsToUser
  return "all"; // super_admin / admin / guest all see the whole book
}

/** Scopes a role is ALLOWED to hold. A super-admin is always all-accounts;
 *  everyone else may be narrowed to selected accounts. */
export function allowedScopesForRole(role: Role): AccessScope[] {
  const t = permissionTier(role);
  if (t === "super_admin") return ["all"];
  if (t === "operator") return ["assigned", "selected"];
  return ["all", "selected"]; // admin, guest
}

export const SCOPE_LABELS: Record<AccessScope, string> = {
  assigned: "Assigned accounts only",
  selected: "Selected accounts",
  all: "All accounts",
};

/**
 * Concrete capability summary for a role — generated from the real gates, so
 * it stays in lock-step with authorization. Feeds the drawer's
 * "This member will be able to / will not be able to" block.
 */
export function permissionCapabilities(role: Role): { can: string[]; cannot: string[] } {
  const t = permissionTier(role);
  const seesAll = seesAllClients(role); // super, admin, guest
  const editsAll = editsAllClients(role); // super, admin
  const owns = t === "operator";
  const manages = t === "super_admin" || t === "admin"; // isAdminOrSuper
  const crown = t === "super_admin"; // isSuperAdmin

  const can: string[] = [];
  const cannot: string[] = [];

  can.push(seesAll ? "View all accounts" : "View accounts assigned to them");
  if (editsAll) can.push("Edit any account's information");
  else if (owns) can.push("Update accounts they own");
  else cannot.push("Edit account information");

  if (t !== "guest") can.push("Create and complete actions");
  else cannot.push("Create or change actions");

  if (manages) can.push(crown ? "Manage all members, including admins" : "Manage members (except admins)");
  else cannot.push("Manage members");

  if (crown) can.push("Change system settings and integrations");
  else if (manages) { can.push("Change most settings"); cannot.push("Manage admins or integrations"); }
  else cannot.push("Change system settings");

  if (!seesAll) cannot.push("Access unassigned accounts");

  return { can, cannot };
}

/** Alias kept for any remaining direct imports. */
export const ROLE_LABELS = DEFAULT_ROLE_LABELS;

/* -------------------------------------------------------------------------
   Teams — non-admin roles belong to one of two teams. A client has a separate
   owner per team (the CSM owner and the Implementation owner); scoping and the
   assignment workflows both branch on team. super_admin belongs to no team.
   ------------------------------------------------------------------------- */

export type Team = "csm" | "implementation";

export const TEAM_LABELS: Record<Team, string> = {
  csm: "Customer Success",
  implementation: "Implementation",
};

/** CSM-team role tiers, ordered low → high seniority. */
export const CSM_TEAM_ROLES = ["csm_officer", "senior_csm", "strategic_csm"] as const;

/** Implementation-team role tiers, ordered low → high seniority. */
export const IMPLEMENTATION_TEAM_ROLES = ["implementation_officer", "implementation_manager"] as const;

/** Which team each role belongs to (super_admin → null). */
export const ROLE_TEAM: Record<Role, Team | null> = {
  super_admin: null,
  admin: null,
  operator: null, // flat operators belong to no fixed team — assignable to either owner slot
  guest: null,
  strategic_csm: "csm",
  senior_csm: "csm",
  csm_officer: "csm",
  implementation_officer: "implementation",
  implementation_manager: "implementation",
};

export function teamForRole(role: Role | null): Team | null {
  return role ? ROLE_TEAM[role] : null;
}

/** Roles that belong to the given team, low → high seniority. */
export function rolesForTeam(team: Team): readonly Role[] {
  switch (team) {
    case "csm":
      return CSM_TEAM_ROLES;
    case "implementation":
      return IMPLEMENTATION_TEAM_ROLES;
  }
}

/** All non-admin role tiers across both teams. */
export const CSM_ROLES: Role[] = [...CSM_TEAM_ROLES, ...IMPLEMENTATION_TEAM_ROLES];

/** Default role for a signed-in user with no explicit assignment — the flat
 *  operator tier (owns-only visibility; least privilege). */
export const DEFAULT_ROLE: Role = "operator";

export function isRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}

/**
 * Resolve the display label for a role.
 * Pass `customLabels` (from getRoleLabels()) to respect workspace overrides.
 */
export function roleLabel(role: Role | null, customLabels?: Record<string, string>): string {
  if (!role) return "No access";
  return customLabels?.[role] ?? DEFAULT_ROLE_LABELS[role] ?? role;
}
