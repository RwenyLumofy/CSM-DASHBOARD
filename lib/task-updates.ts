/* =========================================================================
   Task-update text: the mention token, and how to read it back.

   Lives here rather than beside the server action because a "use server" module
   may only export async functions — a sync helper exported from one is a build
   error, not a type error, so tsc will not tell you. It is also the reason this
   is unit-testable at all.
   ========================================================================= */

/** The stored form of a mention. The email is the identity so a rename can
 *  never break a mention; the display name is drawn at render time. */
const MENTION_TOKEN = /@\[([^\]]+)\]/g;

/**
 * Every person named in an update body, lower-cased and de-duplicated.
 *
 * The server parses this from the text rather than trusting a list sent by the
 * client: the tokens are what a reader sees, so they must also be exactly what
 * notifies. Naming somebody twice in one sentence notifies them once.
 */
export function parseMentions(body: string): string[] {
  return [...new Set(
    [...body.matchAll(MENTION_TOKEN)].map((m) => m[1].trim().toLowerCase()).filter(Boolean),
  )];
}
