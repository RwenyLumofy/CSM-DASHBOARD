"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell, CheckCheck, Inbox } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Notification } from "@/lib/types";
import { markAllReadAction, markReadAction } from "@/app/(app)/inbox/actions";
import { cn } from "@/lib/cn";

const TYPE_DOT: Record<string, string> = {
  assignment_needs_admin: "bg-danger",
  assignment_review: "bg-sirius",
  client_assigned: "bg-success",
  system: "bg-fg-subtle",
};

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
  // Viewport coordinates for the fixed-position panel (see the panel's own
  // comment below for why it can't just be `absolute left-0`).
  const [panelPos, setPanelPos] = useState<{ left: number; bottom: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setUnread(initialUnread), [initialUnread]);

  function toggleOpen() {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPanelPos({ left: rect.left, bottom: window.innerHeight - rect.top + 8 });
    }
    setOpen((o) => !o);
  }

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function openItem(n: Notification) {
    setOpen(false);
    // Navigate first so the click always lands on the client page. Marking the
    // notification read is a background write — awaiting the server action here
    // would block the push and the page would appear to "load" but never move.
    if (n.clientId) router.push(`/clients/${n.clientId}`);
    else router.refresh();
    if (!n.readAt) {
      setUnread((u) => Math.max(0, u - 1));
      void markReadAction(n.id);
    }
  }

  async function markAll() {
    setUnread(0);
    await markAllReadAction();
    router.refresh();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        ref={buttonRef}
        aria-label="Notifications"
        onClick={toggleOpen}
        className="relative grid size-9 shrink-0 place-items-center rounded-md text-neutral-300 transition-colors hover:bg-white/10 hover:text-white"
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
            {initialItems.length === 0 ? (
              <div className="px-4 py-8 text-center font-body text-[12.5px] text-fg-subtle">You&apos;re all caught up.</div>
            ) : (
              <ul className="flex flex-col">
                {initialItems.slice(0, 12).map((n) => (
                  <li key={n.id}>
                    <button
                      onClick={() => openItem(n)}
                      className={cn(
                        "flex w-full gap-2.5 border-b border-border-subtle px-3 py-2.5 text-left transition-colors hover:bg-bg-muted",
                        !n.readAt && "bg-accent-soft/40",
                      )}
                    >
                      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", TYPE_DOT[n.type] ?? "bg-fg-subtle")} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-body text-[12.5px] font-semibold text-fg">{n.title}</span>
                        {n.body && <span className="mt-0.5 block line-clamp-2 font-body text-[11.5px] text-fg-muted">{n.body}</span>}
                        <span className="mt-0.5 block font-body text-[10.5px] text-fg-subtle">
                          {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
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
