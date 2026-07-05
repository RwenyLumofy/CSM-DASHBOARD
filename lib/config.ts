/* Runtime configuration & mode detection.
   The app runs in "sample mode" until a database is configured, and each
   integration is independently "live" only when its token is present. */

export const env = {
  databaseUrl: process.env.DATABASE_URL ?? "",
  directDatabaseUrl: process.env.DIRECT_DATABASE_URL ?? "",

  clerkPublishable: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "",
  clerkSecret: process.env.CLERK_SECRET_KEY ?? "",

  hubspotToken: process.env.HUBSPOT_ACCESS_TOKEN ?? "",
  hubspotPortalId: process.env.HUBSPOT_PORTAL_ID ?? "",

  intercomToken: process.env.INTERCOM_ACCESS_TOKEN ?? "",
  intercomRegion: (process.env.INTERCOM_REGION ?? "us") as "us" | "eu" | "au",

  metabaseUrl: process.env.METABASE_URL ?? "",
  metabaseApiKey: process.env.METABASE_API_KEY ?? "",
  metabaseUsername: process.env.METABASE_USERNAME ?? "",
  metabasePassword: process.env.METABASE_PASSWORD ?? "",
  metabaseUsageCardId: process.env.METABASE_USAGE_CARD_ID ?? "",

  syncSecret: process.env.SYNC_SECRET ?? "",
  cronSecret: process.env.CRON_SECRET ?? "",

  // Supabase Storage — used to host manually-uploaded client attachments. The
  // project URL is derived from DATABASE_URL's `postgres.<project-ref>` user
  // (see lib/integrations/supabase-storage.ts), so only the keys are needed.
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",

  /** Emails allowed to edit default/system property definitions in Settings. */
  superAdminEmails: (process.env.SUPER_ADMIN_EMAILS ?? "melrweny@lumofy.com")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
} as const;

/** True when a real database is configured — pages read synced data. */
export function hasDatabase(): boolean {
  return env.databaseUrl.length > 0;
}

/** True when Clerk keys are present — auth is enforced. Otherwise dev bypass. */
export function authEnabled(): boolean {
  return env.clerkPublishable.length > 0 && env.clerkSecret.length > 0;
}

export const integrations = {
  hubspot: () => env.hubspotToken.length > 0,
  intercom: () => env.intercomToken.length > 0,
  metabase: () => env.metabaseUrl.length > 0 && (env.metabaseApiKey.length > 0 || env.metabaseUsername.length > 0),
  supabaseStorage: () => env.supabaseServiceRoleKey.length > 0 && env.supabaseAnonKey.length > 0 && hasDatabase(),
};

/** Overall mode label used in the UI banner. */
export function modeLabel(): "sample" | "live" {
  return hasDatabase() ? "live" : "sample";
}
