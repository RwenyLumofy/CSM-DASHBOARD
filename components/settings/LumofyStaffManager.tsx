"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Check, X, Users } from "lucide-react";
import { cn } from "@/lib/cn";

export interface LumofyStaffMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  jobTitle: string;
}

interface Props {
  initialStaff: LumofyStaffMember[];
}

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

const EMPTY: Omit<LumofyStaffMember, "id"> = { name: "", email: "", phone: "", jobTitle: "" };

export function LumofyStaffManager({ initialStaff }: Props) {
  const [staff, setStaff] = useState<LumofyStaffMember[]>(initialStaff);
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Omit<LumofyStaffMember, "id">>(EMPTY);
  const [addingNew, setAddingNew] = useState(false);
  const [newDraft, setNewDraft] = useState<Omit<LumofyStaffMember, "id">>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    const next = staff.map((m) => m.id === editId ? { id: editId!, ...editDraft } : m);
    if (await persist(next)) setEditId(null);
  }

  async function saveNew() {
    if (!newDraft.name.trim() || !newDraft.email.trim()) { setError("Name and email required"); return; }
    const next = [...staff, { id: randomId(), ...newDraft }];
    if (await persist(next)) { setAddingNew(false); setNewDraft(EMPTY); }
  }

  async function remove(id: string) {
    if (!confirm("Remove this team member?")) return;
    await persist(staff.filter((m) => m.id !== id));
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

      {/* Staff list */}
      <div className="overflow-hidden rounded-xl border border-border">
        {staff.length === 0 && !addingNew && (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Users size={24} className="text-fg-muted/50" />
            <p className="font-body text-sm text-fg-muted">No team members yet. Add your first one below.</p>
          </div>
        )}
        {staff.map((m, i) => (
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
                  <div className="font-body text-sm font-semibold text-fg">{m.name}</div>
                  <div className="font-body text-xs text-fg-muted">{m.jobTitle}</div>
                  <div className="font-body text-xs text-fg-muted">{m.email}{m.phone ? ` · ${m.phone}` : ""}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => startEdit(m)} className="grid size-7 place-items-center rounded-md text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg" title="Edit">
                    <Pencil size={13} />
                  </button>
                  <button type="button" onClick={() => remove(m.id)} className="grid size-7 place-items-center rounded-md text-fg-muted transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40" title="Remove">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {addingNew && (
          <div className="border-t border-border bg-bg-muted/30 p-4">
            <StaffForm draft={newDraft} onChange={setNewDraft} />
            <div className="mt-3 flex gap-2">
              <button type="button" disabled={saving} onClick={saveNew} className="flex items-center gap-1.5 rounded-lg bg-sirius px-4 py-1.5 font-body text-sm font-semibold text-white disabled:opacity-50">
                <Check size={14} /> Add member
              </button>
              <button type="button" disabled={saving} onClick={() => { setAddingNew(false); setNewDraft(EMPTY); }} className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-1.5 font-body text-sm text-fg-muted hover:text-fg">
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
