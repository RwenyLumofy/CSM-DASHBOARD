"use client";

/* Today page — Ask Signal. A grounded Q&A surface: the mocked response NEVER
   presents an unsupported conclusion — it always shows supporting signals,
   evidence dates, confidence, a recommended next action, and referenced
   entities. Uses the unified @mention input. */

import { useMemo, useState } from "react";
import { Sparkles, ArrowUp, Loader2, Plus } from "lucide-react";
import type { Confidence, MentionEntity, Signal } from "@/lib/today/types";
import { getPriorities, getSignalsForPriority, getAccount, resolveMention, relativeTime } from "@/lib/today/repo";
import { formatMoney } from "@/lib/today/format";
import { track } from "@/lib/today/analytics";
import { Drawer } from "./Drawer";
import { MentionInput, EntityMention } from "./mentions";
import { ConfidenceIndicator, EvidenceFreshness } from "./primitives";
import { useToday } from "./TodayContext";

// Generic prompts that never name a specific account (safe on any portfolio).
const GENERIC_SUGGESTIONS = [
  "Which renewals have no executive sponsor?",
  "Which accounts have healthy adoption but commercial risk?",
  "Which accounts are ready for expansion?",
  "What changed across my portfolio this week?",
];

interface Answer {
  conclusion: string;
  signals: Signal[];
  confidence: Confidence;
  recommendedAction: string;
  refs: MentionEntity[];
  accountId?: string;
}

/** Deterministic, grounded mock responder. Matches the question against real
 *  mock signals so every conclusion is backed by visible evidence. */
function mockAnswer(text: string, mentions: MentionEntity[]): Answer {
  const priorities = getPriorities("company", null);
  const lc = text.toLowerCase();
  const mentionedAccount = mentions.find((m) => m.type === "account") as Extract<MentionEntity, { type: "account" }> | undefined;
  const byName = priorities.find((p) => { const a = getAccount(p.accountId); return a && lc.includes(a.name.toLowerCase().slice(0, 6)); });
  const target = priorities.find((p) => p.accountId === mentionedAccount?.id) ?? byName;

  if (target) {
    const signals = getSignalsForPriority(target);
    return {
      conclusion: `${getAccount(target.accountId)?.name} is ranked #${target.rank} because ${target.reason.toLowerCase()} ${formatMoney(target.valueAtStake)} of ${target.valueKind === "expansion" ? "expansion value" : "ARR exposure"} is at stake.`,
      signals, confidence: target.confidence, recommendedAction: target.recommendedAction,
      refs: [resolveMention({ type: "account", id: target.accountId })!, resolveMention({ type: "user", id: target.suggestedActionOwnerId })!],
      accountId: target.accountId,
    };
  }
  if (lc.includes("expansion")) {
    const grow = priorities.find((p) => p.state === "grow") ?? priorities[0];
    const signals = getSignalsForPriority(grow);
    return { conclusion: `${getAccount(grow.accountId)?.name} is the clearest expansion candidate — ${grow.reason.toLowerCase()}`, signals, confidence: grow.confidence, recommendedAction: grow.recommendedAction, refs: [resolveMention({ type: "account", id: grow.accountId })!], accountId: grow.accountId };
  }
  // Portfolio default
  const top = priorities[0];
  return {
    conclusion: `Across your portfolio, the highest-priority account is ${getAccount(top.accountId)?.name} — ${top.reason.toLowerCase()}`,
    signals: getSignalsForPriority(top), confidence: top.confidence, recommendedAction: top.recommendedAction,
    refs: priorities.slice(0, 3).map((p) => resolveMention({ type: "account", id: p.accountId })!), accountId: top.accountId,
  };
}

