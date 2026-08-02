"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Bell, CheckCheck, Inbox, AtSign, MessageSquare, ClipboardCheck,
  UserPlus, ShieldAlert, ClipboardList, FileWarning, Info, type LucideIcon,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Notification } from "@/lib/types";
import { markAllReadAction, markReadAction, pollNotificationsAction } from "@/app/(app)/inbox/actions";
import { notificationHref } from "@/lib/notifications/link";
import { cn } from "@/lib/cn";

/* Every type gets its own mark. Four of these — the task ones and the yellow
   profile nudge — previously fell through to the same grey dot as "system", so
   being named in an update looked identical to a housekeeping notice. An icon
   also survives being read out: the dot alone carried meaning in colour only. */
const TYPE_META: Record<string, { icon: LucideIcon; tone: string; label: string }> = {
  assignment_needs_admin: { icon: ShieldAlert, tone: "text-danger", label: "Needs an admin decision" },
  assignment_review: { icon: ClipboardCheck, tone: "text-sirius", label: "Assignment to review" },
  client_assigned: { icon: UserPlus, tone: "text-success", label: "Account assigned to you" },
  task_assigned: { icon: ClipboardList, tone: "text-sirius", label: "Task assigned to you" },
  task_mentioned: { icon: AtSign, tone: "text-sirius", label: "You were mentioned" },
  task_update: { icon: MessageSquare, tone: "text-fg-muted", label: "Update on your task" },
  profile_incomplete_red: { icon: FileWarning, tone: "text-danger", label: "Account profile incomplete" },
  profile_incomplete_yellow: { icon: FileWarning, tone: "text-warning", label: "Account profile incomplete" },
  system: { icon: Info, tone: "text-fg-subtle", label: "System" },
};
const FALLBACK = { icon: Info, tone: "text-fg-subtle", label: "Notification" } as const;

/** How often the bell catches up while the tab is in front. Long enough not to
 *  be a background load on every open session, short enough that a mention
 *  arrives while the conversation is still live. */
const POLL_MS = 60_000;

