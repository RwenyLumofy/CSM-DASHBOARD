"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Lock, Loader2, AlertTriangle, ShieldCheck, Check } from "lucide-react";
import { ROLE_GROUPS, DEFAULT_ROLE_LABELS, permissionRole, type Role } from "@/lib/roles";
import { Avatar } from "@/components/ui/Avatar";
import { addOrUpdateUserAction, removeUserAction } from "@/app/(app)/settings/user-actions";

interface AppUser {
  email: string;
  name: string | null;
  role: Role;
  title: string | null;
  department: string | null;
  bootstrap: boolean;
}

function initialsOf(u: AppUser): string {
  const base = (u.name ?? u.email).trim();
  const parts = base.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || base.slice(0, 2).toUpperCase();
}

function label(role: string, roleLabels: Record<string, string>) {
  return roleLabels[role] ?? DEFAULT_ROLE_LABELS[role as Role] ?? role;
}

/** The <option>s for a role <select>, grouped into the permission tiers
 *  (Super Admin / Admin / Operators / Guest). */
function RoleOptions({ roleLabels }: { roleLabels: Record<string, string> }) {
  return (
    <>
      {ROLE_GROUPS.map((g, i) =>
        g.label ? (
          <optgroup key={g.label} label={g.label}>
            {g.roles.map((r) => (
              <option key={r} value={r}>{label(r, roleLabels)}</option>
            ))}
          </optgroup>
        ) : (
          g.roles.map((r) => (
            <option key={`${i}-${r}`} value={r}>{label(r, roleLabels)}</option>
          ))
        ),
      )}
    </>
  );
}

