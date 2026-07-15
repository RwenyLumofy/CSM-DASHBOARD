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
  "/api/cron(.*)",
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
    // Skip Next internals and static files; always run on API routes.
    "/((?!_next|.*\\..*).*)",
    "/(api|trpc)(.*)",
  ],
};
