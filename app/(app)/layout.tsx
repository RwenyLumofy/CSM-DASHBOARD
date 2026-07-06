import { AppShell } from "@/components/layout/AppShell";
import { authEnabled } from "@/lib/config";
import { getCurrentUserRole } from "@/lib/auth";
import { getMyNotifications, getMyUnreadCount, getRoleLabels } from "@/lib/data";
import { roleLabel } from "@/lib/roles";

// The dashboard reads live data (DB/sample) and supports in-app mutations, so
// render per-request rather than prerendering a build-time snapshot.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
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
