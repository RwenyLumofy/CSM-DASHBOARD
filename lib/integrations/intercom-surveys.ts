/* =========================================================================
   Intercom outbound-survey responses — the NPS + platform-CSAT source.

   One Intercom survey (id 59394884) asks two questions:
     Q1 (question_id 627274) — "How likely are you to recommend us…"  → NPS 0–10
     Q2 (question_id 648874) — "How happy are you with the experience…" → CSAT 1–5

   Intercom has no REST endpoint for survey answers; the only way to read them
   (historical + ongoing) is the async Data Export job, which returns a ZIP of
   CSVs. We use two of them:
     - answer_*.csv          one row per answer: receipt_id, answered_at,
                             question_id, response  → the actual scores, keyed
                             by the STABLE question ids above (robust to the
                             question text ever being reworded).
     - answer_combined_*.csv one row per receipt: user/company/email + received_
                             at/completed_at  → who answered and which account.
   We join them on receipt_id. Parsing/joining/summarizing live here (pure,
   Node-only: Buffer + zlib); the API calls that fetch the ZIP live on
   IntercomClient.exportSurveyResponses (lib/integrations/intercom.ts).
   ========================================================================= */

import zlib from "node:zlib";
import { AST_OFFSET_MS } from "@/lib/sla";
import type { SatisfactionTrendPoint } from "@/lib/types";

export const SURVEY_ID = "59394884";
export const NPS_QUESTION_ID = "627274";
export const CSAT_QUESTION_ID = "648874";

export interface SurveyResponse {
  receiptId: string;
  surveyId: string;
  userId: string | null; // Intercom contact id
  email: string | null;
  name: string | null;
  companyIntercomId: string | null; // Intercom internal company id
  companyExternalId: string | null; // external company_id == account environment id
  npsScore: number | null; // 0–10
  csatScore: number | null; // 1–5
  respondedAt: string | null; // ISO — completed_at ?? received_at ?? latest answered_at
  receivedAt: string | null;
  completedAt: string | null;
}

/* ---------------------------------------------------------------- ZIP read */

/**
 * Minimal ZIP extractor (no dependency) — parses the End-of-Central-Directory
 * record, then each central-directory entry, inflating DEFLATE members with
 * the built-in zlib. Intercom's export ZIP is a plain, non-ZIP64 archive well
 * under 4 GB, so 32-bit sizes/offsets are sufficient. Returns name → bytes.
 */
export function unzip(buf: Buffer): Record<string, Buffer> {
  const out: Record<string, Buffer> = {};
  const EOCD_SIG = 0x06054b50;
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("zip: end-of-central-directory not found");
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error("zip: bad central-directory header");
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.toString("utf8", off + 46, off + 46 + nameLen);
    if (buf.readUInt32LE(localOff) !== 0x04034b50) throw new Error("zip: bad local header");
    // The local header's own name/extra lengths locate the data (they can
    // legitimately differ from the central-directory entry's extra length).
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const comp = buf.subarray(dataStart, dataStart + compSize);
    if (method === 0) out[name] = comp;
    else if (method === 8) out[name] = zlib.inflateRawSync(comp);
    else throw new Error(`zip: unsupported compression method ${method}`);
    off += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/* ---------------------------------------------------------------- CSV read */

/**
 * RFC-4180 CSV tokenizer — handles quoted fields, escaped "" quotes, and
 * commas/newlines inside quotes (the survey question text contains commas and
 * parentheses, so a naive split would corrupt every row). Returns rows of
 * string cells.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  // Strip a UTF-8 BOM if present.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n") {
      row.push(field); field = ""; rows.push(row); row = [];
    } else if (c === "\r") {
      // handled by the \n branch; ignore lone CR
    } else {
      field += c;
    }
  }
  // Flush the trailing field/row if the file didn't end with a newline.
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function headerIndex(header: string[]): Record<string, number> {
  const idx: Record<string, number> = {};
  header.forEach((h, i) => { idx[h.trim().toLowerCase()] = i; });
  return idx;
}

/**
 * Turn one Intercom content-export ZIP into our SurveyResponse rows. Scores
 * come from answer_*.csv (by stable question id); who/where metadata comes from
 * answer_combined_*.csv; joined on receipt_id. A window with no survey activity
 * (missing answer files) yields an empty array, not an error.
 */
export function parseSurveyExport(files: Record<string, Buffer>): SurveyResponse[] {
  const answerName = Object.keys(files).find((n) => /(^|\/)answer_\d/.test(n));
  const combinedName = Object.keys(files).find((n) => /answer_combined/.test(n));
  if (!answerName) return [];

  // --- scores, keyed by receipt id (latest answer per question wins) ---
  type Score = { value: number; answeredAt: string | null };
  const nps = new Map<string, Score>();
  const csat = new Map<string, Score>();
  const answerRows = parseCsv(files[answerName]!.toString("utf8"));
  if (answerRows.length > 1) {
    const h = headerIndex(answerRows[0]!);
    const ri = h["receipt_id"], ai = h["answered_at"], qi = h["question_id"], rsp = h["response"];
    for (let r = 1; r < answerRows.length; r++) {
      const row = answerRows[r]!;
      const receiptId = row[ri!];
      const qid = row[qi!];
      const raw = row[rsp!];
      if (!receiptId || raw == null || raw === "") continue;
      const value = Number(raw);
      if (!Number.isFinite(value)) continue;
      const answeredAt = ai != null ? row[ai] ?? null : null;
      const target = qid === NPS_QUESTION_ID ? nps : qid === CSAT_QUESTION_ID ? csat : null;
      if (!target) continue;
      const prev = target.get(receiptId);
      // Keep the most recent answer if a receipt was answered more than once.
      if (!prev || (answeredAt && prev.answeredAt && answeredAt > prev.answeredAt)) {
        target.set(receiptId, { value, answeredAt });
      }
    }
  }

  // --- who/where metadata, keyed by receipt id ---
  interface Meta {
    userId: string | null; email: string | null; name: string | null;
    companyIntercomId: string | null; companyExternalId: string | null;
    receivedAt: string | null; completedAt: string | null;
  }
  const meta = new Map<string, Meta>();
  if (combinedName) {
    const rows = parseCsv(files[combinedName]!.toString("utf8"));
    if (rows.length > 1) {
      const h = headerIndex(rows[0]!);
      const get = (row: string[], key: string) => {
        const i = h[key];
        const v = i != null ? row[i] : undefined;
        return v != null && v !== "" ? v : null;
      };
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r]!;
        const receiptId = get(row, "receipt_id");
        if (!receiptId) continue;
        meta.set(receiptId, {
          userId: get(row, "user_id"),
          email: get(row, "email"),
          name: get(row, "name"),
          companyIntercomId: get(row, "company_id"),
          companyExternalId: get(row, "company_external_id"),
          receivedAt: get(row, "received_at"),
          completedAt: get(row, "completed_at"),
        });
      }
    }
  }

  // --- join: every receipt that answered at least one of the two questions ---
  const receiptIds = new Set<string>([...nps.keys(), ...csat.keys()]);
  const out: SurveyResponse[] = [];
  for (const receiptId of receiptIds) {
    const m = meta.get(receiptId);
    const npsS = nps.get(receiptId) ?? null;
    const csatS = csat.get(receiptId) ?? null;
    const latestAnsweredAt = [npsS?.answeredAt, csatS?.answeredAt].filter(Boolean).sort().at(-1) ?? null;
    const respondedAt = m?.completedAt ?? m?.receivedAt ?? latestAnsweredAt;
    out.push({
      receiptId,
      surveyId: SURVEY_ID,
      userId: m?.userId ?? null,
      email: m?.email ?? null,
      name: m?.name ?? null,
      companyIntercomId: m?.companyIntercomId ?? null,
      companyExternalId: m?.companyExternalId ?? null,
      npsScore: npsS?.value ?? null,
      csatScore: csatS?.value ?? null,
      respondedAt,
      receivedAt: m?.receivedAt ?? null,
      completedAt: m?.completedAt ?? null,
    });
  }
  return out;
}

