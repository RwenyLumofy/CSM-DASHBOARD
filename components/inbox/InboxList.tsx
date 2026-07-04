"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, RotateCcw, ExternalLink, Loader2, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Notification } from "@/lib/types";
import { resolveActionAction, reopenActionAction } from "@/app/(app)/inbox/actions";
import { cn } from "@/lib/cn";

const TYPE_LABEL: Record<string, string> = {
  assignment_needs_admin: "Needs your choice",
  assignment_review: "Assignment",
  client_assigned: "Assigned to you",
  system: "System",
};

const TYPE_TONE: Record<string, string> = {
  assignment_needs_admin: "border-[#B23A57]/30 bg-[#B23A57]/8 text-[#B23A57]",
  assignment_review: "border-sirius/30 bg-accent-soft text-sirius",
  client_assigned: "border-[#2DB47A]/30 bg-[#2DB47A]/10 text-[#2DB47A]",
  system: "border-border bg-bg-muted text-fg-muted",
};

function Item({ n, done }: { n: Notification; done?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      if (done) await reopenActionAction(n.id);
      else await resolveActionAction(n.id);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={cn("flex flex-wrap items-start gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm", done && "opacity-60")}>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className={cn("inline-flex items-center rounded-pill border px-2 py-0.5 font-body text-[10.5px] font-semibold uppercase tracking-[0.04em]", TYPE_TONE[n.type] ?? TYPE_TONE.system)}>
            {TYPE_LABEL[n.type] ?? "Notification"}
          </span>
          <span className="font-body text-[10.5px] text-fg-subtle">{formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}</span>
        </div>
        <p className="font-body text-[13.5px] font-semibold text-fg">{n.title}</p>
        {n.body && <p className="mt-0.5 font-body text-[12.5px] text-fg-muted">{n.body}</p>}
        {n.clientId && (
          <Link href={`/clients/${n.clientId}`} className="mt-1.5 inline-flex items-center gap-1 font-body text-[12px] font-semibold text-sirius hover:underline">
            Open client <ExternalLink size={12} />
          </Link>
        )}
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-body text-[12px] font-semibold transition-colors disabled:opacity-50",
          done ? "border-border text-fg-muted hover:text-fg" : "border-sirius/40 text-sirius hover:bg-accent-soft",
        )}
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : done ? <RotateCcw size={13} /> : <Check size={13} />}
        {done ? "Reopen" : "Mark done"}
      </button>
    </li>
  );
}

export function InboxList({ open, done }: { open: Notification[]; done: Notification[] }) {
  const [showDone, setShowDone] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="mb-3 font-display text-sm font-semibold text-fg">Open · {open.length}</h2>
        {open.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center">
            <CheckCircle2 size={28} className="text-[#2DB47A]" />
            <p className="font-body text-sm font-medium text-fg">Nothing needs your attention.</p>
            <p className="font-body text-[12.5px] text-fg-subtle">New assignments and action items will show up here.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2.5">{open.map((n) => <Item key={n.id} n={n} />)}</ul>
        )}
      </section>

      {done.length > 0 && (
        <section>
          <button onClick={() => setShowDone((s) => !s)} className="mb-3 font-display text-sm font-semibold text-fg-muted hover:text-fg">
            {showDone ? "Hide" : "Show"} resolved · {done.length}
          </button>
          {showDone && <ul className="flex flex-col gap-2.5">{done.map((n) => <Item key={n.id} n={n} done />)}</ul>}
        </section>
      )}
    </div>
  );
}
