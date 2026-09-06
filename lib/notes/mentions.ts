/* Mentions in a note body.

   The stored form is `@[email]`, exactly as task_updates does it — the email
   is the identity and the name is only display, so renaming somebody never
   breaks a mention, and no character offsets exist to be invalidated by an
   edit. See lib/db/schema.ts (clientNoteMentions) for why the index table
   rather than the prose is the authority.

   The body is sanitized HTML, so a token can be split across tags by the
   editor. Tokens are therefore read from the TEXT content, not the markup. */

/** Every `@[email]` token in a note body, lower-cased and de-duplicated. */
export function extractMentions(html: string): string[] {
  const text = html.replace(/<[^>]*>/g, " ");
  const out = new Set<string>();
  const re = /@\[([^\]\s]+@[^\]\s]+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.add(m[1].trim().toLowerCase());
  return [...out];
}

/** Drop tokens naming anyone not on `allowed`, rewriting them to plain text.
 *
 *  A mention grants no access, and does not yet notify — but it is intended to,
 *  so the server must never take the browser's word for who may be named: the
 *  picker offers only people who can already see the account, and this
 *  re-checks it. An
 *  unauthorised token becomes "@someone@example.com" as ordinary prose rather
 *  than vanishing — silently deleting words somebody wrote is worse. */
export function filterMentions(html: string, allowed: Set<string>): string {
  return html.replace(/@\[([^\]\s]+@[^\]\s]+)\]/g, (whole, email: string) =>
    allowed.has(email.trim().toLowerCase()) ? whole : `@${email.trim()}`,
  );
}
