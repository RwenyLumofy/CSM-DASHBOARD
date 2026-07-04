"use client";

/* =========================================================================
   Edit drawer for a client's details — core fields + all defined properties +
   CSM. Inputs are driven by property_definitions (selects use their options).
   Saves via PATCH /api/clients/[id] then refreshes the route.
   ========================================================================= */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Client, Csm, PropertyDefinition } from "@/lib/types";

const GROUP_ORDER: { key: PropertyDefinition["group"]; label: string }[] = [
  { key: "contract", label: "Contract" },
  { key: "client", label: "Client" },
  { key: "product", label: "Product" },
  { key: "engagement", label: "Engagement" },
  { key: "dates", label: "Key dates" },
];

interface Props {
  client: Client;
  csmUsers: Csm[];
  propertyDefs: PropertyDefinition[];
}

export function EditClientButton({ client, csmUsers, propertyDefs }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-surface px-3 py-2 font-body text-[13px] font-semibold text-fg-muted transition-colors hover:border-sirius-200 hover:text-sirius"
      >
        <Pencil size={14} strokeWidth={2} /> Edit
      </button>
      {open && <EditDrawer client={client} csmUsers={csmUsers} propertyDefs={propertyDefs} onClose={() => setOpen(false)} />}
    </>
  );
}

