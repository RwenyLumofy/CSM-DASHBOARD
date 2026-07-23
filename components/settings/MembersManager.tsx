"use client";

/* =========================================================================
   Members — who can sign in to Signal and what they can do.

   One responsibility only: manage application members (add manually, set role
   + access, protect critical access). Role naming lives in "Roles &
   permissions"; the wider directory lives in "People directory".

   Auth reality this UI reflects (never claims more than the backend enforces):
     • Sign-in is Microsoft SSO — "adding a member" allowlists their email; they
       become Active on first sign-in. No invitation email is sent.
     • Permission summaries + scope come from lib/roles (derived from the same
       gates lib/auth uses), so the words can't drift from enforcement.
     • Suspend/Invited status is structural for now (no status column yet).
   ========================================================================= */

import { useMemo, useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Plus, Search, X, Loader2, Check, ShieldAlert, Lock, Copy, AlertTriangle,
  MoreHorizontal, Pencil, Trash2, ChevronDown, Crown, Globe, UserRound, Layers,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Avatar, toneForKey } from "@/components/ui/Avatar";
import {
  PERMISSION_ROLES, DEFAULT_ROLE_LABELS, permissionRole, permissionTier,
  roleDescription, defaultScopeForRole, allowedScopesForRole, SCOPE_LABELS, permissionCapabilities,
  type Role, type AccessScope,
} from "@/lib/roles";
import { addOrUpdateUserAction, removeUserAction, setUserScopeAction, setUserRoleAction } from "@/app/(app)/settings/user-actions";

/** Role → pill tone. Tier is the signal: super-admin (crown) → admin → operator → guest. */
const ROLE_TONE: Record<string, string> = {
  super_admin: "border-sirius/25 bg-sirius/10 text-sirius",
  admin: "border-[#C99A14]/30 bg-[#C99A14]/10 text-[#8A6D12]",
  operator: "border-border bg-bg-muted text-fg-muted",
  guest: "border-border-subtle bg-bg-muted/50 text-fg-subtle",
};

export interface Account { id: string; name: string }

export interface Member {
  email: string;
  name: string | null;
  role: Role;
  title: string | null;
  department: string | null;
  bootstrap: boolean; // permanent super-admin (env) — locked
  ownedAccounts: number;
  scope: string | null; // override, or null = role default
  grantedClientIds: string[]; // for scope 'selected'
}

/** Effective scope for display — the override if valid, else the role default. */
function effectiveScope(m: Member): AccessScope {
  return m.scope === "all" || m.scope === "assigned" || m.scope === "selected" ? m.scope : defaultScopeForRole(m.role);
}

function scopeCellLabel(m: Member): string {
  const s = effectiveScope(m);
  return s === "selected" ? `Selected · ${m.grantedClientIds.length}` : SCOPE_LABELS[s];
}

/** Icon that conveys the access scope at a glance (globe = all, person =
 *  assigned-only, layers = a hand-picked set). */
function scopeIcon(m: Member): typeof Globe {
  const s = effectiveScope(m);
  return s === "all" ? Globe : s === "selected" ? Layers : UserRound;
}

/** Access scope shown as icon + label, so scope reads without parsing text. */
function AccessCell({ m }: { m: Member }) {
  const Icon = scopeIcon(m);
  return (
    <span className="flex min-w-0 items-center gap-1.5 font-body text-[12.5px] text-fg-muted">
      <Icon size={14} className="shrink-0 text-fg-subtle" aria-hidden />
      <span className="truncate">{scopeCellLabel(m)}</span>
    </span>
  );
}

/** Membership at a glance — total plus a count per permission tier. Gives the
 *  admin a sense of the shape of access before scanning the rows. */
