"use client";

/* Dev preview. See page.tsx for why this exists and why it is tracked.

   The meetings and notes below are Gathern's REAL ones, read from PRODUCTION
   on 2026-09-06 (client 31417852345). Meeting titles, dates and outcomes are
   unedited — including the `read.ai |` prefixes, which are the evidence that
   this team already writes meetings up in an AI notetaker.

   The three notes are real but TRIMMED to their opening sentence, deliberately:
   the full text carries commercial detail that does not belong in a tracked
   file. What matters here survives the trim — two of the three open with a
   hand-typed date, because a note is filed on the day it was written rather
   than the day the thing happened. Across production that is 14 notes of 66,
   with 5 more carrying a date in parentheses.

   An earlier version of this file said Gathern had no notes and the database
   held 16. That came from .env.local, which points at the TEST clone. */

import { useMemo, useRef, useState } from "react";
import {
  Calendar, Check, ChevronDown, Clock, Link2, MessageSquare, Phone, Plus, Sparkles,
  StickyNote, Tag, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { NotesTab } from "@/components/clients/notes/NotesTab";
import type { Deal } from "@/lib/types";
import type { Note as RealNote } from "@/lib/notes/types";

type Outcome = "COMPLETED" | null;
interface Meeting { id: string; title: string; start: string; outcome: Outcome; bodyKind: string }

/** Gathern's real meetings, newest first. `bodyKind` is what the synced
 *  `client_meetings.notes` column actually holds — almost never a write-up. */
const MEETINGS: Meeting[] = [
  { id: "hsm-112030917258", title: 'GatherN x Lumofy - Competency Framework "Growth"', start: "2026-07-01T10:00:00Z", outcome: "COMPLETED", bodyKind: "html-email" },
  { id: "hsm-110837285544", title: "Gathern <> Lumofy | Alignment & Next Steps [In-Person]", start: "2026-06-15T10:00:00Z", outcome: null, bodyKind: "other" },
  { id: "hsm-105186204745", title: "read.ai | Gathern <> Lumofy | New Performance Management Tool", start: "2026-02-26T12:00:00Z", outcome: "COMPLETED", bodyKind: "attendee-list" },
  { id: "hsm-99420395891", title: "read.ai | Gathern <> Lumofy | Training Needs for Engineering and QA", start: "2025-12-22T08:00:00Z", outcome: "COMPLETED", bodyKind: "attendee-list" },
  { id: "hsm-98854591156", title: "Gathern <> Lumofy | Training Needs for Engineering and QA", start: "2025-12-22T08:00:00Z", outcome: null, bodyKind: "html-email" },
  { id: "hsm-98115959898", title: "read.ai | Gathern <> Lumofy | Follow-Up", start: "2025-12-07T11:00:00Z", outcome: "COMPLETED", bodyKind: "attendee-list" },
  { id: "hsm-95069639992", title: "read.ai | Weekly - Gathern", start: "2025-11-11T11:00:00Z", outcome: "COMPLETED", bodyKind: "attendee-list" },
  { id: "hsm-94296157053", title: "read.ai | Assessment Overview", start: "2025-11-06T10:00:00Z", outcome: "COMPLETED", bodyKind: "attendee-list" },
  { id: "hsm-93959673191", title: "read.ai | Gathern - Weekly", start: "2025-11-04T11:30:00Z", outcome: "COMPLETED", bodyKind: "attendee-list" },
  { id: "hsm-90820281004", title: "Gathern - Talent Walkthrough 2", start: "2025-10-15T10:30:00Z", outcome: null, bodyKind: "html-email" },
  { id: "hsm-90797555779", title: "Gathern - Talent Walkthrough 1", start: "2025-10-15T09:00:00Z", outcome: null, bodyKind: "html-email" },
  { id: "hsm-91382975255", title: "Gathern - Meeting with CEO", start: "2025-10-14T12:00:00Z", outcome: null, bodyKind: "html-email" },
];

const GATHERN_ID = "31417852345";
const DEAL = { id: "hs-deal-35078858580", name: "Gathern" };

/* Mentionable people — in the real thing this is the server-built list of
   people who can already see the account, exactly as task updates do it
   (listMentionableForTaskAction). Mentioning grants nobody anything; the
   picker only ever offers people with existing access. These are the actual
   note authors in production. */
const PEOPLE = [
  { email: "sasghar@lumofy.com", name: "Sakina Asghar" },
  { email: "zali@lumofy.com", name: "Zainab Ali" },
  { email: "bmomani@lumofy.com", name: "Batool Momani" },
  { email: "aabbas@lumofy.com", name: "Ali Abbas" },
  { email: "asamara@lumofy.com", name: "Ahmed Samara" },
  { email: "mmalik@lumofy.com", name: "Mahmood Malik" },
];
const NAME_BY_EMAIL = new Map(PEOPLE.map((p) => [p.email, p.name]));
const initials = (s: string) =>
  s.replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/).slice(0, 2)
    .map((w) => w[0] ?? "").join("").toUpperCase() || "?";

