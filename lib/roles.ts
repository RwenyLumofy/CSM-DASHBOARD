/* =========================================================================
   User roles — the app's permission tiers. Import-safe from both client and
   server (pure data, no Clerk/DB imports).

     super_admin              — full access: all clients, manage props/users/roles.
     strategic_csm            ┐
     senior_csm               │ CSM tiers: see ONLY their own clients (matched by
     csm_officer              ├ email), cannot edit default props or create new
     implementation_officer   │ props. All tiers share the same permissions today;
     implementation_manager   ┘ labels are configurable by super-admins in Settings.

   Note: "Account Executive" is a deal-level field only (HubSpot's
   `account_executive` deal property, synced into Deal.ownerName/ownerEmail —
   see lib/integrations/hubspot.ts and lib/integrations/sync.ts). There is no
   account-executive user role or team; that scaffolding (an account-level,
   manually-assigned AE list) was removed since nothing ever wrote to it and
   no user was ever assigned it.
   ========================================================================= */

export const ROLES = [
  "super_admin",
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
  strategic_csm: "Strategic CSM",
  senior_csm: "Senior CSM",
  csm_officer: "CSM Officer",
  implementation_officer: "Implementation Officer",
  implementation_manager: "Implementation Manager",
};

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

/** Default role for a signed-in user with no explicit assignment. */
export const DEFAULT_ROLE: Role = "csm_officer";

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
