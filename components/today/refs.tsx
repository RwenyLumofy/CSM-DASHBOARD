"use client";

/* Convenience wrappers so any component can drop in an account/user/page
   reference by id — the reusable account-reference component the spec asks for.
   All resolve by stable id and render through EntityMention. */

import { resolveMention } from "@/lib/today/repo";
import { EntityMention } from "./mentions";

export function AccountRef({ id }: { id: string }) {
  const e = resolveMention({ type: "account", id });
  return e ? <EntityMention entity={e} /> : <span className="text-fg-subtle">Unknown account</span>;
}
export function UserRef({ id }: { id: string }) {
  const e = resolveMention({ type: "user", id });
  return e ? <EntityMention entity={e} /> : <span className="text-fg-subtle">Unknown user</span>;
}
export function PageRef({ id }: { id: string }) {
  const e = resolveMention({ type: "page", id });
  return e ? <EntityMention entity={e} /> : <span className="text-fg-subtle">Unknown page</span>;
}
