import { AppShell } from "@/components/layout/AppShell";
import { authEnabled } from "@/lib/config";
import { getCurrentUserRole } from "@/lib/auth";
import { getMyNotifications, getMyUnreadCount, getRoleLabels } from "@/lib/data";
import { roleLabel } from "@/lib/roles";

// The dashboard reads live data (DB/sample) and supports in-app mutations, so
// render per-request rather than prerendering a build-time snapshot.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const role = authEnabled() ? await getCurrentUserRole() : null;
  const [customLabels, notifications, unreadCount] = await Promise.all([
    role ? getRoleLabels() : Promise.resolve(undefined),
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
