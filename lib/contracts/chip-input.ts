/* =========================================================================
   Typed-in chip values — the rule, kept out of the component so it can be
   tested and so both the Contract tab and anything else adopting a typeable
   chip field answer "is this the same value?" identically.

   Why typing is allowed at all: the suggested lists on the Contract tab are a
   convenience, not a vocabulary. A global-library provider we have signed but
   nobody has added to a picklist (EdX, the case that surfaced this) has to be
   recordable the day the contract is signed. Nothing server-side constrains
   the name — validateRecord only requires a provider to be non-empty.

   What the rule protects: "edx", "EdX" and " EdX " as three providers on one
   account is a reporting problem, not three libraries.
   ========================================================================= */

/** Case- and space-insensitive identity for a chip value. */
export function sameChip(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * The selection after typing `typed` into a chip field.
 *
 * - Blank (or whitespace) adds nothing.
 * - A typed value matching a suggestion keeps the SUGGESTION's spelling, so a
 *   list stays consistent however someone types it.
 * - A value already selected is a no-op rather than a duplicate.
 * - Anything else is added as typed, trimmed.
 *
 * Returns null when nothing changes, so a caller can skip a pointless write.
 */
export function addTypedChip(shown: string[], value: string[], typed: string): string[] | null {
  const name = typed.trim();
  if (!name) return null;
  const canonical = shown.find((o) => sameChip(o, name)) ?? name;
  if (value.some((v) => sameChip(v, canonical))) return null;
  return [...value, canonical];
}
