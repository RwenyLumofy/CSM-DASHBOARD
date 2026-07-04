"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, UserX } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import type { Csm } from "@/lib/types";

interface Props {
  clientId: string;
  current: Csm | null;
  options: Csm[];
}

export function AssignCsmButton({ clientId, current, options }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function assign(csmId: string | null) {
    setSaving(true);
    setOpen(false);
    await fetch(`/api/clients/${clientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csmId }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={saving}
        className="group flex w-full items-center gap-3 rounded-lg p-1 -m-1 text-left transition-colors hover:bg-accent-soft/60"
      >
        {current ? (
          <>
            <Avatar initials={current.initials} size={44} />
            <div className="flex-1 min-w-0">
              <div className="font-body text-sm font-semibold text-fg">{current.name}</div>
              {current.email && <div className="caption truncate">{current.email}</div>}
            </div>
          </>
        ) : (
          <span className="flex-1 font-body text-sm text-fg-muted">Unassigned</span>
        )}
        <ChevronDown
          size={14}
          className="shrink-0 text-fg-subtle transition-transform group-data-[open]:rotate-180"
        />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1.5 w-full min-w-[220px] overflow-hidden rounded-xl border border-border bg-bg shadow-xl">
            {options.map((csm) => (
              <button
                key={csm.id}
                onClick={() => assign(csm.id)}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-accent-soft"
              >
                <Avatar initials={csm.initials} size={26} />
                <div className="flex-1 min-w-0">
                  <div className="font-body text-[13px] font-semibold text-fg">{csm.name}</div>
                  {csm.email && <div className="font-body text-[11px] text-fg-muted truncate">{csm.email}</div>}
                </div>
                {current?.id === csm.id && (
                  <span className="text-sirius text-[11px] font-semibold">Current</span>
                )}
              </button>
            ))}
            {current && (
              <button
                onClick={() => assign(null)}
                className="flex w-full items-center gap-2 border-t border-border px-3.5 py-2.5 text-left font-body text-[13px] text-fg-muted transition-colors hover:bg-accent-soft"
              >
                <UserX size={15} /> Unassign
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