function MemberStats({ members }: { members: Member[] }) {
  const counts: Record<string, number> = { super_admin: 0, admin: 0, operator: 0, guest: 0 };
  for (const m of members) { const k = permissionRole(m.role); counts[k] = (counts[k] ?? 0) + 1; }
  const chips: { key: string; n: number; label: string; dot: string }[] = [
    { key: "total", n: members.length, label: members.length === 1 ? "member" : "members", dot: "border-[1.5px] border-border-strong" },
    { key: "super_admin", n: counts.super_admin, label: "Super Admin", dot: "bg-sirius" },
    { key: "admin", n: counts.admin, label: "Admin", dot: "bg-[#C99A14]" },
    { key: "operator", n: counts.operator, label: "Operator", dot: "bg-fg-subtle" },
    ...(counts.guest > 0 ? [{ key: "guest", n: counts.guest, label: "Guest", dot: "bg-fg-subtle/50" }] : []),
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c) => (
        <span key={c.key} className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
          <span className={cn("size-[7px] rounded-full", c.dot)} />
          <span className="font-body text-[14px] font-semibold tabular-nums leading-none text-fg">{c.n}</span>
          <span className="font-body text-[12px] leading-none text-fg-subtle">{c.label}</span>
        </span>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------- helpers */

function initialsOf(m: { name: string | null; email: string }): string {
  const base = (m.name ?? m.email).trim();
  const parts = base.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || base.slice(0, 2).toUpperCase();
}

function label(role: Role, roleLabels: Record<string, string>): string {
  const key = permissionRole(role);
  return roleLabels[key] ?? DEFAULT_ROLE_LABELS[key] ?? key;
}

const SORTS = [
  { key: "name", label: "Name" },
  { key: "added", label: "Recently added" },
  { key: "role", label: "Role" },
] as const;
type SortKey = (typeof SORTS)[number]["key"];

/* ======================================================================== */

export function MembersManager({
  members,
  currentUserEmail,
  roleLabels,
  canGrantCrown,
  accounts,
  prefill,
}: {
  members: Member[];
  currentUserEmail: string | null;
  roleLabels: Record<string, string>;
  canGrantCrown: boolean; // is the acting user a super-admin (may grant Admin/Super Admin)
  accounts: Account[];
  prefill?: { email?: string; name?: string; title?: string; department?: string } | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | Role>("all");
  const [sort, setSort] = useState<SortKey>("name");

  // Drawer: null = closed, {} = add, member = edit.
  const [editing, setEditing] = useState<Member | "new" | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Open the Add drawer prefilled when arriving from "Grant Signal access".
  useEffect(() => {
    if (prefill) setEditing("new");
  }, [prefill]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = members.filter((m) => {
      if (roleFilter !== "all" && permissionRole(m.role) !== roleFilter) return false;
      if (!q) return true;
      return [m.name, m.email, m.title, m.department].some((v) => v?.toLowerCase().includes(q));
    });
    list = [...list].sort((a, b) => {
      if (sort === "role") return PERMISSION_ROLES.indexOf(permissionRole(a.role)) - PERMISSION_ROLES.indexOf(permissionRole(b.role));
      if (sort === "added") return 0; // createdAt not surfaced here; keep source order
      return (a.name ?? a.email).localeCompare(b.name ?? b.email);
    });
    return list;
  }, [members, query, roleFilter, sort]);

  return (
    <div className="flex flex-col gap-4">
      {members.length > 0 && <MemberStats members={members} />}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[200px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, email, title…"
            aria-label="Search members"
            className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 font-body text-[13px] text-fg outline-none ring-sirius focus:ring-2"
          />
        </div>
        <FilterSelect value={roleFilter} onChange={(v) => setRoleFilter(v as "all" | Role)} label="Role">
          <option value="all">All roles</option>
          {PERMISSION_ROLES.map((r) => <option key={r} value={r}>{label(r, roleLabels)}</option>)}
        </FilterSelect>
        <FilterSelect value={sort} onChange={(v) => setSort(v as SortKey)} label="Sort by">
          {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </FilterSelect>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-sirius px-3.5 py-2 font-body text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          <Plus size={15} /> Add member
        </button>
      </div>

      {(query.trim() || roleFilter !== "all") && (
        <p className="-mt-1 font-body text-[12px] text-fg-subtle">
          Showing {filtered.length} of {members.length}
        </p>
      )}

      {/* List */}
      {members.length === 0 ? (
        <EmptyState onAdd={() => setEditing("new")} kind="none" />
      ) : filtered.length === 0 ? (
        <EmptyState onAdd={() => setEditing("new")} kind="no-results" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
          {/* Desktop table */}
          <table className="hidden w-full md:table">
            <thead>
              <tr className="border-b border-border-subtle">
                {[
                  { h: "Member", align: "left" as const },
                  { h: "Role", align: "left" as const },
                  { h: "Access", align: "left" as const },
                  { h: "Owns", align: "right" as const },
                  { h: "", align: "right" as const },
                ].map(({ h, align }, i) => (
                  <th key={h || i} className={cn("px-4 py-2.5 font-body text-[11px] font-semibold uppercase tracking-[0.04em] text-fg-subtle", align === "right" ? "text-right" : "text-left")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => {
                const isSelf = m.email === currentUserEmail;
                return (
                  <tr key={m.email} className={cn("border-b border-border-subtle last:border-b-0 hover:bg-bg-muted/40", isSelf && "bg-accent-soft/20")}>
                    <td className="px-4 py-3">
                      <MemberCell m={m} isSelf={isSelf} />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <InlineRole m={m} roleLabels={roleLabels} canGrantCrown={canGrantCrown} onFlash={flash} onDone={() => router.refresh()} />
                    </td>
                    <td className="px-4 py-3"><AccessCell m={m} /></td>
                    <td className="px-4 py-3 text-right font-body text-[12.5px] tabular-nums text-fg-muted">
                      {m.ownedAccounts > 0 ? m.ownedAccounts : <span className="text-fg-subtle">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <RowMenu m={m} isSelf={isSelf} onEdit={() => setEditing(m)} onFlash={flash} onDone={() => router.refresh()} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Mobile cards */}
          <ul className="divide-y divide-border-subtle md:hidden">
            {filtered.map((m) => {
              const isSelf = m.email === currentUserEmail;
              return (
                <li key={m.email} className={cn("flex flex-col gap-3 p-4", isSelf && "bg-accent-soft/20")}>
                  <div className="flex items-start gap-3">
                    <MemberCell m={m} isSelf={isSelf} compact />
                    <div className="ml-auto">
                      <RowMenu m={m} isSelf={isSelf} onEdit={() => setEditing(m)} onFlash={flash} onDone={() => router.refresh()} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <InlineRole m={m} roleLabels={roleLabels} canGrantCrown={canGrantCrown} onFlash={flash} onDone={() => router.refresh()} />
                    <span className="flex items-center gap-1.5">
                      <AccessCell m={m} />
                      {m.ownedAccounts > 0 && <span className="font-body text-[11.5px] text-fg-subtle">· {m.ownedAccounts} owned</span>}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {editing && (
        <MemberDrawer
          key={editing === "new" ? "new" : editing.email}
          mode={editing === "new" ? "add" : "edit"}
          member={editing === "new" ? null : editing}
          members={members}
          roleLabels={roleLabels}
          canGrantCrown={canGrantCrown}
          accounts={accounts}
          prefill={editing === "new" ? prefill ?? null : null}
          onClose={() => setEditing(null)}
          onSaved={(msg) => { setEditing(null); flash(msg); router.refresh(); }}
        />
      )}

      {toast && (
        <div role="status" className="pm-in fixed bottom-6 left-1/2 z-[90] -translate-x-1/2 rounded-xl bg-cosmos px-4 py-2.5 font-body text-[13px] font-semibold text-white shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- sub-parts */

function FilterSelect({ value, onChange, label, children }: { value: string; onChange: (v: string) => void; label: string; children: React.ReactNode }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="rounded-lg border border-border bg-surface px-2.5 py-2 font-body text-[12.5px] font-medium text-fg-muted outline-none ring-sirius focus:ring-2"
    >
      {children}
    </select>
  );
}

function MemberCell({ m, isSelf, compact }: { m: Member; isSelf: boolean; compact?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar initials={initialsOf(m)} tone={permissionTier(m.role) === "super_admin" ? "sirius" : toneForKey(m.email)} size={compact ? 34 : 32} />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-body text-[13px] font-semibold text-fg">{m.name ?? m.email}</span>
          {isSelf && <span className="shrink-0 rounded bg-bg-muted px-1.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-fg-subtle">You</span>}
        </div>
        <div className="truncate font-body text-[12px] text-fg-subtle">
          {m.email}{m.title ? <> · {m.title}</> : null}
        </div>
      </div>
    </div>
  );
}

/* -------- Inline role control -------------------------------------------- */
/* The table's primary action lives in the row: change a role in one click,
   with the save state shown right here (saving → saved → or the exact DB
   error). Escalating to a crown role (Admin / Super Admin) needs super-admin
   rights; Super Admin also passes a confirm. Permanent super-admins are a
   read-only pill. */

function RolePill({ role, roleLabels, className, children }: {
  role: Role; roleLabels: Record<string, string>; className?: string; children?: React.ReactNode;
}) {
  const key = permissionRole(role);
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-body text-[12px] font-medium", ROLE_TONE[key] ?? ROLE_TONE.operator, className)}>
      {key === "super_admin" && <Crown size={11} className="shrink-0" />}
      <span className="truncate">{label(role, roleLabels)}</span>
      {children}
    </span>
  );
}

function InlineRole({ m, roleLabels, canGrantCrown, onFlash, onDone }: {
  m: Member; roleLabels: Record<string, string>; canGrantCrown: boolean;
  onFlash: (s: string) => void; onDone: () => void;
}) {
  const current = permissionRole(m.role);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmSuper, setConfirmSuper] = useState<Role | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const MENU_W = 224; // w-56

  // Anchor the (portaled) menu under the trigger. Portalling escapes the
  // table's `overflow-hidden`, which would otherwise clip the dropdown.
  function openMenu() {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const left = Math.min(r.left, window.innerWidth - MENU_W - 8); // keep on-screen
      setPos({ top: r.bottom + 4, left: Math.max(8, left) });
    }
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const dismiss = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Permanent super-admin (env) — role is fixed; show a locked pill.
  if (m.bootstrap) {
    return <RolePill role={m.role} roleLabels={roleLabels}><Lock size={10} className="shrink-0 opacity-70" aria-label="Permanent super-admin" /></RolePill>;
  }

  async function apply(next: Role) {
    setOpen(false);
    setConfirmSuper(null);
    if (next === current) return;
    setBusy(true);
    setError(null);
    const r = await setUserRoleAction(m.email, next, m.name);
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "Couldn't change role."); return; }
    setSaved(true);
    onFlash(`${m.name ?? m.email} is now ${label(next, roleLabels)}.`);
    setTimeout(() => setSaved(false), 1800);
    onDone(); // re-fetch so the whole row reflects the change
  }

  function pick(next: Role) {
    if (next === current) { setOpen(false); return; }
    if (next === "super_admin") { setOpen(false); setConfirmSuper(next); return; } // guardrail
    apply(next);
  }

  return (
    <div className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Role: ${label(current, roleLabels)}. Change role`}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-body text-[12px] font-medium outline-none ring-sirius transition-colors focus-visible:ring-2 disabled:opacity-70",
          ROLE_TONE[current] ?? ROLE_TONE.operator,
          "hover:brightness-[0.97]",
        )}
      >
        {current === "super_admin" && <Crown size={11} className="shrink-0" />}
        <span className="truncate">{label(current, roleLabels)}</span>
        {busy ? <Loader2 size={12} className="shrink-0 animate-spin" />
          : saved ? <Check size={12} className="shrink-0 text-[#2DB47A]" />
          : <ChevronDown size={12} className="shrink-0 opacity-60" />}
      </button>

      {open && pos && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{ position: "fixed", top: pos.top, left: pos.left, width: MENU_W }}
          className="z-[60] overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lg"
        >
          {PERMISSION_ROLES.map((r) => {
            const crownLocked = (r === "admin" || r === "super_admin") && !canGrantCrown;
            const isCurrent = r === current;
            return (
              <button
                key={r}
                type="button"
                role="menuitemradio"
                aria-checked={isCurrent}
                disabled={crownLocked}
                onClick={() => pick(r)}
                className={cn(
                  "flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors",
                  crownLocked ? "cursor-not-allowed opacity-50" : "hover:bg-bg-muted",
                )}
              >
                <span className="mt-0.5 grid size-4 shrink-0 place-items-center">
                  {isCurrent && <Check size={13} className="text-sirius" />}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 font-body text-[13px] font-medium text-fg">
                    {r === "super_admin" && <Crown size={11} className="text-sirius" />}
                    {label(r, roleLabels)}
                  </span>
                  <span className="mt-0.5 block font-body text-[11.5px] text-fg-subtle">
                    {crownLocked ? "Only a super-admin can grant this." : roleDescription(r)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>,
        document.body,
      )}

      {/* Save failure — shown right in the row so a write can never fail silently. */}
      {error && (
        <div className="mt-1.5 flex max-w-[240px] items-start gap-1.5 font-body text-[11px] leading-snug text-[#B23A57]">
          <AlertTriangle size={12} className="mt-px shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {confirmSuper && (
        <ConfirmDialog
          title="Grant Super Admin?"
          body={
            <p className="font-body text-[13px] text-fg-muted">
              <strong className="text-fg">{m.name ?? m.email}</strong> will get unrestricted access to every
              account and all settings. Grant it only when required.
            </p>
          }
          confirmLabel={busy ? "Granting…" : "Grant Super Admin"}
          busy={busy}
          onConfirm={() => apply(confirmSuper)}
          onCancel={() => setConfirmSuper(null)}
        />
      )}
    </div>
  );
}

/* -------- Row overflow menu ---------------------------------------------- */

function RowMenu({ m, isSelf, onEdit, onFlash, onDone }: {
  m: Member; isSelf: boolean; onEdit: () => void; onFlash: (s: string) => void; onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<null | { ownedAccounts?: number; error?: string }>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  if (m.bootstrap) {
    return <span className="inline-flex items-center gap-1 font-body text-[11.5px] text-fg-subtle"><Lock size={11} /> Locked</span>;
  }

  async function doRemove(reassigned: boolean) {
    setBusy(true);
    const r = await removeUserAction(m.email, reassigned ? { reassigned: true } : undefined);
    setBusy(false);
    if (!r.ok) {
      if (r.ownedAccounts) { setConfirmRemove({ ownedAccounts: r.ownedAccounts, error: r.error }); return; }
      onFlash(r.error ?? "Couldn't remove member.");
      setConfirmRemove(null);
      setOpen(false);
      return;
    }
    onFlash(`${m.name ?? m.email} removed.`);
    setConfirmRemove(null);
    setOpen(false);
    onDone();
  }

  return (
    <div ref={ref} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Actions for ${m.name ?? m.email}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="grid size-8 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-bg-muted hover:text-fg"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <MoreHorizontal size={16} />}
      </button>

      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lg">
          <MenuItem icon={Pencil} label="Edit details & access" onClick={() => { setOpen(false); onEdit(); }} />
          <div className="my-1 border-t border-border-subtle" />
          <MenuItem
            icon={Trash2}
            label="Remove member"
            danger
            disabled={isSelf}
            title={isSelf ? "You can't remove yourself" : undefined}
            onClick={() => doRemove(false)}
          />
        </div>
      )}

      {/* Reassignment gate — surfaced when removing a member who owns accounts */}
      {confirmRemove && (
        <ConfirmDialog
          title="Reassign work before removing"
          body={
            <>
              <p className="font-body text-[13px] text-fg-muted">
                <strong className="text-fg">{m.name ?? m.email}</strong> owns{" "}
                <strong className="text-fg">{confirmRemove.ownedAccounts}</strong>{" "}
                {confirmRemove.ownedAccounts === 1 ? "account" : "accounts"}. Removing access won't reassign that
                work — move it to another owner first so nothing is orphaned.
              </p>
              <p className="mt-2 font-body text-[12px] text-fg-subtle">
                Reassign accounts from each client's profile, then remove. Or confirm you've already reassigned it.
              </p>
            </>
          }
          confirmLabel={busy ? "Removing…" : "I've reassigned — remove"}
          danger
          busy={busy}
          onConfirm={() => doRemove(true)}
          onCancel={() => setConfirmRemove(null)}
        />
      )}
    </div>
  );
}

function MenuItem({ icon: Icon, label, onClick, danger, disabled, title }: {
  icon: typeof Pencil; label: string; onClick: () => void; danger?: boolean; disabled?: boolean; title?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "flex w-full items-center gap-2.5 px-3 py-2 font-body text-[13px] transition-colors",
        disabled ? "cursor-not-allowed text-fg-subtle/60" : danger ? "text-[#B23A57] hover:bg-[#B23A57]/8" : "text-fg-muted hover:bg-bg-muted hover:text-fg",
      )}
    >
      <Icon size={14} /> {label}
    </button>
  );
}

/* -------- Empty states --------------------------------------------------- */

function EmptyState({ onAdd, kind }: { onAdd: () => void; kind: "none" | "no-results" }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-surface px-6 py-14 text-center">
      <div className="grid size-11 place-items-center rounded-full bg-accent-soft text-sirius"><Plus size={20} /></div>
      {kind === "none" ? (
        <>
          <h3 className="font-display text-[15px] font-semibold text-fg">No team members yet</h3>
          <p className="max-w-xs font-body text-[13px] text-fg-muted">Add your first member and choose what they can access.</p>
          <button type="button" onClick={onAdd} className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-sirius px-4 py-2 font-body text-[13px] font-semibold text-white">
            <Plus size={15} /> Add member
          </button>
        </>
      ) : (
        <>
          <h3 className="font-display text-[15px] font-semibold text-fg">No members match</h3>
          <p className="max-w-xs font-body text-[13px] text-fg-muted">Try a different search or clear the filters.</p>
        </>
      )}
    </div>
  );
}

/* -------- Confirm dialog (small, centred) -------------------------------- */

function ConfirmDialog({ title, body, confirmLabel, onConfirm, onCancel, danger, busy }: {
  title: string; body: React.ReactNode; confirmLabel: string; onConfirm: () => void; onCancel: () => void; danger?: boolean; busy?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" onClick={onCancel} />
      <div role="alertdialog" aria-label={title} className="pm-in relative w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-xl">
        <h3 className="font-display text-[15px] font-semibold text-fg">{title}</h3>
        <div className="mt-2">{body}</div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-border px-3.5 py-2 font-body text-[13px] font-medium text-fg-muted hover:text-fg">Cancel</button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={cn("inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 font-body text-[13px] font-semibold text-white disabled:opacity-50", danger ? "bg-[#B23A57]" : "bg-sirius")}
          >
            {busy && <Loader2 size={13} className="animate-spin" />} {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ======================================================================== */
/*  Add / Edit drawer                                                        */
/* ======================================================================== */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function MemberDrawer({ mode, member, members, roleLabels, canGrantCrown, accounts, prefill, onClose, onSaved }: {
  mode: "add" | "edit";
  member: Member | null;
  members: Member[];
  roleLabels: Record<string, string>;
  canGrantCrown: boolean;
  accounts: Account[];
  prefill: { email?: string; name?: string; title?: string; department?: string } | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [email, setEmail] = useState(member?.email ?? prefill?.email ?? "");
  const [name, setName] = useState(member?.name ?? prefill?.name ?? "");
  const [title, setTitle] = useState(member?.title ?? prefill?.title ?? "");
  const [department, setDepartment] = useState(member?.department ?? prefill?.department ?? "");
  const [role, setRole] = useState<Role>(member ? permissionRole(member.role) : "operator");
  const initialScope: AccessScope = member ? effectiveScope(member) : defaultScopeForRole("operator");
  const [scope, setScope] = useState<AccessScope>(initialScope);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(member?.grantedClientIds ?? []));
  const [acctQuery, setAcctQuery] = useState("");
  const [superConfirm, setSuperConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When the role changes, keep scope valid for the new role (default if not).
  function changeRole(r: Role) {
    setRole(r);
    setSuperConfirm(false);
    const allowed = allowedScopesForRole(r);
    setScope((s) => (allowed.includes(s) ? s : defaultScopeForRole(r)));
  }
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { (mode === "add" ? firstFieldRef : closeRef).current?.focus(); }, [mode]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  const tier = permissionTier(role);
  const isSuper = tier === "super_admin";
  const caps = permissionCapabilities(role);

  // Duplicate detection (add only) — email is the identity/PK.
  const duplicate = useMemo(() => {
    if (mode !== "add") return null;
    const e = email.trim().toLowerCase();
    if (!e) return null;
    return members.find((m) => m.email.toLowerCase() === e) ?? null;
  }, [mode, email, members]);

  const emailValid = EMAIL_RE.test(email.trim());
  const nameValid = name.trim().length > 0;
  const scopeValid = scope !== "selected" || selectedIds.size > 0;
  const canSubmit = emailValid && nameValid && scopeValid && !duplicate && (!isSuper || superConfirm) && !busy;

  async function submit() {
    setError(null);
    if (!emailValid) return setError("Enter a valid email address.");
    if (!nameValid) return setError("Full name is required.");
    if (!scopeValid) return setError("Choose at least one account for Selected access.");
    setBusy(true);
    const addr = email.trim().toLowerCase();
    const r = await addOrUpdateUserAction({
      email: email.trim(),
      name: name.trim(),
      role,
      title: title.trim(),
      department: department.trim(),
    });
    if (!r.ok) { setBusy(false); setError(r.error ?? "Something went wrong."); return; }

    // Persist scope: store null when it matches the role default (so scope
    // follows the role), else the explicit override.
    const scopeToStore = scope === defaultScopeForRole(role) ? null : scope;
    const s = await setUserScopeAction({ email: addr, scope: scopeToStore, clientIds: [...selectedIds] });
    setBusy(false);
    if (!s.ok) { setError(`Saved the member, but access scope failed: ${s.error}`); return; }
    onSaved(mode === "add" ? `Member added — ${email.trim()}` : "Member updated.");
  }

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" onClick={onClose} />
      <div
        role="dialog"
        aria-label={mode === "add" ? "Add member" : "Edit member"}
        aria-modal="true"
        className="pm-slide-in relative flex h-full w-full flex-col bg-surface shadow-2xl sm:w-[520px]"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="font-display text-[17px] font-semibold text-fg">{mode === "add" ? "Add member" : name || email}</h2>
            <p className="mt-0.5 font-body text-[12.5px] text-fg-muted">
              {mode === "add" ? "Enter their details and choose what they can access." : "Update their details and access."}
            </p>
          </div>
          <button ref={closeRef} onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-md text-fg-muted hover:bg-bg-muted hover:text-fg">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Personal details */}
          <Section title="Personal details">
            <Field label="Email address" required hint={mode === "edit" ? "The sign-in identity — can't be changed." : "Used as their Microsoft sign-in and identity."}>
              <input
                ref={firstFieldRef}
                type="email"
                value={email}
                disabled={mode === "edit"}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@lumofy.com"
                aria-invalid={email !== "" && !emailValid}
                className={inputCls(email !== "" && !emailValid)}
              />
            </Field>
            {duplicate && <DuplicateNotice member={duplicate} onView={() => { /* edit the existing one */ onClose(); }} />}
            <Field label="Full name" required>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ali Abbas" aria-invalid={name !== "" && !nameValid} className={inputCls(false)} />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Job title" optional>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Senior CSM" className={inputCls(false)} />
              </Field>
              <Field label="Department" optional>
                <input type="text" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Customer Success" className={inputCls(false)} />
              </Field>
            </div>
          </Section>

          {/* Access */}
          <Section title="Access">
            <Field label="Role" required>
              <div className="flex flex-col gap-2">
                {PERMISSION_ROLES.map((r) => {
                  const locked = (r === "admin" || r === "super_admin") && !canGrantCrown;
                  return (
                    <label
                      key={r}
                      className={cn(
                        "flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors",
                        role === r ? "border-sirius bg-accent-soft/40" : "border-border hover:border-border-strong",
                        locked && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <input type="radio" name="role" value={r} checked={role === r} disabled={locked} onChange={() => changeRole(r)} className="mt-0.5 accent-sirius" />
                      <span className="min-w-0">
                        <span className="block font-body text-[13px] font-semibold text-fg">
                          {label(r, roleLabels)}
                          {roleLabels[r] && roleLabels[r] !== DEFAULT_ROLE_LABELS[r] && (
                            <span className="ml-1.5 font-normal text-fg-subtle">· {DEFAULT_ROLE_LABELS[r]} permissions</span>
                          )}
                        </span>
                        <span className="mt-0.5 block font-body text-[12px] text-fg-muted">{roleDescription(r)}</span>
                        {locked && <span className="mt-1 block font-body text-[11px] text-fg-subtle">Only a super-admin can grant this.</span>}
                      </span>
                    </label>
                  );
                })}
              </div>
            </Field>

            {/* Access scope — an axis distinct from role */}
            <Field label="Access scope" required>
              {allowedScopesForRole(role).length === 1 ? (
                <div className="rounded-lg border border-border bg-bg-muted/40 px-3 py-2.5">
                  <div className="font-body text-[13px] font-semibold text-fg">{SCOPE_LABELS[scope]}</div>
                  <p className="mt-0.5 font-body text-[12px] text-fg-muted">Super Admin always has access to every account.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {allowedScopesForRole(role).map((s) => (
                    <label
                      key={s}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-lg border p-2.5 transition-colors",
                        scope === s ? "border-sirius bg-accent-soft/40" : "border-border hover:border-border-strong",
                      )}
                    >
                      <input type="radio" name="scope" value={s} checked={scope === s} onChange={() => setScope(s)} className="mt-0.5 accent-sirius" />
                      <span>
                        <span className="block font-body text-[13px] font-medium text-fg">{SCOPE_LABELS[s]}</span>
                        <span className="block font-body text-[11.5px] text-fg-muted">
                          {s === "assigned" ? "Only accounts assigned to them (they own)."
                            : s === "all" ? "Every account in the workspace."
                            : "Only the specific accounts you choose below."}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </Field>

            {scope === "selected" && (
              <AccountPicker accounts={accounts} selectedIds={selectedIds} onToggle={(id) => {
                setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
              }} query={acctQuery} onQuery={setAcctQuery} />
            )}

            {/* Permission summary — generated from real authorization */}
            <div className="mt-1 rounded-lg border border-border bg-surface p-3.5">
              <p className="mb-2 font-body text-[12px] font-semibold text-fg">This member will be able to:</p>
              <ul className="flex flex-col gap-1">
                {caps.can.map((c) => (
                  <li key={c} className="flex items-start gap-2 font-body text-[12.5px] text-fg-muted"><Check size={14} className="mt-0.5 shrink-0 text-[#2DB47A]" />{c}</li>
                ))}
              </ul>
              {caps.cannot.length > 0 && (
                <>
                  <p className="mb-2 mt-3 font-body text-[12px] font-semibold text-fg">They will not be able to:</p>
                  <ul className="flex flex-col gap-1">
                    {caps.cannot.map((c) => (
                      <li key={c} className="flex items-start gap-2 font-body text-[12.5px] text-fg-subtle"><span className="mt-0.5 shrink-0 text-fg-subtle">–</span>{c}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            {/* Super Admin guardrail */}
            {isSuper && (
              <label className="mt-3 flex items-start gap-2.5 rounded-lg border border-[#C99A14]/40 bg-[#C99A14]/8 p-3">
                <input type="checkbox" checked={superConfirm} onChange={(e) => setSuperConfirm(e.target.checked)} className="mt-0.5 accent-[#B23A57]" />
                <span className="font-body text-[12.5px] text-[#8A6D12]">
                  <span className="flex items-center gap-1.5 font-semibold text-fg"><ShieldAlert size={14} className="text-[#C99A14]" /> Confirm Super Admin access</span>
                  Super Admin grants unrestricted system access. Assign it only when required.
                </span>
              </label>
            )}
          </Section>

          {/* Invitation (honest SSO model) */}
          {mode === "add" && (
            <Section title="Invitation">
              <div className="rounded-lg border border-border bg-bg-muted/40 p-3.5">
                <p className="font-body text-[12.5px] text-fg-muted">
                  Signal uses Microsoft sign-in — no email is sent. Once added, this person signs in with their
                  Microsoft account at Signal using <strong className="text-fg">{email.trim() || "their email"}</strong> and
                  becomes active on first sign-in.
                </p>
                <CopyInvite email={email.trim()} />
              </div>
            </Section>
          )}

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-[#B23A57]/30 bg-[#B23A57]/8 px-3 py-2.5 font-body text-[12.5px] text-[#B23A57]">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /> <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 font-body text-[13px] font-medium text-fg-muted hover:text-fg">Cancel</button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sirius px-4 py-2 font-body text-[13px] font-semibold text-white transition-opacity disabled:opacity-40"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={15} />}
            {mode === "add" ? "Add member" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DuplicateNotice({ member, onView }: { member: Member; onView: () => void }) {
  return (
    <div className="mb-3 flex items-start gap-2 rounded-lg border border-[#C99A14]/40 bg-[#C99A14]/8 px-3 py-2.5">
      <AlertTriangle size={14} className="mt-0.5 shrink-0 text-[#C99A14]" />
      <div className="font-body text-[12.5px] text-[#8A6D12]">
        {member.name ?? "This email"} is already a member.
        <button type="button" onClick={onView} className="ml-1.5 font-semibold text-sirius underline-offset-2 hover:underline">Review member</button>
      </div>
    </div>
  );
}

function CopyInvite({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);
  const msg = `You've been added to Signal. Sign in at Signal with your Microsoft account using ${email || "your work email"}.`;
  return (
    <button
      type="button"
      disabled={!email}
      onClick={async () => { await navigator.clipboard?.writeText(msg); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
      className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 font-body text-[12px] font-semibold text-fg-muted transition-colors hover:text-fg disabled:opacity-40"
    >
      {copied ? <Check size={13} className="text-[#2DB47A]" /> : <Copy size={13} />} {copied ? "Copied" : "Copy invite message"}
    </button>
  );
}

/* -------- searchable account multiselect --------------------------------- */

function AccountPicker({ accounts, selectedIds, onToggle, query, onQuery }: {
  accounts: Account[]; selectedIds: Set<string>; onToggle: (id: string) => void; query: string; onQuery: (q: string) => void;
}) {
  const q = query.trim().toLowerCase();
  const filtered = q ? accounts.filter((a) => a.name.toLowerCase().includes(q)) : accounts;
  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
        <span className="font-body text-[11.5px] font-semibold text-fg-muted">{selectedIds.size} selected</span>
        <div className="relative w-40">
          <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <input
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Find account…"
            aria-label="Search accounts"
            className="w-full rounded-md border border-border bg-bg py-1.5 pl-7 pr-2 font-body text-[12px] text-fg outline-none ring-sirius focus:ring-2"
          />
        </div>
      </div>
      <ul className="max-h-56 overflow-y-auto p-1" role="listbox" aria-multiselectable="true">
        {filtered.length === 0 ? (
          <li className="px-2 py-3 text-center font-body text-[12px] text-fg-subtle">No accounts match.</li>
        ) : filtered.map((a) => {
          const on = selectedIds.has(a.id);
          return (
            <li key={a.id}>
              <button
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => onToggle(a.id)}
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left font-body text-[12.5px] text-fg transition-colors hover:bg-bg-muted"
              >
                <span className={cn("grid size-4 shrink-0 place-items-center rounded border", on ? "border-sirius bg-sirius text-white" : "border-border")}>
                  {on && <Check size={11} />}
                </span>
                <span className="truncate">{a.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* -------- tiny form primitives ------------------------------------------- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 last:mb-0">
      <h3 className="mb-3 font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">{title}</h3>
      <div className="flex flex-col gap-3.5">{children}</div>
    </section>
  );
}

function Field({ label, required, optional, hint, children }: { label: string; required?: boolean; optional?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1.5 font-body text-[12.5px] font-medium text-fg">
        {label}
        {required && <span className="text-[#B23A57]">*</span>}
        {optional && <span className="font-normal text-fg-subtle">optional</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block font-body text-[11px] text-fg-subtle">{hint}</span>}
    </label>
  );
}

function inputCls(invalid: boolean): string {
  return cn(
    "w-full rounded-lg border bg-bg px-3 py-2 font-body text-[13px] text-fg outline-none ring-sirius focus:ring-2 disabled:opacity-60",
    invalid ? "border-[#B23A57]" : "border-border",
  );
}
