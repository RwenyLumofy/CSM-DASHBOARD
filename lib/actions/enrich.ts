/* =========================================================================
   AI enrichment — turns detected ActionSignals into CSM-ready wording via
   Gemini, with a deterministic fallback. The signal layer already decided
   WHAT to flag and carries template text; this only rewrites the phrasing to
   be specific and readable. If Gemini isn't configured, the call fails, or it
   omits a signal, that signal keeps its template title/insight.
   ========================================================================= */

import "server-only";
import type { Client } from "@/lib/types";
import type { UsageResult } from "@/lib/usage/types";
import { integrations } from "@/lib/config";
import { GeminiClient } from "@/lib/integrations/gemini";
import type { ActionSignal } from "@/lib/actions/signals";

export interface EnrichedSignal extends ActionSignal {
  source: "ai" | "template";
}

/** A compact, factual snapshot of the account for the model's context. */
function clientFindings(client: Client, usage: UsageResult): string {
  const lines: string[] = [
    `Account: ${client.name}`,
    `Lifecycle status: ${client.status}`,
    `ARR: ${client.arr} ${client.currency}`,
    `Health score: ${client.health.score}/100 (${client.health.tier})`,
  ];
  if (client.renewalDate) lines.push(`Renewal date: ${client.renewalDate.slice(0, 10)}`);
  if (usage.status === "ok") {
    const m = usage.metrics;
    lines.push(`Usage: ${m.wau} weekly-active, ${m.mau} monthly-active, of ${m.seats || m.total_users} seats`);
  } else {
    lines.push(`Usage: unavailable (${usage.status})`);
  }
  if (client.support.csat != null) lines.push(`CSAT: ${client.support.csat} (${client.support.csatScale})`);
  if (client.support.nps != null) lines.push(`NPS: ${client.support.nps}`);
  return lines.join("\n");
}

const RESPONSE_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      signalKey: { type: "string" },
      title: { type: "string" },
      insight: { type: "string" },
    },
    required: ["signalKey", "title", "insight"],
  },
} as const;

function buildPrompt(client: Client, usage: UsageResult, signals: ActionSignal[]): string {
  const signalList = signals
    .map((s) => `- signalKey "${s.signalKey}" [${s.priority}, ${s.category}]: ${s.title} | facts: ${JSON.stringify(s.facts)}`)
    .join("\n");
  return `You are a Customer Success operations assistant. Below is a snapshot of one account and a list of detected "action signals" — situations the CSM should act on. Rewrite EACH signal as a concise, specific directive.

Rules:
- Return a JSON array with one object per signal, each: {"signalKey": string, "title": string, "insight": string}.
- Cover EVERY signalKey exactly once. Keep the same signalKey values.
- title: an imperative directive, <= 12 words, naming the account.
- insight: <= 30 words — why it matters + the concrete next step. Use the real numbers from the facts.
- Do NOT invent facts, dates, or names beyond what's given. Do not add signals.
- Tone: direct, practical, for a busy CSM. No fluff, no greetings.

ACCOUNT SNAPSHOT
${clientFindings(client, usage)}

DETECTED SIGNALS
${signalList}`;
}

/** Rewrite signals via Gemini; fall back to the template wording per-signal on
 *  any miss. Returns one EnrichedSignal per input signal, order preserved. */
export async function enrichSignals(client: Client, usage: UsageResult, signals: ActionSignal[]): Promise<EnrichedSignal[]> {
  if (signals.length === 0) return [];
  const asTemplate = (): EnrichedSignal[] => signals.map((s) => ({ ...s, source: "template" as const }));

  if (!integrations.gemini()) return asTemplate();

  try {
    const client_ = new GeminiClient();
    const rows = await client_.generateJson<{ signalKey: string; title: string; insight: string }[]>(
      buildPrompt(client, usage, signals),
      RESPONSE_SCHEMA as unknown as Record<string, unknown>,
    );
    const byKey = new Map(rows.map((r) => [r.signalKey, r]));
    return signals.map((s) => {
      const ai = byKey.get(s.signalKey);
      if (ai && typeof ai.title === "string" && ai.title.trim() && typeof ai.insight === "string" && ai.insight.trim()) {
        return { ...s, title: ai.title.trim(), insight: ai.insight.trim(), source: "ai" as const };
      }
      return { ...s, source: "template" as const };
    });
  } catch {
    // Any transport/parse/API failure — the feed still works on templates.
    return asTemplate();
  }
}
