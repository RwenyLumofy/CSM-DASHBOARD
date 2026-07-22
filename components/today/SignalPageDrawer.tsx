"use client";

/* Today page — lightweight Signal page viewer (Notion-style, intentionally
   minimal). Renders formatted blocks with entity mentions, relationship
   metadata, and a mocked "Referenced in" backlinks panel. A collaboration
   artifact — NOT a system of record for health/renewal/commercial data. */

import { useState } from "react";
import { FileText, Info, AlertTriangle, CheckCircle2, Minus } from "lucide-react";
import { cn } from "@/lib/cn";
import type { PageBlock, SignalPage } from "@/lib/today/types";
import { getPage, getUser, getBacklinks, relativeTime } from "@/lib/today/repo";
import { Drawer } from "./Drawer";
import { RichText } from "./mentions";
import { AccountRef, UserRef, PageRef } from "./refs";

const KIND_LABEL: Record<SignalPage["kind"], string> = {
  account_plan: "Account plan", success_plan: "Success plan", renewal_plan: "Renewal plan", expansion_brief: "Expansion brief",
  meeting_notes: "Meeting notes", risk_assessment: "Risk assessment", executive_summary: "Executive summary", intervention_plan: "Intervention plan", product_escalation: "Product escalation",
};

export function SignalPageDrawer({ pageId, onClose }: { pageId: string; onClose: () => void }) {
  const page = getPage(pageId);
  if (!page) return null;
  const backlinks = getBacklinks(pageId);
  const createdBy = getUser(page.createdByUserId);
  const editedBy = getUser(page.lastEditedByUserId);

  return (
    <Drawer
      eyebrow={KIND_LABEL[page.kind]}
      title={<span className="inline-flex items-center gap-2"><FileText size={16} className="text-eclipse" /> {page.title}</span>}
      subtitle={<span>Created by {createdBy?.name ?? "—"} · edited {relativeTime(page.updatedAt)} by {editedBy?.name ?? "—"}</span>}
      onClose={onClose}
      width="xl"
    >
      <div className="flex flex-col gap-4">
        {page.primaryAccountId && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-bg-muted/30 px-3 py-2 font-body text-[12px] text-fg-muted">
            <span>Primary account:</span> <AccountRef id={page.primaryAccountId} />
            {page.relatedUserIds.map((id) => <UserRef key={id} id={id} />)}
          </div>
        )}

        {/* Content blocks */}
        <article className="flex flex-col gap-2.5">
          {page.blocks.map((b, i) => <Block key={i} block={b} />)}
        </article>

        {/* Referenced in (backlinks) */}
        <div className="rounded-lg border border-border-subtle bg-bg-muted/20 p-3">
          <h3 className="mb-2 font-body text-[11.5px] font-semibold uppercase tracking-[0.04em] text-fg-subtle">Referenced in</h3>
          {backlinks.actions.length + backlinks.commitments.length + backlinks.pages.length === 0 ? (
            <p className="font-body text-[12px] text-fg-subtle">Not referenced anywhere yet.</p>
          ) : (
            <ul className="flex flex-col gap-1 font-body text-[12.5px] text-fg-muted">
              {backlinks.actions.map((a) => <li key={a.id}>Action · {a.title}</li>)}
              {backlinks.commitments.map((c) => <li key={c.id}>Commitment · {c.title}</li>)}
              {backlinks.pages.map((p) => <li key={p.id} className="inline-flex items-center gap-1">Page · <PageRef id={p.id} /></li>)}
            </ul>
          )}
        </div>
      </div>
    </Drawer>
  );
}

function Block({ block }: { block: PageBlock }) {
  const [checks, setChecks] = useState<Record<number, boolean>>({});
  switch (block.type) {
    case "heading":
      return block.level === 2
        ? <h2 className="mt-1 font-display text-[15px] font-semibold text-fg">{block.text}</h2>
        : <h3 className="mt-1 font-display text-[13.5px] font-semibold text-fg">{block.text}</h3>;
    case "paragraph":
      return <p className="font-body text-[13px] leading-relaxed text-fg-muted"><RichText spans={block.spans} /></p>;
    case "bullets":
      return <ul className="ml-4 flex list-disc flex-col gap-1 font-body text-[13px] text-fg-muted">{block.items.map((it, i) => <li key={i}><RichText spans={it} /></li>)}</ul>;
    case "numbered":
      return <ol className="ml-4 flex list-decimal flex-col gap-1 font-body text-[13px] text-fg-muted">{block.items.map((it, i) => <li key={i}><RichText spans={it} /></li>)}</ol>;
    case "checklist":
      return (
        <ul className="flex flex-col gap-1">
          {block.items.map((it, i) => {
            const on = checks[i] ?? it.checked;
            return (
              <li key={i} className="flex items-start gap-2 font-body text-[13px] text-fg-muted">
                <button onClick={() => setChecks((p) => ({ ...p, [i]: !on }))} className={cn("mt-0.5 grid size-4 shrink-0 place-items-center rounded border", on ? "border-success bg-success text-white" : "border-border-strong")}>{on && <CheckCircle2 size={11} />}</button>
                <span className={cn(on && "text-fg-subtle line-through")}><RichText spans={it.spans} /></span>
              </li>
            );
          })}
        </ul>
      );
    case "callout": {
      const tone = block.tone === "warning" ? "border-warning/30 bg-warning-bg text-warning-fg" : block.tone === "success" ? "border-success/30 bg-success-bg text-success-fg" : "border-info/30 bg-info-bg text-info-fg";
      const Icon = block.tone === "warning" ? AlertTriangle : block.tone === "success" ? CheckCircle2 : Info;
      return <div className={cn("flex items-start gap-2 rounded-lg border px-3 py-2 font-body text-[12.5px]", tone)}><Icon size={14} className="mt-0.5 shrink-0" /><span><RichText spans={block.spans} /></span></div>;
    }
    case "quote":
      return <blockquote className="border-l-2 border-border-strong pl-3 font-body text-[13px] italic text-fg-muted"><RichText spans={block.spans} /></blockquote>;
    case "divider":
      return <hr className="my-1 border-border-subtle" />;
    default:
      return null;
  }
}
