"use client";

/* Relationship map — the COMPLEMENTARY view. The list stays authoritative.

   Deliberately not a free-form force-directed graph. Those look impressive on
   six invented nodes and become an unreadable hairball on a real enterprise
   account, which is exactly when a CSM needs it. Instead:

     - `reports_to` is the only hierarchical link, so it alone forms the
       layout: reporting depth becomes a row. Cycles can't occur because the
       server refuses to write one (saveStakeholderLinkAction walks the chain).
     - Everyone with no manager sits at the top row. That includes genuinely
       senior people AND people nobody has mapped yet, which is honest — an
       unmapped person having no position is information.
     - Lateral links (influences / blocks / sponsors …) are listed per person
       rather than drawn as crossing edges. Text beats spaghetti, and it is
       readable on a phone, where an SVG graph is not.

   Mobile gets the same component: rows stack, and the whole thing scrolls
   horizontally inside its own container rather than forcing the page to. */

import { useMemo, useState } from "react";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/cn";
import {
  LINK_KINDS, LINK_LABEL, ROLE_LABEL, stakeholderName, stakeholderInitials,
  type StakeholderLink, type StakeholderProfile,
} from "@/lib/stakeholders/profile";
import { saveStakeholderLinkAction, deleteStakeholderLinkAction } from "@/app/(app)/clients/[id]/stakeholder-actions";

const selectCls =
  "rounded-lg border border-border bg-bg px-2.5 py-1.5 font-body text-[12.5px] text-fg outline-none focus:border-sirius";

/** Reporting depth per stakeholder. Anyone without a manager is depth 0. */
function useLayers(profiles: StakeholderProfile[], links: StakeholderLink[]) {
  return useMemo(() => {
    const managerOf = new Map(links.filter((l) => l.kind === "reports_to").map((l) => [l.fromId, l.toId]));
    const byId = new Map(profiles.map((p) => [p.id, p]));
    const depth = (id: string) => {
      let d = 0;
      let cursor = managerOf.get(id);
      const seen = new Set([id]);
      // The server prevents cycles, but a hand-edited blob could still contain
      // one — bail rather than spin.
      while (cursor && !seen.has(cursor) && byId.has(cursor) && d < 12) {
        seen.add(cursor); cursor = managerOf.get(cursor); d++;
      }
      return d;
    };
    const layers = new Map<number, StakeholderProfile[]>();
    for (const p of profiles) {
      const d = depth(p.id);
      if (!layers.has(d)) layers.set(d, []);
      layers.get(d)!.push(p);
    }
    return [...layers.entries()].sort((a, b) => a[0] - b[0]);
  }, [profiles, links]);
}