/** Renders `@[email]` tokens as chips, everything else as text. The token is
 *  the stored form so a rename never breaks a mention — same rule as
 *  TaskUpdates: the email is the identity, the name is only display. */
function NoteBody({ text }: { text: string }) {
  const parts = useMemo(() => {
    const out: { t: "text" | "mention"; v: string }[] = [];
    const re = /@\[([^\]]+)\]/g;
    let last = 0, m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push({ t: "text", v: text.slice(last, m.index) });
      out.push({ t: "mention", v: m[1].toLowerCase() });
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ t: "text", v: text.slice(last) });
    return out;
  }, [text]);

  return (
    <p dir="auto" className="m-0 whitespace-pre-wrap font-body text-[13px] leading-relaxed text-fg">
      {parts.map((p, i) => p.t === "text" ? p.v : (
        <span key={i} className="rounded bg-accent-soft px-1.5 py-0.5 font-medium text-sirius">
          @{NAME_BY_EMAIL.get(p.v) ?? p.v}
        </span>
      ))}
    </p>
  );
}

/* How the thing happened. This is a CHANNEL, not a category — and it is
   already in the prose ("Spoke with Neena", "Contacted Haneen by phone",
   "raised via WhatsApp"), so the field captures what authors already type.
   Each one changes what the composer asks: only a meeting can link to a
   synced client_meetings row; a call or a message has a date but no record
   to link; a plain note has no event at all, so it needs no date. */
const NOTE_TYPES = [
  { id: "meeting", label: "Meeting", icon: Calendar, tone: "eclipse", event: true, linkable: true },
  { id: "call", label: "Call", icon: Phone, tone: "info", event: true, linkable: false },
  { id: "message", label: "Message", icon: MessageSquare, tone: "success", event: true, linkable: false },
  { id: "note", label: "Note", icon: StickyNote, tone: "neutral", event: false, linkable: false },
] as const;
type NoteType = (typeof NOTE_TYPES)[number]["id"];
const TYPE = Object.fromEntries(NOTE_TYPES.map((t) => [t.id, t])) as Record<NoteType, (typeof NOTE_TYPES)[number]>;

const TYPE_CHIP: Record<string, string> = {
  eclipse: "bg-eclipse-bg text-eclipse-fg",
  info: "bg-info-bg text-info-fg",
  success: "bg-success-bg text-success-fg",
  neutral: "bg-bg-muted text-fg-muted",
};
const TYPE_STRIPE: Record<string, string> = {
  eclipse: "bg-eclipse", info: "bg-sirius", success: "bg-success", neutral: "bg-border-strong",
};

const FOCUS_AREAS = [
  { id: "reminder", label: "Reminder", tone: "neutral" },
  { id: "derisking", label: "De-risking plans", tone: "danger" },
  { id: "escalations", label: "Escalations", tone: "warning" },
  { id: "projects", label: "Project status", tone: "info" },
  { id: "expansion", label: "Expansion signals", tone: "success" },
  { id: "stakeholders", label: "Stakeholder mapping", tone: "warning" },
] as const;

