"use client";

/* =========================================================================
   Members area — separates the three concepts that used to be stacked on one
   page, behind clearly-labelled secondary tabs (default: Members):

     Members             → who can sign in and what they can do
     Roles & permissions → the role labels + what each role grants
     People directory     → the wider Lumofy directory (may have no login)

   Secondary tabs (not routes) so this is safe to introduce in one iteration.
   ========================================================================= */

import { useState } from "react";
import { Users, ShieldCheck, Contact } from "lucide-react";
import { cn } from "@/lib/cn";
import { MembersManager, type Member, type Account } from "@/components/settings/MembersManager";
import { RolesPermissions } from "@/components/settings/RolesPermissions";
import { LumofyStaffManager, type LumofyStaffMember } from "@/components/settings/LumofyStaffManager";

type Sub = "members" | "roles" | "directory";

export function MembersArea({
  members,
  currentUserEmail,
  roleLabels,
  canGrantCrown,
  memberCounts,
  accounts,
  lumofyStaff,
  directoryPermissions,
  lockedEmails,
  memberEmails,
}: {
  members: Member[];
  currentUserEmail: string | null;
  roleLabels: Record<string, string>;
  canGrantCrown: boolean;
  memberCounts: Record<string, number>;
  accounts: Account[];
  lumofyStaff: LumofyStaffMember[];
  directoryPermissions: Record<string, string>;
  lockedEmails: string[];
  memberEmails: string[];
}) {
  const [sub, setSub] = useState<Sub>("members");

  const tabs: [Sub, string, typeof Users][] = [
    ["members", "Members", Users],
    ["roles", "Roles & permissions", ShieldCheck],
    ["directory", "People directory", Contact],
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Heading */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-fg">
            {sub === "members" ? "Members" : sub === "roles" ? "Roles & permissions" : "People directory"}
          </h2>
          <p className="mt-0.5 font-body text-[13px] text-fg-muted">
            {sub === "members"
              ? "Manage who can access Signal and what they can do."
              : sub === "roles"
                ? "Rename roles and see exactly what each one grants."
                : "The wider Lumofy directory used in stakeholder mapping — separate from who can sign in."}
          </p>
        </div>
      </div>

      {/* Secondary tabs */}
      <div className="inline-flex w-fit gap-1 rounded-xl border border-border bg-bg-muted/50 p-1">
        {tabs.map(([key, lbl, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSub(key)}
            aria-current={sub === key}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-body text-[12.5px] font-semibold transition-colors",
              sub === key ? "bg-surface text-sirius shadow-sm" : "text-fg-muted hover:text-fg",
            )}
          >
            <Icon size={14} /> {lbl}
          </button>
        ))}
      </div>

      {sub === "members" && (
        <MembersManager
          members={members}
          currentUserEmail={currentUserEmail}
          roleLabels={roleLabels}
          canGrantCrown={canGrantCrown}
          accounts={accounts}
        />
      )}

      {sub === "roles" && (
        <RolesPermissions initialLabels={roleLabels} memberCounts={memberCounts} canEdit={canGrantCrown} />
      )}

      {sub === "directory" && (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-border bg-accent-soft/30 px-4 py-3 font-body text-[12.5px] text-fg-muted">
            <span className="font-semibold text-fg">Directory profile</span> = a person used in stakeholder mapping and
            ownership. Giving them a permission below makes them a <span className="font-semibold text-fg">Signal member</span> who
            can sign in. “No access” keeps them directory-only — it’s a membership state, not a role.
          </div>
          <LumofyStaffManager
            initialStaff={lumofyStaff}
            permissions={directoryPermissions}
            locked={lockedEmails}
            roleLabels={roleLabels}
            memberEmails={memberEmails}
          />
        </div>
      )}
    </div>
  );
}