export function UsersManager({
  initialUsers,
  currentUserEmail,
  roleLabels = DEFAULT_ROLE_LABELS,
}: {
  initialUsers: AppUser[];
  currentUserEmail: string | null;
  roleLabels?: Record<string, string>;
}) {
  const router = useRouter();

  // Local role/name edits — only committed to server when Save is clicked.
  const [pendingRoles, setPendingRoles] = useState<Record<string, Role>>({});
  const [pendingNames, setPendingNames] = useState<Record<string, string>>({});
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [savedEmail, setSavedEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<{ email: string; name: string; title: string; department: string; role: Role }>({
    email: "", name: "", title: "", department: "", role: "operator",
  });

  // Always display one of the four flat permission categories — a legacy
  // granular role (e.g. csm_officer) collapses to its tier (operator).
  function currentRole(u: AppUser): Role {
    return pendingRoles[u.email] ?? permissionRole(u.role);
  }

  function currentName(u: AppUser): string {
    return pendingNames[u.email] ?? u.name ?? "";
  }

  function isDirty(u: AppUser): boolean {
    const roleDirty = pendingRoles[u.email] !== undefined && pendingRoles[u.email] !== permissionRole(u.role);
    const nameDirty = pendingNames[u.email] !== undefined && pendingNames[u.email] !== (u.name ?? "");
    return roleDirty || nameDirty;
  }

  async function saveUser(u: AppUser) {
    setBusyEmail(u.email);
    setError(null);
    try {
      const r = await addOrUpdateUserAction({ email: u.email, name: currentName(u), role: currentRole(u) });
      if (!r.ok) {
        setError(r.error ?? "Something went wrong.");
      } else {
        setSavedEmail(u.email);
        setTimeout(() => setSavedEmail(null), 2000);
        // Clear pending so the row is no longer dirty.
        setPendingRoles((prev) => {
          const next = { ...prev };
          delete next[u.email];
          return next;
        });
        setPendingNames((prev) => {
          const next = { ...prev };
          delete next[u.email];
          return next;
        });
        router.refresh();
      }
    } finally {
      setBusyEmail(null);
    }
  }

  async function remove(u: AppUser) {
    setBusyEmail(u.email);
    setError(null);
    try {
      const r = await removeUserAction(u.email);
      if (!r.ok) setError(r.error ?? "Something went wrong.");
      else router.refresh();
    } finally {
      setBusyEmail(null);
    }
  }

  async function add() {
    setBusyEmail("__add__");
    setError(null);
    try {
      const r = await addOrUpdateUserAction(form);
      if (!r.ok) {
        setError(r.error ?? "Something went wrong.");
      } else {
        setForm({ email: "", name: "", title: "", department: "", role: "csm_officer" });
        setAdding(false);
        router.refresh();
      }
    } finally {
      setBusyEmail(null);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-[#B23A57]/30 bg-[#B23A57]/8 px-3 py-2.5 font-body text-[12.5px] text-[#B23A57]">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <ul className="flex flex-col divide-y divide-border-subtle">
        {initialUsers.map((u) => {
          const busy = busyEmail === u.email;
          const dirty = isDirty(u);
          const saved = savedEmail === u.email;
          const isSelf = currentUserEmail != null && u.email === currentUserEmail;

          return (
            <li key={u.email} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
              <Avatar initials={initialsOf(u)} tone={u.role === "super_admin" ? "sirius" : undefined} size={32} />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {u.bootstrap ? (
                    <span className="truncate font-body text-[13px] font-semibold text-fg">{u.name ?? u.email}</span>
                  ) : (
                    <input
                      type="text"
                      value={currentName(u)}
                      onChange={(e) => setPendingNames((prev) => ({ ...prev, [u.email]: e.target.value }))}
                      placeholder={u.email}
                      disabled={busy}
                      className="-mx-1 min-w-0 flex-1 truncate rounded-md border border-transparent bg-transparent px-1 font-body text-[13px] font-semibold text-fg outline-none transition-colors hover:border-border focus:border-border focus:bg-surface focus:ring-2 focus:ring-sirius disabled:opacity-50"
                    />
                  )}
                  {isSelf && (
                    <span className="shrink-0 rounded bg-bg-muted px-1.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-fg-subtle">
                      You
                    </span>
                  )}
                </div>
                {(u.title || u.department) && (
                  <span className="caption block truncate">{[u.title, u.department].filter(Boolean).join(" · ")}</span>
                )}
                {currentName(u) && <span className="caption block truncate">{u.email}</span>}
              </div>

              {u.bootstrap ? (
                <span className="inline-flex items-center gap-1.5 rounded-pill bg-accent-soft px-2.5 py-1 font-body text-[12px] font-semibold text-sirius">
                  <ShieldCheck size={13} />
                  {label(u.role, roleLabels)}
                  <Lock size={11} className="text-sirius/70" />
                </span>
              ) : (
                <>
                  <select
                    value={currentRole(u)}
                    disabled={busy}
                    onChange={(e) =>
                      setPendingRoles((prev) => ({ ...prev, [u.email]: e.target.value as Role }))
                    }
                    className="rounded-lg border border-border bg-surface px-2.5 py-1.5 font-body text-[12.5px] font-semibold text-fg outline-none ring-sirius focus:ring-2 disabled:opacity-50"
                  >
                    <RoleOptions roleLabels={roleLabels} />
                  </select>

                  {/* Save button — visible only when role was changed */}
                  {dirty && (
                    <button
                      type="button"
                      onClick={() => saveUser(u)}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-sirius px-3 py-1.5 font-body text-[12.5px] font-semibold text-white transition-opacity disabled:opacity-50"
                    >
                      {busy ? <Loader2 size={13} className="animate-spin" /> : "Save"}
                    </button>
                  )}

                  {/* Saved confirmation */}
                  {saved && !dirty && (
                    <span className="flex items-center gap-1 font-body text-[12px] text-[#2DB47A]">
                      <Check size={13} /> Saved
                    </span>
                  )}

                  {/* Remove button */}
                  <button
                    type="button"
                    onClick={() => remove(u)}
                    disabled={busy}
                    title="Remove user"
                    className="grid size-8 shrink-0 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-[#B23A57]/10 hover:text-[#B23A57] disabled:opacity-50"
                  >
                    {busy && !dirty ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>

      {/* Add user */}
      <div className="mt-4 border-t border-border-subtle pt-4">
        {adding ? (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                autoFocus
                type="email"
                placeholder="email@company.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="rounded-lg border border-border bg-surface px-3 py-2 font-body text-sm text-fg outline-none ring-sirius focus:ring-2"
              />
              <input
                type="text"
                placeholder="Name (optional)"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="rounded-lg border border-border bg-surface px-3 py-2 font-body text-sm text-fg outline-none ring-sirius focus:ring-2"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <input
                type="text"
                placeholder="Title (e.g. Growth Lead)"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="rounded-lg border border-border bg-surface px-3 py-2 font-body text-sm text-fg outline-none ring-sirius focus:ring-2"
              />
              <input
                type="text"
                placeholder="Department (e.g. Marketing)"
                value={form.department}
                onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                className="rounded-lg border border-border bg-surface px-3 py-2 font-body text-sm text-fg outline-none ring-sirius focus:ring-2"
              />
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}
                title="Permission"
                className="rounded-lg border border-border bg-surface px-3 py-2 font-body text-sm text-fg outline-none ring-sirius focus:ring-2"
              >
                <RoleOptions roleLabels={roleLabels} />
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={add}
                disabled={busyEmail === "__add__" || !form.email.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-sirius px-4 py-2 font-body text-sm font-semibold text-white transition-opacity disabled:opacity-40"
              >
                {busyEmail === "__add__" ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                Add user
              </button>
              <button
                type="button"
                onClick={() => { setAdding(false); setError(null); }}
                className="rounded-lg border border-border px-4 py-2 font-body text-sm font-medium text-fg-muted transition-colors hover:text-fg"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 self-start rounded-lg border border-dashed border-border px-4 py-2.5 font-body text-sm font-medium text-fg-muted transition-colors hover:border-sirius hover:text-sirius"
          >
            <Plus size={15} /> Add user
          </button>
        )}
      </div>
    </div>
  );
}