const DOT: Record<string, string> = {
  neutral: "bg-fg-subtle", danger: "bg-danger", warning: "bg-warning",
  info: "bg-sirius", success: "bg-success",
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/* ── A note, as the proposal shapes it ─────────────────────────────────── */
interface Note {
  id: string;
  type: NoteType;
  body: string;
  author: string;
  createdAt: string;
  meetingId: string | null;
  dealId: string | null;
  /** Set when the author typed the date into the body themselves, because the
   *  note could not carry it. The proposal's `occurred_at` is what replaces it. */
  handTypedDate?: string;
  /** When the thing actually happened, as distinct from when it was typed. */
  occurredAt?: string;
  tasks: { title: string; state: "open" | "done"; owner: string; when: string }[];
}

/* Gathern's three real notes, trimmed. Note the openings on the two older
   ones: the author typed the date in because the note could not carry it. */
const SEED_NOTES: Note[] = [
  {
    id: "real-1", type: "meeting", author: "Mahmood Malik", createdAt: "2026-09-06T06:52:27Z",
    meetingId: null, dealId: DEAL.id, tasks: [],
    body:
      "Ahmed and Hussain met Khalil Nasseif, the Chief Strategy Officer, at their HQ. " +
      "Khalil acknowledged the low engagement and said the platform had not been " +
      "positioned internally as anything mandatory, so managers treated it as optional. " +
      "He asked for a short enablement session for the leadership layer first, then a " +
      "push to the wider team once their own managers had used it. He was direct that " +
      "the renewal conversation would follow adoption, not precede it.",
  },
  {
    id: "real-2", type: "call", author: "Ali Abbas", createdAt: "2026-08-03T07:11:28Z",
    meetingId: null, dealId: DEAL.id, tasks: [],
    handTypedDate: "02 August 2026", occurredAt: "2026-08-02T00:00:00Z",
    body: "02 August 2026: Attempted to contact Shatha by phone to schedule a meeting, but there was no response.",
  },
  {
    id: "real-3", type: "message", author: "Ali Abbas", createdAt: "2026-07-29T07:35:24Z",
    meetingId: null, dealId: DEAL.id, tasks: [],
    handTypedDate: "28 Jul 2026", occurredAt: "2026-07-28T00:00:00Z",
    body: "28 Jul 2026: Shahad Alnoghmoush (Procurement & Contracting Lead) informed us that Gathern will not be renewing…",
  },
];

/** Strip a leading hand-typed date once the note can carry one itself. */
const withoutDatePrefix = (s: string) =>
  s.replace(/^\s*\(?\d{1,2}[ -](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[ -]?\d{0,4}\)?\s*:?\s*/i, "");

/* The SAME three notes in the shape the shipping NotesTab takes, so the
   "Today" pane is the real component rather than an imitation of it. Bodies
   are the trimmed real ones, wrapped in <p> as the Tiptap editor stores them. */
const REAL_NOTES: RealNote[] = SEED_NOTES.map((n) => ({
  id: n.id,
  clientId: GATHERN_ID,
  dealId: n.dealId,
  body: `<p>${n.body}</p>`,
  type: n.type,
  occurredAt: n.occurredAt ?? null,
  meetingId: n.meetingId,
  mentions: [],
  createdByEmail: null,
  createdByName: n.author,
  createdAt: n.createdAt,
  updatedAt: n.createdAt,
}));

const REAL_DEALS: Deal[] = [{
  id: DEAL.id, clientId: GATHERN_ID, hubspotDealId: "35078858580", name: DEAL.name,
  amount: 0, closeDate: null, pipeline: null, referralSource: null,
  ownerName: null, ownerEmail: null, hubspotUrl: null,
  createdAt: "2025-10-01T00:00:00Z",
}];

export function NotesPreview() {
  const [pane, setPane] = useState<"today" | "proposed">("proposed");
  const [notes, setNotes] = useState<Note[]>(SEED_NOTES);
  const [filter, setFilter] = useState<NoteType | "all">("all");
  const [composing, setComposing] = useState(false);

  const meetingById = useMemo(() => new Map(MEETINGS.map((m) => [m.id, m])), []);
  const withNotes = useMemo(() => new Set(notes.map((n) => n.meetingId).filter(Boolean)), [notes]);

  /* Filter by TYPE, not by what the note is attached to. Attachment made a
     useless axis here: every one of Gathern's notes is deal-tagged, so "All"
     and "Deals" returned the same three rows. */
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: notes.length };
    for (const t of NOTE_TYPES) c[t.id] = notes.filter((n) => n.type === t.id).length;
    return c;
  }, [notes]);
  const shown = filter === "all" ? notes : notes.filter((n) => n.type === filter);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <p className="font-body text-[11px] font-semibold uppercase tracking-[0.09em] text-fg-subtle">Dev preview</p>
      <h1 className="mt-2 font-display text-[28px] font-bold tracking-tight text-fg">Notes — Gathern</h1>
      <p className="mt-2 max-w-[66ch] font-body text-[13.5px] text-fg-muted">
        The proposed Notes tab against Gathern&rsquo;s <strong className="font-semibold text-fg">real
        notes</strong>, read from production. A note records what was agreed or raised — from a
        call, an email, a WhatsApp message or a meeting. Signal already knows the meetings
        happened; what it has never held is what was said in them.
      </p>
      <p className="mt-2 max-w-[66ch] font-body text-[13.5px] text-fg-muted">
        So the note carries <strong className="font-semibold text-fg">its own date</strong> — two
        of these three had it typed into the sentence by hand — the commitments in it{" "}
        <strong className="font-semibold text-fg">become tasks</strong>, and the FYI half{" "}
        <strong className="font-semibold text-fg">mentions</strong> whoever needs it. Linking a
        meeting is optional context, not a box to tick.
      </p>

      <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-border border-l-[3px] border-l-warning bg-warning-bg px-4 py-3">
        <Sparkles size={15} className="mt-0.5 shrink-0 text-warning-fg" aria-hidden />
        <p className="m-0 font-body text-[12.5px] text-fg-muted">
          <strong className="font-semibold text-fg">Nothing here is wired to the database.</strong>{" "}
          This is a design preview of intended behaviour — no proposed column exists yet, and
          notes you write below live in memory only.
        </p>
      </div>

      {/* ── Today vs proposed, on the same three real notes ─────────────── */}
      <div className="mt-7 inline-flex gap-0.5 rounded-full border border-border bg-bg-muted p-0.5">
        {([["today", "Today"], ["proposed", "Proposed"]] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setPane(k)}
            aria-pressed={pane === k}
            className={cn(
              "rounded-full px-4 py-1.5 font-body text-[12.5px] font-semibold transition-colors",
              pane === k ? "bg-surface text-fg shadow-sm" : "text-fg-subtle hover:text-fg",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="mt-2 font-body text-[12px] text-fg-subtle">
        {pane === "today"
          ? "The real shipping component (components/clients/notes/NotesTab.tsx), rendered with Gathern's actual notes. Its buttons call live server actions and will fail without a session — look, don't click."
          : "The same three notes, with occurred_at, attachment and convert-to-task."}
      </p>

      {pane === "today" ? (
        <div className="mt-4 rounded-2xl border border-border bg-canvas p-4">
          <NotesTab clientId={GATHERN_ID} deals={REAL_DEALS} notes={REAL_NOTES} canEdit={false} lockReason="Preview — writes go through the real server actions, which need a session." />
        </div>
      ) : (
      <div className="mt-4 rounded-2xl border border-border bg-canvas p-4">
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">Notes</span>
              <span className="rounded-full bg-bg-muted px-2 py-0.5 font-body text-[11px] font-semibold text-fg-muted">{notes.length}</span>
            </div>
            <button
              onClick={() => setComposing(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sirius px-3 py-1.5 font-body text-[12.5px] font-semibold text-white hover:bg-accent-hover"
            >
              <Plus size={13} /> New note
            </button>
          </div>

          {/* Only offer a filter that discriminates — the same rule the
              shipping tab applies to its deal dropdown (dealsWithNotes). With
              one type present there is nothing to filter, so the rail hides. */}
          {NOTE_TYPES.filter((t) => counts[t.id] > 0).length > 1 && (
            <div className="mb-4 flex flex-wrap gap-1.5">
              {([
                { id: "all", label: "All", icon: null },
                ...NOTE_TYPES.filter((t) => counts[t.id] > 0),
              ] as { id: NoteType | "all"; label: string; icon: LucideIcon | null }[]).map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => setFilter(t.id)}
                    aria-pressed={filter === t.id}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-body text-[12px] font-semibold transition-colors",
                      filter === t.id
                        ? "border-sirius bg-accent-soft text-info-fg"
                        : "border-border bg-bg text-fg-muted hover:border-border-strong hover:text-fg",
                    )}
                  >
                    {Icon && <Icon size={11} aria-hidden />}
                    {t.label} <span className="font-normal opacity-60 tabular-nums">{counts[t.id]}</span>
                  </button>
                );
              })}
            </div>
          )}

          {shown.length === 0 ? (
            <EmptyState onWriteUp={() => setComposing(true)} />
          ) : (
            <ul className="flex flex-col gap-2.5">
              {shown.map((n) => (
                <NoteRow key={n.id} note={n} meeting={n.meetingId ? meetingById.get(n.meetingId) ?? null : null} />
              ))}
            </ul>
          )}
        </div>
      </div>
      )}

      {composing && (
        <Composer
          meetings={MEETINGS}
          withNotes={withNotes}
          onClose={() => setComposing(false)}
          onSave={(n) => { setNotes((prev) => [n, ...prev]); setComposing(false); }}
        />
      )}

      <section className="mt-10">
        <h2 className="font-display text-[17px] font-bold text-fg">What the real data says</h2>
        <dl className="mt-3 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
          <Stat k="Notes in production" v="66" note="31 accounts, 6 authors — 19 in Jul, 45 in Aug. In active use." />
          <Stat k="Notes that hand-type the date in" v="14 / 66" note="plus 5 more with a date in parentheses — 29% work around the filing date" />
          <Stat k="Live accounts with a meeting in 90 days" v="37 / 53" note="70% — above the spec's 60% threshold, so OD-1 clears" />
          <Stat k="Meetings titled by an AI notetaker" v="483" note="across 60 accounts — read.ai is already the workflow" />
        </dl>
      </section>
    </div>
  );
}

