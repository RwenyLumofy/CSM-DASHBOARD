"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellOff, CheckCheck, Loader2, TriangleAlert } from "lucide-react";
import { differenceInCalendarDays, format, isToday, isYesterday } from "date-fns";
import type { Notification } from "@/lib/types";
import { TYPE_META } from "@/components/layout/NotificationsBell";
import { GROUP_LABEL, GROUP_ORDER, groupOf, type NotificationGroup } from "@/lib/notifications/groups";
import { notificationHref } from "@/lib/notifications/link";
import { markAllReadAction, markReadAction } from "@/app/(app)/inbox/actions";
import { loadOlderNotificationsAction } from "@/app/(app)/notifications/actions";
import { cn } from "@/lib/cn";

const FALLBACK = { icon: TYPE_META.system.icon, tone: "text-fg-subtle", label: "Notification" };

type Filter = NotificationGroup | "all";

/* Day headings, coarsest thing that still answers "is this current?". Anything
   older than a week is dated outright — "12 days ago" makes you do arithmetic
   to find out whether you already dealt with it. */
function dayBucket(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Undated";
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  if (differenceInCalendarDays(new Date(), d) < 7) return format(d, "EEEE");
  return format(d, "d MMM yyyy");
}

export function NotificationsCentre({
  initialItems,
  initialHasMore,
  initialUnread,
}: {
  initialItems: Notification[];
  initialHasMore: boolean;
  initialUnread: number;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [unread, setUnread] = useState(initialUnread);
  const [filter, setFilter] = useState<Filter>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [, startTransition] = useTransition();

  /* The list renders only after mount, and this is not cosmetic.
     Both the day headings ("Today", "Yesterday") and the row clock are
     functions of the VIEWER's timezone and of the current time. On the server
     they are computed in UTC at request time; in the browser, in the reader's
     own zone. For anyone east or west of UTC that is a genuine hydration
     mismatch — a 23:00 UTC notification is "Today" for the server and
     "Yesterday" for a reader in Riyadh, which changes the section structure,
     not just a string, so suppressHydrationWarning cannot paper over it.

     Deferring is the honest fix: it costs one frame of skeleton and in
     exchange every timestamp is correct in the reader's own zone rather than
     the server's. Rendering these in UTC to make both passes agree would keep
     the SSR pass and quietly show the wrong day to everyone not on UTC. */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const visible = useMemo(() => {
    return items.filter((n) => {
      if (unreadOnly && n.readAt) return false;
      if (filter !== "all" && groupOf(n) !== filter) return false;
      return true;
    });
  }, [items, filter, unreadOnly]);

  /* Group into day sections in one pass. Insertion order is preserved and the
     list already arrives newest-first, so the sections come out in order
     without a second sort. */
  const sections = useMemo(() => {
    const by = new Map<string, Notification[]>();
    for (const n of visible) {
      const k = dayBucket(n.createdAt);
      const list = by.get(k);
      if (list) list.push(n);
      else by.set(k, [n]);
    }
    return [...by.entries()];
  }, [visible]);

  function open(n: Notification) {
    const href = notificationHref(n);
    if (href) router.push(href);
    if (!n.readAt) {
      setUnread((u) => Math.max(0, u - 1));
      setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, readAt: new Date().toISOString() } : i)));
      void markReadAction(n.id);
    }
  }

  async function markAll() {
    setUnread(0);
    const now = new Date().toISOString();
    setItems((prev) => prev.map((i) => (i.readAt ? i : { ...i, readAt: now })));
    await markAllReadAction();
    // In a transition, or the Server Action's revalidation never lands and the
    // sidebar bell keeps rendering the stale badge next to a cleared list.
    startTransition(() => router.refresh());
  }

  async function loadOlder() {
    const oldest = items[items.length - 1];
    if (!oldest || loading) return;
    setLoading(true);
    setLoadError(false);
    const r = await loadOlderNotificationsAction(oldest.createdAt);
    if (!r.ok) {
      // Keep the button: the page that failed may well load on a retry, and
      // hiding it would strand the rest of the history behind a transient error.
      setLoadError(true);
      setLoading(false);
      return;
    }
    /* Defend against a duplicate at the seam — a row written with exactly the
       cursor's timestamp is excluded by the strict `<`, but a re-render racing
       a poll elsewhere can still re-deliver one. */
    setItems((prev) => {
      const seen = new Set(prev.map((i) => i.id));
      return [...prev, ...r.items.filter((i) => !seen.has(i.id))];
    });
    setHasMore(r.hasMore);
    setLoading(false);
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Filters. Only the unread chip carries a count: it comes from a real
          server-side total, while a per-bucket count could only describe the
          pages loaded so far and would understate every bucket. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* The chips and the action are separate rows in the wrap, not one long
            run: with six buckets an `ml-auto` button gets pushed onto a line of
            its own the moment the row is a chip too wide. */}
        <div className="flex flex-wrap items-center gap-2">
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>All</Chip>
        {GROUP_ORDER.map((g) => (
          <Chip key={g} active={filter === g} onClick={() => setFilter(g)}>
            {GROUP_LABEL[g]}
          </Chip>
        ))}
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <Chip active={unreadOnly} onClick={() => setUnreadOnly((u) => !u)}>
          Unread{unread > 0 && <span className="ml-1.5 font-bold">{unread}</span>}
        </Chip>
        </div>
        {unread > 0 && (
          <button
            onClick={markAll}
            className="ml-auto flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-body text-[12px] font-semibold text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
          >
            <CheckCheck size={13} /> Mark all read
          </button>
        )}
      </div>

      {!mounted ? (
        <ListSkeleton rows={Math.min(items.length, 6)} />
      ) : sections.length === 0 ? (
        <EmptyState filter={filter} unreadOnly={unreadOnly} anyLoaded={items.length > 0} />
      ) : (
        <div className="flex flex-col gap-6">
          {sections.map(([day, rows]) => (
            <section key={day}>
              <h2 className="mb-2 font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">{day}</h2>
              <ul className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
                {rows.map((n) => (
                  <Row key={n.id} n={n} onOpen={open} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {loadError && (
        <p className="flex items-center gap-1.5 font-body text-[12px] text-danger">
          <TriangleAlert size={13} /> Couldn&apos;t load older notifications. Try again.
        </p>
      )}

      {mounted && hasMore && (
        <button
          onClick={loadOlder}
          disabled={loading}
          className="self-start rounded-lg border border-border px-3.5 py-2 font-body text-[12.5px] font-semibold text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg disabled:opacity-50"
        >
          {loading ? (
            <span className="flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> Loading…</span>
          ) : (
            "Load older"
          )}
        </button>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-pill border px-3 py-1.5 font-body text-[12px] font-semibold transition-colors",
        active
          ? "border-sirius bg-sirius text-white"
          : "border-border bg-surface text-fg-muted hover:bg-bg-muted hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

function Row({ n, onOpen }: { n: Notification; onOpen: (n: Notification) => void }) {
  const meta = TYPE_META[n.type] ?? FALLBACK;
  const Icon = meta.icon;
  const href = notificationHref(n);
  const created = new Date(n.createdAt);

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(n)}
        className={cn(
          "flex w-full items-start gap-3 border-b border-border-subtle px-4 py-3 text-left transition-colors last:border-b-0",
          !n.readAt && "bg-accent-soft/40",
          href ? "hover:bg-bg-muted" : "cursor-default hover:bg-bg-muted/50",
        )}
      >
        {/* The icon carries the type; the label behind it is what a screen
            reader gets, since tone alone is colour-carrying-meaning. */}
        <span className={cn("mt-0.5 shrink-0", meta.tone)} title={meta.label}>
          <Icon size={15} strokeWidth={2} aria-hidden />
          <span className="sr-only">{meta.label}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span dir="auto" className="block font-body text-[13px] font-semibold text-fg">{n.title}</span>
          {n.body && <span dir="auto" className="mt-0.5 block font-body text-[12px] leading-relaxed text-fg-muted">{n.body}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-2 pt-0.5">
          <time
            dateTime={n.createdAt}
            title={Number.isNaN(created.getTime()) ? undefined : format(created, "d MMM yyyy, HH:mm")}
            className="font-body text-[11px] tabular-nums text-fg-subtle"
          >
            {Number.isNaN(created.getTime()) ? "—" : format(created, "HH:mm")}
          </time>
          {!n.readAt && <span aria-label="Unread" className="size-1.5 rounded-full bg-sirius" />}
        </span>
      </button>
    </li>
  );
}

/** Placeholder for the one frame before mount. Sized from the row count we
 *  already have, so the page does not visibly jump when the real list lands. */
function ListSkeleton({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      <div className="h-3 w-16 rounded bg-bg-muted" />
      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        {Array.from({ length: Math.max(rows, 3) }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 border-b border-border-subtle px-4 py-3 last:border-b-0">
            <div className="mt-0.5 size-[15px] shrink-0 rounded-full bg-bg-muted" />
            <div className="flex-1">
              <div className="h-3 w-1/2 rounded bg-bg-muted" />
              <div className="mt-2 h-2.5 w-3/4 rounded bg-bg-muted/70" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ filter, unreadOnly, anyLoaded }: { filter: Filter; unreadOnly: boolean; anyLoaded: boolean }) {
  /* Three different nothings, and saying the wrong one is a small lie: "you're
     all caught up" under an active filter means "nothing matches this filter". */
  const message = !anyLoaded
    ? "Nothing here yet. Assignments, task mentions, health changes, and profile nudges will collect on this page."
    : unreadOnly
      ? "Nothing unread — you're caught up."
      : `No ${filter === "all" ? "" : `${GROUP_LABEL[filter].toLowerCase()} `}notifications in what's loaded.`;

  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-surface px-6 py-14 text-center">
      <BellOff size={26} className="text-fg-subtle" />
      <p className="max-w-sm font-body text-[13px] text-fg-muted">{message}</p>
    </div>
  );
}
