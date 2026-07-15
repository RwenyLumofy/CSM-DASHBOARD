"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserCog, Wrench, Loader2, Sparkles, Hand } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import type { AssignmentSource, Csm } from "@/lib/types";
import { setCsmOwnerAction, setImplementationOwnerAction } from "@/app/(app)/clients/[id]/owner-actions";
import { cn } from "@/lib/cn";

export interface OwnerOption {
  email: string;
  name: string;
  role: string;
}

function SourceBadge({ source }: { source?: AssignmentSource | null }) {
  if (!source) return null;
  const auto = source === "auto";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-pill px-1.5 py-0.5 font-body text-[10px] font-semibold uppercase tracking-[0.04em]", auto ? "bg-accent-soft text-sirius" : "bg-bg-muted text-fg-muted")}>
      {auto ? <Sparkles size={10} /> : <Hand size={10} />}
      {auto ? "Auto" : "Manual"}
    </span>
  );
}

function OwnerRow({
  icon: Icon,
  label,
  owner,
  source,
  options,
  canEdit,
  roleLabels,
  onSave,
}: {
  icon: typeof UserCog;
  label: string;
  owner: Csm | null;
  source?: AssignmentSource | null;
  options: OwnerOption[];
  canEdit: boolean;
  roleLabels: Record<string, string>;
  onSave: (email: string | null) => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState(owner?.email ?? "");

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await onSave(value || null);
      if (!r.ok) setError(r.error ?? "Failed.");
      else {
        setEditing(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <Icon size={13} className="text-fg-subtle" />
        <span className="font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">{label}</span>
        <SourceBadge source={source} />
      </div>

      {editing ? (
        <div className="flex flex-col gap-2">
          <select
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={busy}
            className="rounded-[10px] border border-border bg-bg px-3 py-2 font-body text-[13px] text-fg outline-none transition-colors focus:border-sirius focus:ring-2 focus:ring-sirius/15"
          >
            <option value="">Unassigned</option>
            {options.map((o) => (
              <option key={o.email} value={o.email}>
                {o.name} · {roleLabels[o.role] ?? o.role}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <button onClick={save} disabled={busy} className="inline-flex items-center gap-1 rounded-lg bg-sirius px-3 py-1.5 font-body text-[12px] font-semibold text-white disabled:opacity-50">
              {busy && <Loader2 size={12} className="animate-spin" />} Save
            </button>
            <button onClick={() => { setEditing(false); setValue(owner?.email ?? ""); setError(null); }} className="rounded-lg border border-border px-3 py-1.5 font-body text-[12px] font-medium text-fg-muted hover:text-fg">
              Cancel
            </button>
          </div>
          {error && <span className="font-body text-[11.5px] text-[#B23A57]">{error}</span>}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          {owner ? (
            <span className="flex min-w-0 items-center gap-2">
              <Avatar initials={owner.initials} size={28} />
              <span className="min-w-0">
                <span className="block truncate font-body text-[13px] font-semibold text-fg">{owner.name}</span>
                {owner.email && <span className="block truncate font-body text-[11px] text-fg-subtle">{owner.email}</span>}
              </span>
            </span>
          ) : (
            <span className="font-body text-[13px] text-fg-subtle">Unassigned</span>
          )}
          {canEdit && (
            <button onClick={() => setEditing(true)} className="shrink-0 rounded-lg border border-border px-2.5 py-1 font-body text-[11.5px] font-semibold text-fg-muted transition-colors hover:border-sirius hover:text-sirius">
              {owner ? "Reassign" : "Assign"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function OwnerCard({
  clientId,
  csm,
  csmSource,
  implementationOwner,
  implementationOwnerSource,
  csmOptions,
  implementationOptions,
  canEdit,
  roleLabels,
}: {
  clientId: string;
  csm: Csm | null;
  csmSource?: AssignmentSource | null;
  implementationOwner: Csm | null;
  implementationOwnerSource?: AssignmentSource | null;
  csmOptions: OwnerOption[];
  implementationOptions: OwnerOption[];
  canEdit: boolean;
  roleLabels: Record<string, string>;
}) {
  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-5 shadow-sm sm:flex-row sm:gap-8">
      <OwnerRow
        icon={UserCog}
        label="Customer Success Manager"
        owner={csm}
        source={csmSource}
        options={csmOptions}
        canEdit={canEdit}
        roleLabels={roleLabels}
        onSave={(email) => setCsmOwnerAction(clientId, email)}
      />
      <div className="hidden w-px self-stretch bg-border-subtle sm:block" />
      <OwnerRow
        icon={Wrench}
        label="Implementation owner"
        owner={implementationOwner}
        source={implementationOwnerSource}
        options={implementationOptions}
        canEdit={canEdit}
        roleLabels={roleLabels}
        onSave={(email) => setImplementationOwnerAction(clientId, email)}
      />
    </div>
  );
}