export function NotificationsBell({
  initialItems,
  initialUnread,
}: {
  initialItems: Notification[];
  initialUnread: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  /* The list is state, not a prop read-through, because the poll below and the
     read-marking both have to change it between navigations. */
  const [items, setItems] = useState(initialItems);
  // Viewport coordinates for the fixed-position panel (see the panel's own
  // comment below for why it can't just be `absolute left-0`).
  const [panelPos, setPanelPos] = useState<{ left: number; bottom: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [, startTransition] = useTransition();

  useEffect(() => setUnread(initialUnread), [initialUnread]);
  useEffect(() => setItems(initialItems), [initialItems]);

  /* Catch up on a timer and whenever the tab comes back to the front. Without
     this the bell only moved on navigation, so being mentioned while you were
     reading an account page was invisible until you happened to click away. */
  const poll = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    const r = await pollNotificationsAction();
    // -1 is the action's "the read failed" signal. Keep what is on screen:
    // replacing it with [] would say "all caught up" when we simply don't know.
    if (r.unread < 0) return;
    setItems(r.items);
    setUnread(r.unread);
  }, []);

  useEffect(() => {
    const id = setInterval(() => void poll(), POLL_MS);
    const onVisible = () => void poll();
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, [poll]);

  function toggleOpen() {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPanelPos({ left: rect.left, bottom: window.innerHeight - rect.top + 8 });
      // Opening is the strongest signal that the user wants current data.
      void poll();
    }
    setOpen((o) => !o);
  }

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  function openItem(n: Notification) {
    setOpen(false);
    const href = notificationHref(n);
    /* Navigate first: marking read is a background write, and awaiting it here
       would block the push so the page appears to load but never moves. */
    if (href) router.push(href);
    if (!n.readAt) {
      setUnread((u) => Math.max(0, u - 1));
      setItems((prev) => prev.map((i) => i.id === n.id ? { ...i, readAt: new Date().toISOString() } : i));
      void markReadAction(n.id);
    }
  }

  async function markAll() {
    setUnread(0);
    const now = new Date().toISOString();
    setItems((prev) => prev.map((i) => i.readAt ? i : { ...i, readAt: now }));
    await markAllReadAction();
    // Inside a transition, or the Server Action's revalidation is never applied
    // and the rest of the page keeps rendering the old unread state.
    startTransition(() => router.refresh());
  }

  return (
    <div className="relative" ref={ref}>
      <button
        ref={buttonRef}
        aria-label="Notifications"
        onClick={toggleOpen}
        className="relative grid size-9 shrink-0 place-items-center rounded-md text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
      >
        <Bell size={18} strokeWidth={1.75} />
        {unread > 0 && (
          <span className="absolute right-1 top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && panelPos && (
        // `fixed` with coordinates from the button's own getBoundingClientRect()
        // (computed in toggleOpen), not `absolute left-0`. AppShell's sidebar
        // width-transition wrapper and its own root flex container both need
        // overflow-hidden for their own layouts, and every ancestor between
        // this button and the page root passes through one of them — so an
        // absolutely-positioned panel here was always clipped down to a sliver
        // of its true (still correctly laid out) 320px width, regardless of
        // which edge it was anchored to. `fixed` escapes that clipping
        // entirely, since no ancestor sets a transform/filter/will-change that
        // would trap it.
        <div
          style={{ left: panelPos.left, bottom: panelPos.bottom }}
          className="fixed z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border bg-surface shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2.5">
            <span className="font-body text-[13px] font-semibold text-fg">Notifications</span>
            {unread > 0 && (
              <button onClick={markAll} className="flex items-center gap-1 font-body text-[11.5px] font-medium text-sirius hover:underline">
                <CheckCheck size={13} /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-8 text-center font-body text-[12.5px] text-fg-subtle">You&apos;re all caught up.</div>
            ) : (
              <ul className="flex flex-col">
                {items.slice(0, 12).map((n) => {
                  const meta = TYPE_META[n.type] ?? FALLBACK;
                  const Icon = meta.icon;
                  const href = notificationHref(n);
                  const row = (
                    <>
                      <span className={cn("mt-0.5 shrink-0", meta.tone)} title={meta.label}>
                        <Icon size={14} strokeWidth={2} aria-hidden />
                        <span className="sr-only">{meta.label}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span dir="auto" className="block truncate font-body text-[12.5px] font-semibold text-fg">{n.title}</span>
                        {n.body && <span dir="auto" className="mt-0.5 block line-clamp-2 font-body text-[11.5px] text-fg-muted">{n.body}</span>}
                        <span className="mt-0.5 block font-body text-[10.5px] text-fg-subtle">
                          {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                        </span>
                      </span>
                      {/* Unread as a mark of its own, not only the row tint —
                          the tint alone is colour-carrying-meaning. */}
                      {!n.readAt && <span aria-label="Unread" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-sirius" />}
                    </>
                  );
                  const cls = cn(
                    "flex w-full gap-2.5 border-b border-border-subtle px-3 py-2.5 text-left transition-colors",
                    !n.readAt && "bg-accent-soft/40",
                  );
                  /* Nothing to open — mark it read in place instead of moving
                     the page. A row that looks clickable and then does nothing
                     reads as a broken app; this at least clears the badge. */
                  return (
                    <li key={n.id}>
                      <button onClick={() => openItem(n)}
                        className={cn(cls, href ? "hover:bg-bg-muted" : "cursor-default hover:bg-bg-muted/50")}>
                        {row}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <Link
            href="/inbox"
            onClick={() => setOpen(false)}
            className="flex items-center justify-center gap-1.5 border-t border-border-subtle px-3 py-2.5 font-body text-[12px] font-semibold text-sirius hover:bg-bg-muted"
          >
            <Inbox size={13} /> View all in Action list
          </Link>
        </div>
      )}
    </div>
  );
}