/* -------------------------------------------------------------- summarize */

export interface SurveySummary {
  nps: number | null; // -100..100
  npsResponses: number;
  npsTrend: SatisfactionTrendPoint[];
  platformCsat: number | null; // 0–100 (% who scored ≥ 4)
  platformCsatResponses: number;
  platformCsatTrend: SatisfactionTrendPoint[];
}

/** Standard NPS: %promoters (9–10) − %detractors (0–6), rounded to an integer. */
function npsOf(scores: number[]): number {
  const promoters = scores.filter((s) => s >= 9).length;
  const detractors = scores.filter((s) => s <= 6).length;
  return Math.round(((promoters - detractors) / scores.length) * 100);
}
/** Platform CSAT: % of 1–5 ratings that are "satisfied" (≥ 4) — same 4-or-5
 *  convention as the ticket CSAT in summarizeSupport, so the two are comparable. */
function csatPctOf(scores: number[]): number {
  return Math.round((scores.filter((s) => s >= 4).length / scores.length) * 100);
}

/**
 * Roll a set of survey responses (already attributed to one account) up into
 * the NPS + platform-CSAT snapshot the Satisfaction tab shows. Each question is
 * counted independently (a partial response that answered only the NPS question
 * still counts toward NPS). Trends are bucketed by the business's own AST
 * calendar month, matching summarizeSupport's CSAT trend bucketing exactly.
 */
export function summarizeSurveys(responses: SurveyResponse[]): SurveySummary {
  const npsScores: number[] = [];
  const csatScores: number[] = [];
  const npsByMonth = new Map<string, number[]>();
  const csatByMonth = new Map<string, number[]>();

  const monthOf = (iso: string | null): string | null =>
    iso ? new Date(new Date(iso).getTime() + AST_OFFSET_MS).toISOString().slice(0, 7) : null;
  const push = (m: Map<string, number[]>, key: string, v: number) => {
    const b = m.get(key);
    if (b) b.push(v); else m.set(key, [v]);
  };

  for (const r of responses) {
    const month = monthOf(r.respondedAt);
    if (r.npsScore != null) {
      npsScores.push(r.npsScore);
      if (month) push(npsByMonth, month, r.npsScore);
    }
    if (r.csatScore != null) {
      csatScores.push(r.csatScore);
      if (month) push(csatByMonth, month, r.csatScore);
    }
  }

  const trend = (m: Map<string, number[]>, fn: (xs: number[]) => number): SatisfactionTrendPoint[] =>
    [...m.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, xs]) => ({ period, value: fn(xs), responses: xs.length }));

  return {
    nps: npsScores.length ? npsOf(npsScores) : null,
    npsResponses: npsScores.length,
    npsTrend: trend(npsByMonth, npsOf),
    platformCsat: csatScores.length ? csatPctOf(csatScores) : null,
    platformCsatResponses: csatScores.length,
    platformCsatTrend: trend(csatByMonth, csatPctOf),
  };
}