export function AskSignalDrawer({ prefill, onClose }: { prefill?: string; onClose: () => void }) {
  const { openAddTask } = useToday();
  const [text, setText] = useState(prefill ?? "");
  const [mentions, setMentions] = useState<MentionEntity[]>([]);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [loading, setLoading] = useState(false);

  // Suggested questions are grounded in the viewer's real top accounts — no
  // hardcoded names that might not exist in this portfolio.
  const suggested = useMemo(() => {
    const names = getPriorities("company", null).map((p) => getAccount(p.accountId)?.name).filter((n): n is string => !!n);
    const dyn: string[] = [];
    if (names[0]) dyn.push(`Why is ${names[0]} prioritised?`);
    if (names[0] && names[1]) dyn.push(`Compare ${names[0]} with ${names[1]}.`);
    return [...dyn, ...GENERIC_SUGGESTIONS];
  }, []);

  function submit(q?: string) {
    const query = q ?? text;
    if (!query.trim()) return;
    if (q) setText(q);
    track("ask_signal_submitted", { length: query.length });
    setLoading(true);
    setAnswer(null);
    setTimeout(() => { setAnswer(mockAnswer(query, mentions)); setLoading(false); }, 500);
  }

  return (
    <Drawer eyebrow="Ask Signal" title={<span className="inline-flex items-center gap-2"><Sparkles size={16} className="text-sirius" /> Ask Signal</span>} subtitle="Grounded answers with visible evidence — never unsupported conclusions." onClose={onClose} width="lg">
      <div className="flex flex-col gap-4">
        <div>
          <MentionInput value={text} onChange={setText} mentions={mentions} onMentionsChange={setMentions} placeholder="Ask about accounts, renewals, risk or expansion… type @ to mention" rows={3} autoFocus ariaLabel="Ask Signal question" />
          <div className="mt-2 flex justify-end">
            <button onClick={() => submit()} disabled={!text.trim() || loading} className="inline-flex items-center gap-1.5 rounded-lg bg-sirius px-3 py-2 font-body text-[13px] font-semibold text-white disabled:opacity-40">
              {loading ? <Loader2 size={14} className="animate-spin" /> : <ArrowUp size={14} />} Ask
            </button>
          </div>
        </div>

        {!answer && !loading && (
          <div>
            <p className="mb-2 font-body text-[11.5px] font-semibold uppercase tracking-[0.04em] text-fg-subtle">Suggested questions</p>
            <div className="flex flex-col gap-1.5">
              {suggested.map((q) => (
                <button key={q} onClick={() => submit(q)} className="rounded-lg border border-border bg-surface px-3 py-2 text-left font-body text-[12.5px] text-fg-muted transition-colors hover:border-sirius hover:text-sirius">{q}</button>
              ))}
            </div>
          </div>
        )}

        {loading && <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-4 font-body text-[12.5px] text-fg-muted"><Loader2 size={14} className="animate-spin" /> Gathering evidence…</div>}

        {answer && (
          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="font-body text-[13.5px] font-medium text-fg">{answer.conclusion}</p>

            <h4 className="mb-1.5 mt-3 font-body text-[11px] font-semibold uppercase tracking-[0.04em] text-fg-subtle">Supporting signals</h4>
            <ul className="flex flex-col gap-1.5">
              {answer.signals.map((s) => (
                <li key={s.id} className="rounded-md border border-border-subtle bg-bg-muted/30 px-2.5 py-1.5">
                  <div className="font-body text-[12.5px] font-medium text-fg">{s.type}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 font-body text-[11px] text-fg-subtle">
                    {s.evidence.map((e) => <span key={e.id}>{e.label} · {relativeTime(e.observedAt)}</span>)}
                  </div>
                  <div className="mt-1"><EvidenceFreshness freshness={s.dataFreshness} /></div>
                </li>
              ))}
            </ul>

            <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-3">
              <ConfidenceIndicator confidence={answer.confidence} />
              <div className="flex flex-wrap items-center gap-1.5">{answer.refs.filter(Boolean).map((r) => <EntityMention key={`${r.type}-${r.id}`} entity={r} />)}</div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-accent-soft/50 px-3 py-2">
              <span className="font-body text-[12.5px] text-fg"><span className="font-semibold">Recommended:</span> {answer.recommendedAction}</span>
              {answer.accountId && <button onClick={() => openAddTask({ accountId: answer.accountId, title: answer.recommendedAction, ...(answer.signals[0] ? { sourceType: "signal" as const, sourceId: answer.signals[0].id } : {}) })} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-sirius px-2.5 py-1.5 font-body text-[12px] font-semibold text-white"><Plus size={12} /> Add as task</button>}
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
}
