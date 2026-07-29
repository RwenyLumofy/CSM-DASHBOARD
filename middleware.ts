import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const authConfigured =
  !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && !!process.env.CLERK_SECRET_KEY;

// Public routes that never require a session. /api/cron/* is called by
// Vercel's scheduler (no Clerk session ever exists for that caller) and is
// authenticated instead by its own CRON_SECRET bearer-token check — without
// this exclusion, auth.protect() 404s the request before the route handler
// (and its secret check) ever runs, silently breaking the scheduled sync.
const isPublic = createRouteMatcher([
  "/sign-in(.*)",
  "/api/sync(.*)",
  // One-time churned-account backfill — authenticated by its own SYNC_SECRET/
  // CRON_SECRET bearer check (same as /api/sync), so it must bypass auth.protect()
  // which would otherwise 404 the request before the handler's secret check runs.
  "/api/churn-import(.*)",
  // One-off single-company backfill (same secret check as above).
  "/api/add-account(.*)",
  // Force-refresh one client's Metabase usage snapshot (same secret check).
  "/api/usage-refresh(.*)",
  "/api/cron(.*)",
  // NOTHING UNDER /scratch-* BELONGS HERE. /scratch-wf was public and shipped
  // for longer than the rest, on the assumption it was safe because
  // getClients() is role-scoped. It wasn't: buildTodaySnapshot() also calls
  // getAppUsers(), which has no role, session or scope check and returns the
  // whole staff directory — emails, names, permission tiers, departments,
  // plus the bootstrap super-admin addresses. TodayWorkspace is a client
  // component, so that list was serialized into the RSC payload of an
  // unauthenticated page. The route is deleted; /today serves the same thing
  // behind auth.
]);

// Build the Clerk handler only when configured; otherwise run open (dev/sample).
// clockSkewInMs is widened from Clerk's 5s default: a sign-in from a device whose
// system clock has drifted trips "Clock skew detected" and loops on the sign-in
// redirect. This absorbs normal device drift without weakening anything else.
const handler = authConfigured
  ? clerkMiddleware(
      async (auth, req) => {
        if (!isPublic(req)) await auth.protect();
      },
      { clockSkewInMs: 60_000 },
    )
  : () => NextResponse.next();

export default handler;

export const config = {
  matcher: [
    /* Skip Next internals and REAL static files; always run on API routes.
       The previous pattern excluded any path containing a dot ANYWHERE
       (`.*\..*`). /api was re-covered by the second entry, but pages were not
       — and Next dispatches a server action as a POST to a page URL, so
       `POST /clients/x.y` matched the [id] route, skipped clerkMiddleware
       entirely, and ran server actions with no session. Actions that resolve
       role -> null mostly deny, but getClientForProfile explicitly returns the
       unfiltered row when role is null, on the stated assumption that "the
       middleware has already guaranteed this request is authenticated".

       Matching an explicit extension list instead means a dotted DYNAMIC
       SEGMENT stays inside the middleware, while genuine assets still skip it.
       This is Clerk's current recommended matcher. */
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)$).*)",
    "/(api|trpc)(.*)",
  ],
};
