import { Database } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { authEnabled, hasDatabase } from "@/lib/config";
import { getCurrentUserRole } from "@/lib/auth";
import { getMyNotifications, getMyUnreadCount, getRoleLabels } from "@/lib/data";
import { roleLabel } from "@/lib/roles";

// The dashboard reads live data (DB/sample) and supports in-app mutations, so
// render per-request rather than prerendering a build-time snapshot.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // No DB, no data. Every page under this layout reads through lib/data.ts,
  // which no longer falls back to the sample seed — so rather than render a
  // shell full of empty tables, say plainly why there's nothing here. Checked
  // before the reads below so an unconfigured app does no work at all.
  if (!hasDatabase()) return <NoDatabaseNotice />;

  // Every one of these used to wait on `role` first — role was awaited ALONE
  // before this Promise.all even started, so the Clerk/role round-trip
  // serialized in front of notifications/labels that don't actually need it.
  // getRoleLabels() degrades to defaults on its own if the DB is unavailable,
  // so it's safe to fetch unconditionally rather than gating it on role.
  const [role, customLabels, notifications, unreadCount] = await Promise.all([
    authEnabled() ? getCurrentUserRole() : Promise.resolve(null),
    getRoleLabels(),
    getMyNotifications(20),
    getMyUnreadCount(),
  ]);
  return (
    <AppShell
      authEnabled={authEnabled()}
      roleLabel={role ? roleLabel(role, customLabels) : null}
      notifications={notifications}
      unreadCount={unreadCount}
    >
      {children}
    </AppShell>
  );
}

function NoDatabaseNotice() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="flex flex-col items-center rounded-xl border border-dashed border-border px-6 py-12 text-center">
        <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-accent-soft text-sirius">
          <Database size={20} />
        </div>
        <p className="font-body text-[14px] font-semibold text-fg">No database configured.</p>
        <p className="mt-1 max-w-sm font-body text-[12.5px] leading-relaxed text-fg-muted">
          Set <code>DATABASE_URL</code> in <code>.env.local</code> and reload. Until then there is
          nothing to show — this app no longer falls back to sample data.
        </p>
      </div>
    </main>
  );
}