function Stat({ k, v, note }: { k: string; v: string; note: string }) {
  return (
    <div className="bg-surface px-4 py-3.5">
      <dt className="font-body text-[11.5px] font-semibold text-fg-muted">{k}</dt>
      <dd className="m-0 mt-1 font-display text-[22px] font-bold tabular-nums text-fg">{v}</dd>
      <p className="m-0 mt-0.5 font-body text-[11.5px] text-fg-subtle">{note}</p>
    </div>
  );
}

/* The empty state does the work here: with no notes, the meetings ARE the
   content. Offering the unwritten ones turns a dead tab into a queue. */
function EmptyState({ onWriteUp }: { onWriteUp: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-5 py-7 text-center">
      <StickyNote size={18} className="mx-auto text-fg-subtle" aria-hidden />
      <p className="m-0 mt-2 font-display text-[14px] font-bold text-fg">Nothing recorded yet</p>
      <p className="mx-auto m-0 mt-1 max-w-[52ch] font-body text-[12.5px] text-fg-muted">
        What was agreed, what was raised, what the rest of the team should know. A call, an
        email, a WhatsApp message or a meeting — whatever it was, this is where it lives.
      </p>
      <button
        onClick={onWriteUp}
        className="mt-3.5 inline-flex items-center gap-1.5 rounded-lg bg-sirius px-3 py-1.5 font-body text-[12.5px] font-semibold text-white hover:bg-accent-hover"
      >
        <Plus size={13} /> Write the first one
      </button>
    </div>
  );
}

