/* =========================================================================
   Today page — scope / visibility resolution. Kept SEPARATE from presentation
   so authorisation is never "hide the UI". A viewer + PortfolioScope resolves
   to the set of account ids that should be visible; every repo read filters
   through this. When real permissions land, only this module changes.
   ========================================================================= */

import type { PortfolioScope } from "./types";
import { ACCOUNTS, USERS, VIEWER_USER_ID } from "./mock";

export interface Viewer {
  userId: string;
  /** Ids of users on the viewer's team (for the "my_team" scope). */
  teamUserIds: string[];
}

/** The signed-in viewer for this mock session. Future: derive from auth. */
export function currentViewer(): Viewer {
  const me = USERS.find((u) => u.id === VIEWER_USER_ID);
  const team = me?.team;
  const teamUserIds = USERS.filter((u) => u.team === team).map((u) => u.id);
  return { userId: VIEWER_USER_ID, teamUserIds };
}

/**
 * Account ids visible to `viewer` under `scope`. This is the authorisation
 * boundary — components must never widen it by rendering hidden data.
 */
export function visibleAccountIds(viewer: Viewer, scope: PortfolioScope): Set<string> {
  if (scope === "company") return new Set(ACCOUNTS.map((a) => a.id));
  if (scope === "my_team") {
    const owners = new Set(viewer.teamUserIds);
    return new Set(ACCOUNTS.filter((a) => owners.has(a.csmUserId)).map((a) => a.id));
  }
  // my_portfolio
  return new Set(ACCOUNTS.filter((a) => a.csmUserId === viewer.userId).map((a) => a.id));
}
