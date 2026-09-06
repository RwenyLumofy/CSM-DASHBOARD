"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Bell, Inbox, ListChecks, PanelLeftClose, Settings, ShieldCheck, Sun, TrendingUp, Users , Compass} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { Logo } from "@/components/brand/Logo";
import { Avatar } from "@/components/ui/Avatar";
import { NotificationsBell } from "@/components/layout/NotificationsBell";
import type { Notification } from "@/lib/types";
import { cn } from "@/lib/cn";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV: NavItem[] = [
  { href: "/today", label: "Today", icon: Sun },
  { href: "/clients", label: "Clients", icon: Users },
  // Between Clients and the Action list: expansion is account work you go
  // looking for, not work that arrives in a queue. Hidden from guests, who
  // have no access to the feature — see lib/expansion/access.ts.
  { href: "/expansion", label: "Expansion", icon: TrendingUp },
  { href: "/inbox", label: "Action list", icon: Inbox },
  { href: "/playbooks", label: "Playbooks", icon: ListChecks },
  { href: "/reports", label: "Insights", icon: BarChart3 },
  { href: "/use-cases", label: "Use Case Universe", icon: Compass },
];

/* Notifications sits directly above Settings: it is a place you go to catch
   up, not part of the working nav above. The bell in the account row is the
   same data — it stays as the at-a-glance badge, and this is where it opens
   out into history and filters. */
const BOTTOM_NAV: NavItem[] = [
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({
  authEnabled,
  roleLabel,
  notifications = [],
  unreadCount = 0,
  showExpansion = true,
  onCollapse,
}: {
  authEnabled: boolean;
  roleLabel?: string | null;
  notifications?: Notification[];
  unreadCount?: number;
  /** False for a guest. Courtesy only — the route 404s and the read layer
   *  returns nothing, so removing the link is not what enforces this. */
  showExpansion?: boolean;
  onCollapse?: () => void;
}) {
  const pathname = usePathname();
  const nav = showExpansion ? NAV : NAV.filter((i) => i.href !== "/expansion");

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col gap-6 border-r border-border bg-surface px-4 py-5">
      <div className="flex items-center justify-between px-2 py-1">
        <Link href="/" aria-label="Lumofy home">
          <Logo kind="primary-horizontal" height={26} />
        </Link>
        {onCollapse && (
          <button
            onClick={onCollapse}
            title="Collapse sidebar"
            className="rounded-md p-1 text-fg-subtle transition-colors hover:bg-bg-muted hover:text-fg"
          >
            <PanelLeftClose size={17} strokeWidth={1.75} />
          </button>
        )}
      </div>

      <nav className="flex flex-col gap-0.5">
        {nav.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 font-body text-sm transition-colors duration-[140ms] [transition-timing-function:var(--ease-standard)]",
                active ? "bg-sirius font-semibold text-white shadow-sm" : "font-medium text-fg-muted hover:bg-bg-muted hover:text-fg",
              )}
            >
              <Icon size={18} strokeWidth={1.75} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-2">
        <nav className="flex flex-col gap-0.5">
          {BOTTOM_NAV.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 font-body text-sm transition-colors duration-[140ms] [transition-timing-function:var(--ease-standard)]",
                  active ? "bg-sirius font-semibold text-white shadow-sm" : "font-medium text-fg-muted hover:bg-bg-muted hover:text-fg",
                )}
              >
                <Icon size={18} strokeWidth={1.75} />
                {item.label}
                {/* Unread count rides the nav row too, so the number is visible
                    without hunting for the bell — and it reads as a count, not
                    as a dot whose meaning you have to already know. */}
                {item.href === "/notifications" && unreadCount > 0 && (
                  <span
                    className={cn(
                      "ml-auto grid min-w-[18px] place-items-center rounded-pill px-1.5 py-0.5 font-body text-[10px] font-bold tabular-nums",
                      active ? "bg-white/20 text-white" : "bg-danger text-white",
                    )}
                  >
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Account + notifications — standard bottom-of-sidebar placement */}
        <div className="border-t border-border px-1 pt-3">
          <div className="flex items-center justify-between gap-2">
            {authEnabled ? (
              <UserButton showName afterSignOutUrl="/sign-in" />
            ) : (
              <span className="flex items-center gap-2">
                <Avatar initials="CS" tone="sirius" size={30} />
                <span className="font-body text-[13px] font-semibold text-fg">CS Team</span>
              </span>
            )}
            <NotificationsBell initialItems={notifications} initialUnread={unreadCount} />
          </div>
          {roleLabel && (
            <div className="mt-2 flex items-center gap-1.5 px-0.5">
              <ShieldCheck size={12} className="shrink-0 text-sirius" />
              <span className="font-body text-[11px] font-semibold uppercase tracking-[0.05em] text-fg-subtle">{roleLabel}</span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