function EditDrawer({ client, csmUsers, propertyDefs, onClose }: Props & { onClose: () => void }) {
  const router = useRouter();
  const p = client.properties ?? {};
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fields, setFields] = useState({
    domain: client.domain ?? "",
    industry: client.industry ?? "",
    country: client.country ?? "",
    employees: client.employees != null ? String(client.employees) : "",
    segment: client.segment,
    status: client.status,
    renewalDate: client.renewalDate ? client.renewalDate.slice(0, 10) : "",
    startedAt: client.startedAt ? client.startedAt.slice(0, 10) : "",
  });
  const [csmId, setCsmId] = useState(client.csm?.id ?? "");
  const [props, setProps] = useState<Record<string, string | string[]>>(() => {
    const init: Record<string, string | string[]> = {};
    for (const d of propertyDefs) {
      const v = p[d.key];
      if (d.type === "multi_select") init[d.key] = Array.isArray(v) ? (v as string[]) : v != null && v !== "" ? [String(v)] : [];
      else if (d.type === "date") init[d.key] = v ? String(v).slice(0, 10) : "";
      else init[d.key] = v != null ? String(v) : "";
    }
    return init;
  });

  const setField = (k: keyof typeof fields, v: string) => setFields((f) => ({ ...f, [k]: v }));
  const setProp = (k: string, v: string | string[]) => setProps((s) => ({ ...s, [k]: v }));

  // Read-only defs (e.g. the sync-managed deal_* picklist option holders) are
  // not account-level editable fields — keep them out of the edit drawer.
  const groups = GROUP_ORDER.map((g) => ({
    ...g,
    defs: propertyDefs.filter((d) => d.group === g.key && !d.isReadOnly).sort((a, b) => a.sortOrder - b.sortOrder),
  })).filter((g) => g.defs.length > 0);

  async function save() {
    setSaving(true);
    setError(null);
    // Build the full properties map: preserve keys without a definition, then
    // overlay the edited defined fields (omitting empties).
    const defKeys = new Set(propertyDefs.map((d) => d.key));
    const outProps: Record<string, unknown> = Object.fromEntries(Object.entries(p).filter(([k]) => !defKeys.has(k)));
    for (const d of propertyDefs) {
      const v = props[d.key];
      if (d.type === "multi_select") {
        if (Array.isArray(v) && v.length) outProps[d.key] = v;
      } else if (d.type === "number" || d.type === "currency") {
        if (v !== "") {
          const n = Number(v);
          outProps[d.key] = Number.isFinite(n) ? n : v; // free-text numbers (e.g. "3 years") kept raw
        }
      } else if (typeof v === "string" && v !== "") {
        outProps[d.key] = v;
      }
    }

    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csmId: csmId || null,
          fields: {
            domain: fields.domain,
            industry: fields.industry,
            country: fields.country,
            employees: fields.employees === "" ? null : Number(fields.employees),
            segment: fields.segment,
            status: fields.status,
            renewalDate: fields.renewalDate || null,
            startedAt: fields.startedAt || null,
          },
          properties: outProps,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `Save failed (${res.status})`);
      router.refresh();
      onClose();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" onClick={onClose} />
      <div className="relative z-10 flex h-full w-full max-w-xl flex-col bg-bg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <div className="eyebrow">Edit account</div>
            <h2 className="font-display text-lg font-bold text-fg">{client.name}</h2>
          </div>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-md text-fg-muted hover:bg-bg-muted hover:text-fg">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <Section title="Overview">
            <SelectField label="Customer Success Manager" value={csmId} onChange={setCsmId}
              options={[{ value: "", label: "Unassigned" }, ...csmUsers.map((c) => ({ value: c.id, label: c.name }))]} />
            <SelectField label="Status" value={fields.status} onChange={(v) => setField("status", v)}
              options={[{ value: "active", label: "Active" }, { value: "at_risk", label: "At risk" }, { value: "churned", label: "Churned" }]} />
            <SelectField label="Segment" value={fields.segment} onChange={(v) => setField("segment", v)}
              options={[{ value: "enterprise", label: "Enterprise" }, { value: "mid_market", label: "Mid-market" }, { value: "smb", label: "SMB" }]} />
            <TextField label="Domain" value={fields.domain} onChange={(v) => setField("domain", v)} />
            <TextField label="Industry" value={fields.industry} onChange={(v) => setField("industry", v)} />
            <TextField label="Country" value={fields.country} onChange={(v) => setField("country", v)} />
            <TextField label="Employees" type="number" value={fields.employees} onChange={(v) => setField("employees", v)} />
            <TextField label="Renewal date" type="date" value={fields.renewalDate} onChange={(v) => setField("renewalDate", v)} />
            <TextField label="Customer since" type="date" value={fields.startedAt} onChange={(v) => setField("startedAt", v)} />
          </Section>

          {groups.map((g) => (
            <Section key={g.key} title={g.label}>
              {g.defs.map((d) => (
                <PropInput key={d.key} def={d} value={props[d.key]} onChange={(v) => setProp(d.key, v)} />
              ))}
            </Section>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-4">
          {error && <p className="mb-2 font-body text-[12px] text-[#B23A57]">{error}</p>}
          <div className="flex items-center justify-end gap-2.5">
            <button onClick={onClose} disabled={saving}
              className="rounded-[10px] px-4 py-2 font-body text-[13px] font-semibold text-fg-muted hover:text-fg disabled:opacity-50">
              Cancel
            </button>
            <button onClick={save} disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-[10px] bg-sirius px-4 py-2 font-body text-[13px] font-semibold text-white transition-colors hover:bg-cosmos disabled:opacity-60">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- field pieces */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 last:mb-0">
      <div className="eyebrow mb-3">{title}</div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}

const inputCls =
  "w-full rounded-[10px] border border-border bg-surface px-3 py-2 font-body text-[13px] text-fg outline-none transition-colors focus:border-sirius-200 focus:ring-2 focus:ring-sirius/10";

function Label({ children }: { children: React.ReactNode }) {
  return <span className="mb-1.5 block font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">{children}</span>;
}

function TextField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />
    </label>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

function PropInput({ def, value, onChange }: { def: PropertyDefinition; value: string | string[]; onChange: (v: string | string[]) => void }) {
  if (def.type === "single_select") {
    return (
      <SelectField label={def.label} value={(value as string) ?? ""} onChange={onChange}
        options={[{ value: "", label: "—" }, ...def.options.map((o) => ({ value: o, label: o }))]} />
    );
  }
  if (def.type === "multi_select") {
    const arr = Array.isArray(value) ? value : [];
    const toggle = (opt: string) => onChange(arr.includes(opt) ? arr.filter((x) => x !== opt) : [...arr, opt]);
    // Include any current values that aren't in the defined options.
    const opts = [...new Set([...def.options, ...arr])];
    return (
      <div className="sm:col-span-2">
        <Label>{def.label}</Label>
        <div className="flex flex-wrap gap-1.5">
          {opts.map((opt) => {
            const on = arr.includes(opt);
            return (
              <button key={opt} type="button" onClick={() => toggle(opt)}
                className={cn(
                  "rounded-pill border px-2.5 py-1 font-body text-[12px] font-medium transition-colors",
                  on ? "border-sirius bg-accent-soft text-sirius" : "border-border bg-surface text-fg-muted hover:border-sirius-200",
                )}>
                {opt}
              </button>
            );
          })}
        </div>
      </div>
    );
  }
  const type = def.type === "date" ? "date" : def.type === "number" || def.type === "currency" ? "text" : "text";
  return <TextField label={def.label} type={type} value={(value as string) ?? ""} onChange={onChange} />;
}
