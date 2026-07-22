"use client";

/* =========================================================================
   Today page — unified @mention system (accounts · people · pages).

   • EntityMention / RichText: render a resolved mention inline as a structured,
     subtly-distinct entity (NOT a bright hashtag). Click opens the right
     overlay via TodayContext. IDs are always preserved; names are display-only.
   • MentionInput + MentionMenu: a lightweight `@` autocomplete built on a
     controlled <textarea> + a grouped popover — no heavy editor dependency.
     Selected mentions are tracked as structured MentionEntity chips (type+id),
     so the entity is never identified by display name alone.
   ========================================================================= */

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Building2, FileText, AtSign } from "lucide-react";
import { cn } from "@/lib/cn";
import type { InlineSpan, MentionEntity, MentionRef } from "@/lib/today/types";
import { resolveMention, searchMentions } from "@/lib/today/repo";
import { track } from "@/lib/today/analytics";
import { useToday } from "./TodayContext";

function initials(name: string): string {
  const p = name.split(/[\s]+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || name.slice(0, 2).toUpperCase();
}

/* ---------------------------------------------------- inline entity chip */

export function EntityMention({ entity }: { entity: MentionEntity }) {
  const { openAccount, openUser, openPage } = useToday();
  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // a mention never triggers its container's click
    if (entity.type === "account") { track("account_mention_selected", { id: entity.id }); openAccount(entity.id); }
    else if (entity.type === "user") { track("user_mention_selected", { id: entity.id }); openUser(entity.id); }
    else { track("page_mention_selected", { id: entity.id }); openPage(entity.id); }
  };
  const display = entity.type === "page" ? entity.title : entity.name;
  return (
    <button
      type="button"
      onClick={onClick}
      className="mx-0.5 inline-flex max-w-full items-center gap-1 rounded border-b border-dotted border-border-strong bg-accent-soft/50 px-1 align-baseline font-body text-[0.94em] font-medium text-sirius-900 transition-colors hover:bg-accent-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-sirius"
      title={`Open ${entity.type}`}
    >
      {entity.type === "account" && <Building2 size={11} className="shrink-0 text-sirius" />}
      {entity.type === "user" && <span className="grid size-3.5 shrink-0 place-items-center rounded-full bg-sirius text-[7px] font-bold text-white">{initials(entity.name)}</span>}
      {entity.type === "page" && <FileText size={11} className="shrink-0 text-eclipse" />}
      <span className="truncate">{display}</span>
    </button>
  );
}

export function Mention({ refItem }: { refItem: MentionRef }) {
  const entity = resolveMention(refItem);
  if (!entity) return <span className="text-fg-subtle">@unknown</span>;
  return <EntityMention entity={entity} />;
}

/** Render InlineSpan[] as text with links and structured mentions. */
export function RichText({ spans, className }: { spans: InlineSpan[]; className?: string }) {
  return (
    <span className={className}>
      {spans.map((s, i) => {
        if ("mention" in s) return <Mention key={i} refItem={s.mention} />;
        if ("link" in s) return <a key={i} href={s.link} className="text-sirius underline-offset-2 hover:underline">{s.text}</a>;
        return <span key={i}>{s.text}</span>;
      })}
    </span>
  );
}

/* ------------------------------------------------------ mention menu */

interface FlatResult { entity: MentionEntity; group: string }

export function MentionMenu({ query, activeIndex, onPick, onHover }: {
  query: string; activeIndex: number; onPick: (e: MentionEntity) => void; onHover: (i: number) => void;
}) {
  const { flat, groups } = useMemo(() => {
    const r = searchMentions(query);
    const flat: FlatResult[] = [
      ...r.accounts.map((entity) => ({ entity, group: "Accounts" })),
      ...r.users.map((entity) => ({ entity, group: "People" })),
      ...r.pages.map((entity) => ({ entity, group: "Pages" })),
    ];
    return { flat, groups: { Accounts: r.accounts.length, People: r.users.length, Pages: r.pages.length } };
  }, [query]);

  if (flat.length === 0) {
    return <div className="px-3 py-2.5 font-body text-[12px] text-fg-subtle">No matches for “{query}”</div>;
  }

  let idx = -1;
  return (
    <div role="listbox" aria-label="Mention suggestions" className="max-h-64 overflow-y-auto py-1">
      {(["Accounts", "People", "Pages"] as const).map((g) =>
        groups[g] > 0 ? (
          <div key={g}>
            <div className="px-3 pb-1 pt-2 font-body text-[10px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">{g}</div>
            {flat.filter((f) => f.group === g).map((f) => {
              idx += 1;
              const i = idx;
              const active = i === activeIndex;
              return <MentionResult key={`${f.entity.type}-${f.entity.id}`} entity={f.entity} active={active} onPick={() => onPick(f.entity)} onHover={() => onHover(i)} />;
            })}
          </div>
        ) : null,
      )}
    </div>
  );
}

