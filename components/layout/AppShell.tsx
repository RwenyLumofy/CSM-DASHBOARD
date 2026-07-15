"use client";

import { useState } from "react";
import { PanelLeftOpen } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { cn } from "@/lib/cn";
import type { Notification } from "@/lib/types";

export function AppShell({
  authEnabled,
  roleLabel,
  notifications,
  unreadCount,
  children,
}: {
  authEnabled: boolean;
  roleLabel?: string | null;
  notifications: Notification[];
  unreadCount: number;
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-dvh overflow-hidden bg-bg">
      {/* Sidebar — slides in/out via width transition */}
      <div
        className={cn(
          "shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out",
          sidebarOpen ? "w-60" : "w-0",
        )}
      >
        <Sidebar
          authEnabled={authEnabled}
          roleLabel={roleLabel}
          notifications={notifications}
          unreadCount={unreadCount}
          onCollapse={() => setSidebarOpen(false)}
        />
      </div>

      {/* Main content */}
      <div className="relative flex flex-1 flex-col overflow-hidden">
        {/* Re-open button — only visible when sidebar is collapsed */}
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            title="Open sidebar"
            className="absolute left-4 top-4 z-20 rounded-md border border-border bg-surface p-1.5 text-fg-muted shadow-sm transition-colors hover:bg-bg-muted hover:text-fg"
          >
            <PanelLeftOpen size={16} strokeWidth={1.75} />
          </button>
        )}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
