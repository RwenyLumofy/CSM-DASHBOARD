"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Check, X, Users, Lock } from "lucide-react";
import { ROLE_GROUPS, permissionRole, isRole } from "@/lib/roles";
import { addOrUpdateUserAction, removeUserAction } from "@/app/(app)/settings/user-actions";
import { cn } from "@/lib/cn";

export interface LumofyStaffMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  jobTitle: string;
}

/* The Lumofy directory (name/title/email/phone) is also where a person's app
   PERMISSION is set now. A member can be directory-only ("No access") — usable
   in stakeholder mapping without logging in — or granted a role, which upserts
   them into app_users. All access writes reuse the existing, tested user
   actions; the directory profile still saves through its own endpoint, so
   stakeholder mapping is untouched. */

const NO_ACCESS = "none";

interface Props {
  initialStaff: LumofyStaffMember[];
  /** email (lowercased) → current role, for members who have login access. */
  permissions: Record<string, string>;
  /** emails (lowercased) whose access can't be changed (permanent super-admins). */
  locked: string[];
  roleLabels: Record<string, string>;
  /** emails (lowercased) that are Signal members — used to show a Directory/Member chip. */
  memberEmails?: string[];
}

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

const EMPTY: Omit<LumofyStaffMember, "id"> = { name: "", email: "", phone: "", jobTitle: "" };

