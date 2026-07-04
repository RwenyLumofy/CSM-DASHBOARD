"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { ROLES, DEFAULT_ROLE_LABELS, type Role } from "@/lib/roles";
import { setRoleLabelsAction } from "@/app/(app)/settings/role-label-actions";

const EDITABLE_ROLES = ROLES.filter((r): r is Exclude<Role, "super_admin"> => r !== "super_admin");

export function RoleLabelsManager({ initialLabels }: { initialLabels: Record<string, string> }) {
  const router = useRouter();
  const [labels, setLabels] = useState<Record<string, string>>(
    () => Object.fromEntries(EDITABLE_ROLES.map((r) => [r, initialLabels[r] ?? DEFAULT_ROLE_LABELS[r]])),
  );
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setStatus("idle");
    setErrorMsg(null);
    try {
      const r = await setRoleLabelsAction(labels);
      if (r.ok) {
        setStatus("saved");
        router.refresh();
        setTimeout(() => setStatus("idle"), 2500);
      } else {
        setStatus("error");
        setErrorMsg(r.error ?? "Something went wrong.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-col gap-3">
        {EDITABLE_ROLES.map((role) => (
          <div key={role} className="flex items-center gap-3">
            <span className="w-52 shrink-0 font-body text-[12px] text-fg-subtle">{role}</span>
            <input
              type="text"
              value={labels[role] ?? ""}
              onChange={(e) => setLabels((prev) => ({ ...prev, [role]: e.target.value }))}
              placeholder={DEFAULT_ROLE_LABELS[role]}
              className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 font-body text-sm text-fg outline-none ring-sirius focus:ring-2"
            />
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-sirius px-4 py-2 font-body text-sm font-semibold text-white transition-opacity disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save names
        </button>
        {status === "saved" && (
          <span className="font-body text-[12.5px] text-[#2DB47A]">Saved ✓</span>
        )}
        {status === "error" && (
          <span className="font-body text-[12.5px] text-[#B23A57]">{errorMsg}</span>
        )}
      </div>
    </div>
  );
}