export function RelationshipMap({ profiles, links, clientId, canEdit, onLinksChange, onOpen }: {
  profiles: StakeholderProfile[];
  links: StakeholderLink[];
  clientId: string;
  canEdit: boolean;
  onLinksChange: (links: StakeholderLink[]) => void;
  onOpen: (p: StakeholderProfile) => void;
}) {
  const layers = useLayers(profiles, links);
  const byId = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ fromId: "", toId: "", kind: "reports_to" as StakeholderLink["kind"] });

  async function addLink() {
    setBusy(true); setError(null);
    const r = await saveStakeholderLinkAction(clientId, form);
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "Couldn't save."); return; }
    if (r.link) { onLinksChange([...links, r.link]); setAdding(false); setForm({ fromId: "", toId: "", kind: "reports_to" }); }
  }

  async function removeLink(id: string) {
    setBusy(true);
    const r = await deleteStakeholderLinkAction(clientId, id);
    setBusy(false);
    if (r.ok) onLinksChange(links.filter((l) => l.id !== id));
    else setError(r.error ?? "Couldn't remove.");
  }

  if (profiles.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border px-5 py-8 text-center">
        <p className="font-body text-[13px] text-fg-muted">Add stakeholders before mapping how they relate.</p>
      </div>
    );
  }

  const lateral = links.filter((l) => l.kind !== "reports_to");

  return (
    <div className="flex flex-col gap-4">
      {error && <p role="alert" className="font-body text-[12.5px] text-[#B23A57]">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-border bg-bg-muted/20 p-4">
        <div className="flex min-w-fit flex-col gap-5">
          {layers.map(([depth, people]) => (
            <div key={depth}>
              <p className="mb-1.5 font-body text-[10.5px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">
                {depth === 0 ? "No manager mapped" : `Reports up ${depth} level${depth === 1 ? "" : "s"}`}
              </p>
              <div className="flex flex-wrap gap-2">
                {people.map((p) => {
                  const mgrId = links.find((l) => l.kind === "reports_to" && l.fromId === p.id)?.toId;
                  const mgr = mgrId ? byId.get(mgrId) : null;
                  return (
                    <button key={p.id} onClick={() => onOpen(p)}
                      className="flex min-w-[190px] max-w-[240px] items-start gap-2.5 rounded-xl border border-border bg-bg px-3 py-2.5 text-left transition-colors hover:border-sirius">
                      <Avatar initials={stakeholderInitials(p)} size={30} />
                      <span className="min-w-0 flex-1">
                        <span dir="auto" className="block truncate font-body text-[12.5px] font-semibold text-fg">{stakeholderName(p)}</span>
                        {p.jobTitle && <span dir="auto" className="block truncate font-body text-[11px] text-fg-subtle">{p.jobTitle}</span>}
                        {p.roles.length > 0 && (
                          <span className="mt-1 block truncate font-body text-[10.5px] text-sirius">
                            {p.roles.map((r) => ROLE_LABEL[r]).join(" · ")}
                          </span>
                        )}
                        {mgr && (
                          <span dir="auto" className="mt-1 block truncate font-body text-[10.5px] text-fg-subtle">
                            ↳ reports to {stakeholderName(mgr)}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <section aria-labelledby="lateral-h">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 id="lateral-h" className="font-body text-[12px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">
            Other relationships
          </h3>
          {canEdit && !adding && (
            <button onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 font-body text-[12px] font-semibold text-fg-muted transition-colors hover:border-sirius hover:text-sirius">
              <Plus size={12} /> Add relationship
            </button>
          )}
        </div>

        {adding && (
          <div className="mb-2 flex flex-wrap items-end gap-2 rounded-xl border border-border p-3">
            <label className="flex flex-col gap-1">
              <span className="font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">Stakeholder</span>
              <select className={selectCls} value={form.fromId} onChange={(e) => setForm((f) => ({ ...f, fromId: e.target.value }))}>
                <option value="">Choose…</option>
                {profiles.map((p) => <option key={p.id} value={p.id}>{stakeholderName(p)}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">Relationship</span>
              <select className={selectCls} value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as StakeholderLink["kind"] }))}>
                {LINK_KINDS.map((k) => <option key={k} value={k}>{LINK_LABEL[k]}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">Other stakeholder</span>
              <select className={selectCls} value={form.toId} onChange={(e) => setForm((f) => ({ ...f, toId: e.target.value }))}>
                <option value="">Choose…</option>
                {profiles.filter((p) => p.id !== form.fromId).map((p) => <option key={p.id} value={p.id}>{stakeholderName(p)}</option>)}
              </select>
            </label>
            <button onClick={addLink} disabled={busy || !form.fromId || !form.toId}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sirius px-3 py-1.5 font-body text-[12.5px] font-semibold text-white disabled:opacity-50">
              {busy && <Loader2 size={12} className="animate-spin" />} Save
            </button>
            <button onClick={() => { setAdding(false); setError(null); }} aria-label="Cancel"
              className="rounded-lg border border-border p-1.5 text-fg-muted hover:text-fg">
              <X size={13} />
            </button>
          </div>
        )}

        {lateral.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center font-body text-[12.5px] text-fg-muted">
            No lateral relationships recorded. These capture influence and blockers that a reporting line doesn&apos;t show.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {lateral.map((l) => {
              const from = byId.get(l.fromId), to = byId.get(l.toId);
              if (!from || !to) return null;
              return (
                <li key={l.id} className="flex items-center gap-2 rounded-lg border border-border-subtle px-3 py-2">
                  <span dir="auto" className="min-w-0 flex-1 font-body text-[12.5px] text-fg">
                    <strong className="font-semibold">{stakeholderName(from)}</strong>
                    <span className="text-fg-muted"> {LINK_LABEL[l.kind].toLowerCase()} </span>
                    <strong className="font-semibold">{stakeholderName(to)}</strong>
                  </span>
                  {canEdit && (
                    <button onClick={() => removeLink(l.id)} disabled={busy}
                      aria-label={`Remove: ${stakeholderName(from)} ${LINK_LABEL[l.kind].toLowerCase()} ${stakeholderName(to)}`}
                      className="shrink-0 rounded p-1 text-fg-subtle transition-colors hover:text-[#B23A57]">
                      <Trash2 size={12} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