export function LumofyStaffManager({ initialStaff, permissions, locked, roleLabels, memberEmails = [] }: Props) {
  const [staff, setStaff] = useState<LumofyStaffMember[]>(initialStaff);
  const [perms, setPerms] = useState<Record<string, string>>({ ...permissions });
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Omit<LumofyStaffMember, "id">>(EMPTY);
  const [addingNew, setAddingNew] = useState(false);
  const [newDraft, setNewDraft] = useState<Omit<LumofyStaffMember, "id">>(EMPTY);
  const [newPermission, setNewPermission] = useState<string>(NO_ACCESS);
  const [saving, setSaving] = useState(false);
  const [permBusy, setPermBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lockedSet = new Set(locked.map((e) => e.toLowerCase()));
  const memberSet = new Set(memberEmails.map((e) => e.toLowerCase()));

  async function persist(next: LumofyStaffMember[]) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/stakeholder-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "lumofy_staff", value: next }),
      });
      if (!res.ok) { setError("Save failed"); return false; }
      setStaff(next);
      return true;
    } catch { setError("Save failed"); return false; }
    finally { setSaving(false); }
  }

  async function saveEdit() {
    if (!editDraft.name.trim() || !editDraft.email.trim()) { setError("Name and email required"); return; }
    const next = staff.map((m) => (m.id === editId ? { id: editId!, ...editDraft } : m));
    if (await persist(next)) setEditId(null);
  }

  async function saveNew() {
    if (!newDraft.name.trim() || !newDraft.email.trim()) { setError("Name and email required"); return; }
    const member = { id: randomId(), ...newDraft };
    if (!(await persist([...staff, member]))) return;
    // Grant login access too, if a permission was picked for the new member.
    if (newPermission !== NO_ACCESS) {
      const res = await addOrUpdateUserAction({ email: member.email, name: member.name, role: newPermission });
      if (res.ok) setPerms((p) => ({ ...p, [member.email.toLowerCase()]: newPermission }));
      else setError(res.error ?? "Member added to the directory, but granting access failed.");
    }
    setAddingNew(false);
    setNewDraft(EMPTY);
    setNewPermission(NO_ACCESS);
  }

  async function remove(id: string) {
    if (!confirm("Remove this team member?")) return;
    await persist(staff.filter((m) => m.id !== id));
  }

  /** Grant / change / revoke a directory member's app access via the existing
   *  user actions — "No access" removes their app_users row. */
  async function setPermission(m: LumofyStaffMember, next: string) {
    const key = m.email.toLowerCase();
    setPermBusy(key);
    setError(null);
    try {
      const res =
        next === NO_ACCESS
          ? await removeUserAction(m.email)
          : await addOrUpdateUserAction({ email: m.email, name: m.name, role: next });
      if (!res.ok) { setError(res.error ?? "Couldn't update access"); return; }
      setPerms((p) => ({ ...p, [key]: next }));
    } finally {
      setPermBusy(null);
    }
  }

  function startEdit(m: LumofyStaffMember) {
    setEditId(m.id);
    setEditDraft({ name: m.name, email: m.email, phone: m.phone, jobTitle: m.jobTitle });
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error} <button type="button" onClick={() => setError(null)} className="ml-2 opacity-60 hover:opacity-100"><X size={12} className="inline" /></button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border">
        {staff.length === 0 && !addingNew && (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Users size={24} className="text-fg-muted/50" />
            <p className="font-body text-sm text-fg-muted">No team members yet. Add your first one below.</p>
          </div>
        )}
        {staff.map((m) => {
          const key = m.email.toLowerCase();
          const isLocked = lockedSet.has(key);
          // Normalise a legacy granular role (csm_officer, …) to its flat
          // permission category so the dropdown shows the right option.
          const rawPerm = perms[key] ?? NO_ACCESS;
          const perm = isRole(rawPerm) ? permissionRole(rawPerm) : rawPerm;
          return (
            <div key={m.id} className={cn("border-b border-border last:border-b-0", editId === m.id ? "bg-bg-muted/40" : "")}>
              {editId === m.id ? (
                <div className="p-4">
                  <StaffForm draft={editDraft} onChange={setEditDraft} />
                  <div className="mt-3 flex gap-2">
                    <button type="button" disabled={saving} onClick={saveEdit} className="flex items-center gap-1.5 rounded-lg bg-sirius px-4 py-1.5 font-body text-sm font-semibold text-white disabled:opacity-50">
                      <Check size={14} /> Save
                    </button>
                    <button type="button" disabled={saving} onClick={() => setEditId(null)} className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-1.5 font-body text-sm text-fg-muted hover:text-fg">
                      <X size={13} /> Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4 px-4 py-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft font-body text-[13px] font-bold text-sirius">
                    {m.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-body text-sm font-semibold text-fg">{m.name}</span>
                      <span className={cn(
                        "shrink-0 rounded-pill border px-1.5 py-0.5 font-body text-[10px] font-semibold uppercase tracking-[0.03em]",
                        memberSet.has(key) ? "border-sirius/30 text-sirius" : "border-border text-fg-subtle",
                      )}>
                        {memberSet.has(key) ? "Signal member" : "Directory only"}
                      </span>
                    </div>
                    <div className="font-body text-xs text-fg-muted">{m.jobTitle}</div>
                    <div className="font-body text-xs text-fg-muted">{m.email}{m.phone ? ` · ${m.phone}` : ""}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {isLocked ? (
                      <span className="flex items-center gap-1 rounded-md border border-border-strong px-2 py-1 font-body text-[11px] font-semibold text-fg-muted" title="Permanent super-admin — set in server config">
                        <Lock size={11} /> {roleLabels[perm] ?? "Super Admin"}
                      </span>
                    ) : (
                      <PermissionSelect
                        value={perm}
                        onChange={(v) => setPermission(m, v)}
                        roleLabels={roleLabels}
                        disabled={permBusy === key}
                      />
                    )}
                    <button type="button" onClick={() => startEdit(m)} className="grid size-7 place-items-center rounded-md text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg" title="Edit profile">
                      <Pencil size={13} />
                    </button>
                    <button type="button" onClick={() => remove(m.id)} className="grid size-7 place-items-center rounded-md text-fg-muted transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40" title="Remove from directory">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {addingNew && (
          <div className="border-t border-border bg-bg-muted/30 p-4">
            <StaffForm draft={newDraft} onChange={setNewDraft} />
            <div className="mt-3">
              <label className="mb-1 block font-body text-xs font-medium text-fg-muted">Permission</label>
              <PermissionSelect value={newPermission} onChange={setNewPermission} roleLabels={roleLabels} disabled={saving} />
              <p className="mt-1 font-body text-[11px] text-fg-muted">
                “No access” keeps them in the directory only. Any role grants login access at that level.
              </p>
            </div>
            <div className="mt-3 flex gap-2">
              <button type="button" disabled={saving} onClick={saveNew} className="flex items-center gap-1.5 rounded-lg bg-sirius px-4 py-1.5 font-body text-sm font-semibold text-white disabled:opacity-50">
                <Check size={14} /> Add member
              </button>
              <button type="button" disabled={saving} onClick={() => { setAddingNew(false); setNewDraft(EMPTY); setNewPermission(NO_ACCESS); }} className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-1.5 font-body text-sm text-fg-muted hover:text-fg">
                <X size={13} /> Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {!addingNew && (
        <button
          type="button"
          onClick={() => { setAddingNew(true); setEditId(null); }}
          className="flex items-center gap-2 self-start rounded-lg border border-dashed border-border px-4 py-2 font-body text-sm font-medium text-fg-muted transition-colors hover:border-sirius hover:text-sirius"
        >
          <Plus size={14} /> Add team member
        </button>
      )}
    </div>
  );
}

function PermissionSelect({
  value,
  onChange,
  roleLabels,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  roleLabels: Record<string, string>;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={cn(
        "rounded-lg border bg-surface px-2.5 py-1.5 font-body text-[12.5px] outline-none ring-sirius focus:ring-2 disabled:opacity-50",
        value === NO_ACCESS ? "border-border text-fg-muted" : "border-border-strong text-fg",
      )}
    >
      <option value={NO_ACCESS}>No access</option>
      {ROLE_GROUPS.map((g, i) =>
        g.label ? (
          <optgroup key={g.label} label={g.label}>
            {g.roles.map((r) => (
              <option key={r} value={r}>{roleLabels[r] ?? r}</option>
            ))}
          </optgroup>
        ) : (
          g.roles.map((r) => (
            <option key={`${i}-${r}`} value={r}>{roleLabels[r] ?? r}</option>
          ))
        ),
      )}
    </select>
  );
}

function StaffForm({ draft, onChange }: { draft: Omit<LumofyStaffMember, "id">; onChange: (v: Omit<LumofyStaffMember, "id">) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="mb-1 block font-body text-xs font-medium text-fg-muted">Full name *</label>
        <input className="w-full rounded-lg border border-border bg-bg px-3 py-1.5 font-body text-sm text-fg outline-none ring-sirius focus:ring-2"
          value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} placeholder="Ahmed Ali" />
      </div>
      <div>
        <label className="mb-1 block font-body text-xs font-medium text-fg-muted">Job title</label>
        <input className="w-full rounded-lg border border-border bg-bg px-3 py-1.5 font-body text-sm text-fg outline-none ring-sirius focus:ring-2"
          value={draft.jobTitle} onChange={(e) => onChange({ ...draft, jobTitle: e.target.value })} placeholder="Customer Success Manager" />
      </div>
      <div>
        <label className="mb-1 block font-body text-xs font-medium text-fg-muted">Email *</label>
        <input type="email" className="w-full rounded-lg border border-border bg-bg px-3 py-1.5 font-body text-sm text-fg outline-none ring-sirius focus:ring-2"
          value={draft.email} onChange={(e) => onChange({ ...draft, email: e.target.value })} placeholder="ahmed@lumofy.com" />
      </div>
      <div>
        <label className="mb-1 block font-body text-xs font-medium text-fg-muted">Phone</label>
        <input className="w-full rounded-lg border border-border bg-bg px-3 py-1.5 font-body text-sm text-fg outline-none ring-sirius focus:ring-2"
          value={draft.phone} onChange={(e) => onChange({ ...draft, phone: e.target.value })} placeholder="+966 50 123 4567" />
      </div>
    </div>
  );
}