/** Long notes clamp to a few lines. Real ones average 662 characters and run
 *  to 3,422, so an unclamped feed is a wall — but truncating without a way to
 *  finish reading loses the content that is the whole point. */
const CLAMP_AT = 220;

function NoteRow({ note, meeting }: { note: Note; meeting: Meeting | null }) {
  const [open, setOpen] = useState(false);
  const t = TYPE[note.type];
  const TypeIcon = t.icon;
  const text = note.occurredAt ? withoutDatePrefix(note.body) : note.body;
  const long = text.length > CLAMP_AT;
  const shownText = long && !open ? `${text.slice(0, CLAMP_AT).trimEnd()}…` : text;

  return (
    <li className="flex overflow-hidden rounded-xl border border-border-subtle bg-surface">
      <span className={cn("w-[3px] shrink-0", TYPE_STRIPE[t.tone])} />
      <div className="min-w-0 flex-1 px-4 py-3.5">
        <div className="mb-2 flex flex-wrap items-center gap-2 font-body text-[12px] text-fg-subtle">
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-semibold", TYPE_CHIP[t.tone])}>
            <TypeIcon size={10} /> {t.label}
          </span>
          {note.dealId && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-muted px-2 py-0.5 font-semibold text-fg-muted">
              <Tag size={10} /> {DEAL.name}
            </span>
          )}
          <span className="font-semibold text-fg-muted">{note.author}</span>
          <span>·</span>
          <span>{fmt(note.occurredAt ?? (meeting ? meeting.start : note.createdAt))}</span>
        </div>

        {meeting && (
          <div className="mb-2.5 flex flex-wrap items-center gap-2 rounded-lg border border-border-subtle bg-surface-sunken px-3 py-2 font-body text-[12px] text-fg-muted">
            <span className="font-semibold text-fg">{meeting.title.replace(/^read\.ai \| /, "")}</span>
            <span className="text-border-strong">·</span>
            <span>{fmt(meeting.start)}</span>
            {meeting.outcome && (
              <>
                <span className="text-border-strong">·</span>
                <span className="rounded-full bg-success-bg px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-success-fg">Completed</span>
              </>
            )}
            <span className="ml-auto inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-fg-subtle">
              <Link2 size={10} /> HubSpot
            </span>
          </div>
        )}

        <NoteBody text={shownText} />
        {long && (
          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="mt-1.5 inline-flex items-center gap-1 font-body text-[11.5px] font-semibold text-sirius hover:underline"
          >
            {open ? "View less" : "View more"}
            <ChevronDown size={12} className={cn("transition-transform", open && "rotate-180")} aria-hidden />
          </button>
        )}

        {note.tasks.length > 0 && (
          <div className="mt-3 flex flex-col gap-1.5 border-t border-dashed border-border pt-2.5">
            {note.tasks.map((t, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 font-body text-[12px] text-fg-muted">
                <span className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  t.state === "done" ? "bg-success-bg text-success-fg" : "bg-warning-bg text-warning-fg",
                )}>
                  {t.state === "done" ? <Check size={10} /> : <Clock size={10} />}
                  {t.state === "done" ? "Done" : "Open"}
                </span>
                <span className="font-semibold text-sirius">{t.title}</span>
                <span className="text-fg-subtle">· {t.owner} · {t.when}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

/* Paste-first: you write, and the meeting is detected from what you wrote.
   No picker to hunt through — see the spec's §8 Flow A. */
function Composer({ meetings, withNotes, onClose, onSave }: {
  meetings: Meeting[];
  withNotes: Set<string | null>;
  onClose: () => void;
  onSave: (n: Note) => void;
}) {
  const [body, setBody] = useState("");
  const [type, setType] = useState<NoteType>("meeting");
  /* When it happened, defaulting to today. A linked meeting overrides it with
     the meeting's own start time; a plain note has no event, so no date. */
  const [occurred, setOccurred] = useState(() => new Date().toISOString().slice(0, 10));
  const [attached, setAttached] = useState<Meeting | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [area, setArea] = useState<string | null>(null);
  /* Mention state, mirroring TaskUpdates: the textarea shows "@Sakina" because
     "@sasghar@lumofy.com" is unreadable while typing; `picked` converts back
     to the stored `@[email]` token on save. */
  const [query, setQuery] = useState<string | null>(null);
  const picked = useRef<Map<string, string>>(new Map());
  const boxRef = useRef<HTMLTextAreaElement>(null);

  const matches = useMemo(() => {
    if (query === null) return [];
    const q = query.toLowerCase();
    return PEOPLE.filter((p) => !q || p.name.toLowerCase().includes(q) || p.email.includes(q)).slice(0, 5);
  }, [query]);

  function onType(value: string) {
    setBody(value);
    setDismissed(false);
    const caret = boxRef.current?.selectionStart ?? value.length;
    const m = /@([\p{L}\p{N}._-]*)$/u.exec(value.slice(0, caret));
    setQuery(m ? m[1] : null);
  }

  function insertMention(person: { email: string; name: string }) {
    const caret = boxRef.current?.selectionStart ?? body.length;
    const start = body.slice(0, caret).lastIndexOf("@");
    if (start < 0) return;
    picked.current.set(person.name, person.email);
    setBody(`${body.slice(0, start)}@${person.name} ${body.slice(caret)}`);
    setQuery(null);
    queueMicrotask(() => {
      boxRef.current?.focus();
      const pos = start + person.name.length + 2;
      boxRef.current?.setSelectionRange(pos, pos);
    });
  }

  /** Longest names first, so "@Ahmed Samara" isn't half-consumed by "@Ahmed". */
  function toTokens(text: string): string {
    let out = text;
    for (const [name, email] of [...picked.current].sort((a, b) => b[0].length - a[0].length)) {
      out = out.split(`@${name}`).join(`@[${email}]`);
    }
    return out;
  }

  /* The detection: match words in what was written against meeting titles.
     Crude on purpose — the point is that it reads YOUR text, rather than
     making you find the meeting in a list of 21. */
  const detected = useMemo(() => {
    const text = body.toLowerCase();
    if (text.trim().length < 12) return null;
    const scored = meetings
      .filter((m) => !withNotes.has(m.id))
      .map((m) => {
        const words = m.title.toLowerCase().replace(/^read\.ai \| /, "")
          .split(/[^a-z0-9]+/).filter((w) => w.length > 3);
        const hits = words.filter((w) => text.includes(w)).length;
        return { m, hits };
      })
      .filter((s) => s.hits > 0)
      .sort((a, b) => b.hits - a.hits);
    return scored[0]?.m ?? null;
  }, [body, meetings, withNotes]);

  const suggestion = TYPE[type].linkable ? (attached ?? (dismissed ? null : detected)) : null;

  function save() {
    if (!body.trim()) return;
    onSave({
      id: `n-${Date.now()}`,
      type,
      body: toTokens(body.trim()),
      author: "You",
      createdAt: new Date().toISOString(),
      occurredAt: attached ? attached.start : TYPE[type].event ? occurred : undefined,
      meetingId: attached?.id ?? null,
      dealId: DEAL.id,
      tasks: taskTitle.trim() && area
        ? [{ title: taskTitle.trim(), state: "open", owner: "You", when: FOCUS_AREAS.find((f) => f.id === area)?.label ?? "" }]
        : [],
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="m-0 font-display text-[15px] font-bold text-fg">New note — Gathern</h2>
          <button onClick={onClose} className="rounded-md px-1.5 font-body text-[15px] text-fg-muted hover:text-fg" aria-label="Close">✕</button>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          <div>
            <label className="mb-1.5 block font-body text-[11.5px] font-semibold text-fg-muted">How did it happen?</label>
            <div className="flex flex-wrap gap-1.5">
              {NOTE_TYPES.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => { setType(t.id); if (!t.linkable) { setAttached(null); setDismissed(true); } else setDismissed(false); }}
                    aria-pressed={type === t.id}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-body text-[12px] font-semibold transition-colors",
                      type === t.id
                        ? "border-sirius bg-accent-soft text-info-fg"
                        : "border-border bg-bg text-fg-muted hover:border-border-strong hover:text-fg",
                    )}
                  >
                    <Icon size={12} aria-hidden /> {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="relative">
            <label htmlFor="np-body" className="mb-1.5 block font-body text-[11.5px] font-semibold text-fg-muted">
              {type === "note" ? "Note" : `What was agreed or raised`}
            </label>
            <textarea
              id="np-body"
              ref={boxRef}
              rows={7}
              dir="auto"
              value={body}
              onChange={(e) => onType(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape" && query !== null) { e.stopPropagation(); setQuery(null); } }}
              placeholder="What was agreed, what was raised, what the team should know. Type @ to mention someone."
              className="w-full rounded-lg border border-border bg-bg px-3 py-2.5 font-body text-[13px] leading-relaxed text-fg outline-none placeholder:text-fg-subtle focus:border-sirius"
            />

            {query !== null && matches.length > 0 && (
              <div className="absolute left-0 right-0 z-30 overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
                <p className="m-0 border-b border-border-subtle px-2.5 py-1.5 font-body text-[10.5px] text-fg-subtle">
                  People who can see this account
                </p>
                {matches.map((p) => (
                  <button
                    key={p.email}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insertMention(p)}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-bg-muted"
                  >
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft font-body text-[9px] font-bold text-sirius">
                      {initials(p.name)}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-body text-[12.5px] text-fg">{p.name}</span>
                    <span className="truncate font-body text-[11px] text-fg-subtle">{p.email}</span>
                  </button>
                ))}
              </div>
            )}

            <p className="m-0 mt-1.5 font-body text-[11.5px] text-fg-subtle">
              Type <strong className="font-semibold text-fg-muted">@</strong> to mention a colleague.
              Mentions notify; they grant no access.
            </p>
          </div>

          {/* Optional context, offered quietly. Signal already knows the meeting
              happened; linking it only saves the author from restating the date
              and the room. Declining costs nothing. */}
          {suggestion && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-sunken px-3 py-2">
              <Calendar size={13} className="shrink-0 text-fg-subtle" aria-hidden />
              <span className="min-w-0 flex-1 font-body text-[12px] text-fg-muted">
                {attached ? "Linked to " : "Is this about "}
                <span className="font-semibold text-fg">{suggestion.title.replace(/^read\.ai \| /, "")}</span>
                {attached ? "" : "?"}{" "}
                <span className="text-fg-subtle">{fmt(suggestion.start)}</span>
              </span>
              {!attached ? (
                <span className="flex shrink-0 gap-1.5">
                  <button onClick={() => setAttached(suggestion)}
                    className="rounded-md border border-border bg-bg px-2.5 py-1 font-body text-[11.5px] font-semibold text-fg-muted hover:border-sirius hover:text-sirius">
                    Link it
                  </button>
                  <button onClick={() => { setDismissed(true); setAttached(null); }}
                    className="rounded-md px-2 py-1 font-body text-[11.5px] font-semibold text-fg-subtle hover:text-fg">
                    No
                  </button>
                </span>
              ) : (
                <button onClick={() => { setAttached(null); setDismissed(true); }}
                  className="shrink-0 rounded-md px-2 py-1 font-body text-[11.5px] font-semibold text-fg-subtle hover:text-fg">
                  Unlink
                </button>
              )}
            </div>
          )}


          {TYPE[type].event && !attached && (
            <div>
              <label htmlFor="np-when" className="mb-1.5 block font-body text-[11.5px] font-semibold text-fg-muted">
                When did it happen?
              </label>
              <input
                id="np-when"
                type="date"
                value={occurred}
                onChange={(e) => setOccurred(e.target.value)}
                className="rounded-lg border border-border bg-bg px-3 py-2 font-body text-[13px] text-fg outline-none focus:border-sirius"
              />
              <p className="m-0 mt-1.5 font-body text-[11.5px] text-fg-subtle">
                So it files on the day of the {TYPE[type].label.toLowerCase()}, not the day you wrote it up.
              </p>
            </div>
          )}

          <div className="border-t border-border-subtle pt-3.5">
            <label htmlFor="np-task" className="mb-1.5 block font-body text-[11.5px] font-semibold text-fg-muted">
              Create a task from this note <span className="font-normal text-fg-subtle">— optional</span>
            </label>
            <input
              id="np-task"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="e.g. Send the competency framework draft"
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 font-body text-[13px] text-fg outline-none placeholder:text-fg-subtle focus:border-sirius"
            />
            {taskTitle.trim() && (
              <>
                <p className="m-0 mb-2 mt-3 font-body text-[11.5px] font-semibold text-fg-muted">Focus area</p>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {FOCUS_AREAS.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setArea(f.id)}
                      aria-pressed={area === f.id}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left font-body text-[12px] font-semibold transition-colors",
                        area === f.id
                          ? "border-sirius bg-accent-soft text-info-fg"
                          : "border-border bg-bg text-fg-muted hover:border-border-strong hover:text-fg",
                      )}
                    >
                      <span className={cn("size-2 shrink-0 rounded-sm", DOT[f.tone])} />
                      {f.label}
                    </button>
                  ))}
                </div>
                <p className="m-0 mt-2 font-body text-[11.5px] text-fg-subtle">
                  Nothing preselected — the note&rsquo;s words don&rsquo;t say which box this belongs in.
                </p>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border bg-surface-sunken px-5 py-3.5">
          <span className="font-body text-[11.5px] text-fg-subtle">
            {attached ? "Saves to Notes and the meeting card" : "Saves to Notes"}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg border border-border px-3 py-1.5 font-body text-[12.5px] font-semibold text-fg-muted hover:text-fg">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={!body.trim() || (!!taskTitle.trim() && !area)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sirius px-3.5 py-1.5 font-body text-[12.5px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
            >
              Save note{taskTitle.trim() && area ? " + task" : ""}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