function MentionResult({ entity, active, onPick, onHover }: { entity: MentionEntity; active: boolean; onPick: () => void; onHover: () => void }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onMouseEnter={onHover}
      onMouseDown={(e) => { e.preventDefault(); onPick(); }}
      className={cn("flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors", active ? "bg-accent-soft" : "hover:bg-bg-muted")}
    >
      {entity.type === "account" && <span className="grid size-6 shrink-0 place-items-center rounded bg-sirius/10 text-sirius"><Building2 size={13} /></span>}
      {entity.type === "user" && <span className="grid size-6 shrink-0 place-items-center rounded-full bg-sirius text-[9px] font-bold text-white">{initials(entity.name)}</span>}
      {entity.type === "page" && <span className="grid size-6 shrink-0 place-items-center rounded bg-eclipse/10 text-eclipse"><FileText size={13} /></span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-body text-[13px] font-medium text-fg">{entity.type === "page" ? entity.title : entity.name}</span>
        <span className="block truncate font-body text-[11px] text-fg-subtle">
          {entity.type === "account" && [entity.tier, entity.arr ? `$${Math.round(entity.arr / 1000)}K` : null, entity.csmName].filter(Boolean).join(" · ")}
          {entity.type === "user" && [entity.role, entity.team].filter(Boolean).join(" · ")}
          {entity.type === "page" && "Signal page"}
        </span>
      </span>
    </button>
  );
}

/* ------------------------------------------------------ mention input */

const AT_RE = /@([\w .'-]*)$/;

export function MentionInput({ value, onChange, mentions, onMentionsChange, placeholder, rows = 3, autoFocus, ariaLabel }: {
  value: string;
  onChange: (v: string) => void;
  mentions: MentionEntity[];
  onMentionsChange: (m: MentionEntity[]) => void;
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [menu, setMenu] = useState<{ query: string; start: number } | null>(null);
  const [active, setActive] = useState(0);

  function syncMenu(text: string, caret: number) {
    const before = text.slice(0, caret);
    const m = AT_RE.exec(before);
    if (m) { setMenu({ query: m[1], start: caret - m[0].length }); setActive(0); }
    else setMenu(null);
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    onChange(e.target.value);
    syncMenu(e.target.value, e.target.selectionStart ?? e.target.value.length);
  }

  function pick(entity: MentionEntity) {
    if (!menu) return;
    const label = entity.type === "page" ? entity.title : entity.name;
    const caret = ref.current?.selectionStart ?? value.length;
    const next = value.slice(0, menu.start) + `@${label} ` + value.slice(caret);
    onChange(next);
    if (!mentions.some((x) => x.type === entity.type && x.id === entity.id)) onMentionsChange([...mentions, entity]);
    setMenu(null);
    requestAnimationFrame(() => ref.current?.focus());
  }

  function flatCount(): number {
    if (!menu) return 0;
    const r = searchMentions(menu.query);
    return r.accounts.length + r.users.length + r.pages.length;
  }
  function pickActive() {
    if (!menu) return;
    const r = searchMentions(menu.query);
    const flat = [...r.accounts, ...r.users, ...r.pages];
    if (flat[active]) pick(flat[active]);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (!menu) return;
    const n = flatCount();
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (n ? (i + 1) % n : 0)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (n ? (i - 1 + n) % n : 0)); }
    else if (e.key === "Enter" && n) { e.preventDefault(); pickActive(); }
    else if (e.key === "Escape") { e.preventDefault(); setMenu(null); }
  }

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        onKeyDown={onKeyDown}
        onKeyUp={(e) => syncMenu(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)}
        onClick={(e) => syncMenu(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)}
        onBlur={() => setTimeout(() => setMenu(null), 120)}
        placeholder={placeholder}
        rows={rows}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        className="w-full resize-none rounded-lg border border-border bg-bg px-3 py-2 font-body text-[13px] text-fg outline-none ring-sirius focus:ring-2"
      />
      {menu && (
        <div className="absolute left-0 right-0 z-40 mt-1 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
          <MentionMenu query={menu.query} activeIndex={active} onPick={pick} onHover={setActive} />
        </div>
      )}
      {mentions.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <AtSign size={12} className="text-fg-subtle" />
          {mentions.map((m) => (
            <span key={`${m.type}-${m.id}`} className="inline-flex items-center gap-1 rounded-pill border border-border bg-bg-muted/60 px-2 py-0.5 font-body text-[11px] text-fg-muted">
              {m.type === "account" ? <Building2 size={10} /> : m.type === "user" ? <span className="text-[8px] font-bold">{initials(m.name)}</span> : <FileText size={10} />}
              {m.type === "page" ? m.title : m.name}
              <button type="button" onClick={() => onMentionsChange(mentions.filter((x) => !(x.type === m.type && x.id === m.id)))} className="ml-0.5 text-fg-subtle hover:text-fg" aria-label="Remove mention">×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export { initials as mentionInitials };
