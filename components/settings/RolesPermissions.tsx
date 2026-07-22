"use client";

/* =========================================================================
   Roles & permissions — the four permission categories, their descriptions,
   how many members hold each, and the ability to RENAME a role's label.

   Renaming changes only the display label; the internal key and the
   permissions it grants are fixed (defined in lib/auth.ts). This screen never
   implies that permission rules can be edited — because they can't be here.
   ========================================================================= */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, Pencil, X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  PERMISSION_ROLES, DEFAULT_ROLE_LABELS, roleDescription, permissionCapabilities, type Role,
} from "@/lib/roles";
import { setRoleLabelsAction } from "@/app/(app)/settings/role-label-actions";

export function RolesPermissions({
  initialLabels,
  memberCounts,
  canEdit,
}: {
  initialLabels: Record<string, string>;
  memberCounts: Record<string, number>; // by permission key
  canEdit: boolean;
}) {
  const router = useRouter();
  const [labels, setLabels] = useState<Record<string, string>>(initialLabels);
  const [editKey, setEditKey] = useState<Role | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<Role | null>(null);

  async function saveName(role: Role) {
    setBusy(role);
    const next = { ...labels, [role]: draft.trim() || DEFAULT_ROLE_LABELS[role] };
    const r = await setRoleLabelsAction(next);
    setBusy(null);
    if (r.ok) {
      setLabels(next);
      setEditKey(null);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="font-body text-[12.5px] text-fg-muted">
        Renaming a role changes only its label across Signal — never the permissions it grants. The internal key and
        access rules are fixed.
      </p>

      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        {PERMISSION_ROLES.map((role, i) => {
          const custom = labels[role] ?? DEFAULT_ROLE_LABELS[role];
          const caps = permissionCapabilities(role);
          const count = memberCounts[role] ?? 0;
          const editing = editKey === role;
          const renamable = role !== "super_admin"; // super_admin label stays fixed
          return (
            <div key={role} className={cn("p-4", i > 0 && "border-t border-border-subtle")}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  {editing ? (
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder={DEFAULT_ROLE_LABELS[role]}
                        className="rounded-lg border border-border bg-bg px-2.5 py-1.5 font-body text-[13.5px] font-semibold text-fg outline-none ring-sirius focus:ring-2"
                      />
                      <button type="button" onClick={() => saveName(role)} disabled={busy === role} className="grid size-8 place-items-center rounded-md bg-sirius text-white disabled:opacity-50">
                        {busy === role ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      </button>
                      <button type="button" onClick={() => setEditKey(null)} className="grid size-8 place-items-center rounded-md text-fg-muted hover:bg-bg-muted"><X size={14} /></button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-[14.5px] font-semibold text-fg">{custom}</h3>
                      {canEdit && renamable && (
                        <button
                          type="button"
                          onClick={() => { setEditKey(role); setDraft(custom === DEFAULT_ROLE_LABELS[role] ? "" : custom); }}
                          aria-label={`Rename ${custom}`}
                          className="grid size-6 place-items-center rounded text-fg-subtle transition-colors hover:bg-bg-muted hover:text-fg"
                        >
                          <Pencil size={12} />
                        </button>
                      )}
                    </div>
                  )}
                  <p className="mt-1 font-body text-[12.5px] text-fg-muted">{roleDescription(role)}</p>
                  <p className="mt-1 font-body text-[11px] text-fg-subtle">
                    Internal key: <code className="rounded bg-bg-muted px-1 py-0.5">{role}</code>
                  </p>
                </div>
                <span className="shrink-0 rounded-pill bg-bg-muted px-2.5 py-1 font-body text-[12px] font-semibold text-fg-muted">
                  {count} {count === 1 ? "member" : "members"}
                </span>
              </div>

              {/* Permission summary */}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {caps.can.map((c) => (
                  <span key={c} className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-muted/50 px-2 py-0.5 font-body text-[11px] text-fg-muted">
                    <Check size={11} className="text-[#2DB47A]" /> {c}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
