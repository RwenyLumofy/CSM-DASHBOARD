"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, RefreshCw, TrendingDown, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/format";
import { recordArrAction } from "@/app/(app)/clients/[id]/actions";
import type { ArrEventInput } from "@/lib/types";

type Kind = "renewal" | "expansion" | "contraction" | "churn";

const KINDS: { key: Kind; label: string; icon: typeof RefreshCw }[] = [
  { key: "renewal", label: "Renewal", icon: RefreshCw },
  { key: "expansion", label: "Expansion", icon: ArrowUpRight },
  { key: "contraction", label: "Downgrade", icon: TrendingDown },
  { key: "churn", label: "Churn", icon: XCircle },
];

const VALUE_LABEL: Record<Kind, string> = {
  renewal: "Renewed ARR (new annual value)",
  expansion: "ARR added",
  contraction: "ARR reduced by",
  churn: "",
};

export function ArrActions({
  clientId,
  currentArr,
  currency,
}: {
  clientId: string;
  currentArr: number;
  currency: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<Kind | null>(null);
  const [value, setValue] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(today());
  const [renewalDate, setRenewalDate] = useState(addYear(today()));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset(kind: Kind | null) {
    setOpen(kind);
    setError(null);
    setNote("");
    setEffectiveDate(today());
    setRenewalDate(addYear(today()));
    setValue(kind === "renewal" ? String(currentArr) : "");
  }

  function submit() {
    if (!open) return;
    const num = Number(value);
    if (open !== "churn" && (value.trim() === "" || !Number.isFinite(num) || num <= 0)) {
      setError(open === "renewal" ? "Enter the renewed ARR (greater than 0)." : "Enter an amount greater than 0.");
      return;
    }
    const input: ArrEventInput = {
      clientId,
      type: open,
      value: open === "churn" ? 0 : num,
      effectiveDate,
      renewalDate: open === "renewal" ? renewalDate : undefined,
      note: note.trim() || null,
    };
    startTransition(async () => {
      const res = await recordArrAction(input);
      if (!res.ok) {
        setError(res.error ?? "Something went wrong.");
        return;
      }
      reset(null);
      setOpen(null);
      router.refresh();
    });
  }

  const projected =
    open === "renewal" ? Number(value) || 0
    : open === "expansion" ? currentArr + (Number(value) || 0)
    : open === "contraction" ? Math.max(0, currentArr - (Number(value) || 0))
    : open === "churn" ? 0
    : currentArr;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        {KINDS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => reset(open === key ? null : key)}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-[10px] border px-3 py-2 font-body text-[13px] font-semibold transition-colors",
              open === key
                ? "border-sirius bg-accent-soft text-sirius"
                : "border-border-strong text-fg hover:bg-accent-soft hover:border-sirius-200",
            )}
          >
            <Icon size={15} strokeWidth={1.75} />
            {label}
          </button>
        ))}
      </div>

      {open && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-bg-subtle p-4">
          <div className="flex items-center justify-between">
            <span className="font-body text-[13px] font-semibold text-fg">Record {labelFor(open)}</span>
            <button onClick={() => setOpen(null)} className="text-fg-subtle hover:text-fg" aria-label="Close">
              <X size={16} />
            </button>
          </div>

          {open !== "churn" && (
            <Field label={VALUE_LABEL[open]}>
              <input
                type="number"
                min="0"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className={inputCls}
                placeholder="0"
              />
            </Field>
          )}

          <Field label="Effective date">
            <input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className={inputCls} />
          </Field>

          {open === "renewal" && (
            <Field label="Next renewal date">
              <input type="date" value={renewalDate} onChange={(e) => setRenewalDate(e.target.value)} className={inputCls} />
            </Field>
          )}

          <Field label="Note (optional)">
            <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="Context for this change" />
          </Field>

          <div className="flex items-center justify-between border-t border-border-subtle pt-3">
            <span className="caption">
              ARR {formatCurrency(currentArr, currency, { compact: true })} →{" "}
              <span className="font-semibold text-fg">{formatCurrency(projected, currency, { compact: true })}</span>
            </span>
            <Button size="sm" onClick={submit} disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>

          {error && <span className="font-body text-[12px] text-[#B23A57]">{error}</span>}
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-border bg-surface px-3 py-2 font-body text-[13px] text-fg outline-none focus:border-sirius-200";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-body text-[12px] font-medium text-fg-muted">{label}</span>
      {children}
    </label>
  );
}

function labelFor(k: Kind): string {
  return { renewal: "renewal", expansion: "expansion", contraction: "downgrade", churn: "churn" }[k];
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function addYear(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}
