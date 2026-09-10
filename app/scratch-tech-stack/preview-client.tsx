"use client";

/* Preview-only. Stubs the PATCH the Tech stack chips fire on every add and
   remove: this page has no client row (and no Clerk session), so the real call
   404s and every chip you add would roll straight back out, leaving nothing to
   actually try. Scoped to the preview client id — any other request falls
   through to the real fetch. */

import { useEffect } from "react";
import { TechStackSection } from "@/components/clients/ClientProfileTabs";

const PREVIEW_ID = "preview";
/** Second preview id whose writes are refused, to exercise the error path. */
const FAILING_ID = "preview-refused";

function stubClientPatch() {
  const w = window as typeof window & { __techStackStubbed?: boolean };
  if (w.__techStackStubbed) return;
  w.__techStackStubbed = true;
  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes(`/api/clients/${FAILING_ID}`)) {
      await new Promise((r) => setTimeout(r, 250));
      // The shape the real route returns on a refusal, so the preview shows
      // the message a Guest or non-owning operator would actually read.
      return new Response(
        JSON.stringify({ ok: false, error: "You don't have permission to edit this account." }),
        { status: 403 },
      );
    }
    if (url.includes(`/api/clients/${PREVIEW_ID}`)) {
      await new Promise((r) => setTimeout(r, 250)); // let the saving spinner show
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return real(input, init);
  };
}

export function PreviewSection({
  props,
  canEdit = true,
  refuseWrites = false,
}: {
  props: Record<string, unknown>;
  canEdit?: boolean;
  refuseWrites?: boolean;
}) {
  // In an effect, not inline: this runs on the server too, where there is no
  // `window` to patch. Nothing fetches until someone adds a chip, so being in
  // place after mount is early enough.
  useEffect(stubClientPatch, []);
  return <TechStackSection clientId={refuseWrites ? FAILING_ID : PREVIEW_ID} props={props} canEdit={canEdit} />;
}
