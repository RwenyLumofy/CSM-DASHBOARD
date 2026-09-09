"use client";

/* Preview-only. Stubs the PATCH the Tech stack chips fire on every add and
   remove: this page has no client row (and no Clerk session), so the real call
   404s and every chip you add would roll straight back out, leaving nothing to
   actually try. Scoped to the preview client id — any other request falls
   through to the real fetch. */

import { useEffect } from "react";
import { TechStackSection } from "@/components/clients/ClientProfileTabs";

const PREVIEW_ID = "preview";

function stubClientPatch() {
  const w = window as typeof window & { __techStackStubbed?: boolean };
  if (w.__techStackStubbed) return;
  w.__techStackStubbed = true;
  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes(`/api/clients/${PREVIEW_ID}`)) {
      await new Promise((r) => setTimeout(r, 250)); // let the saving spinner show
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return real(input, init);
  };
}

export function PreviewSection({ props }: { props: Record<string, unknown> }) {
  // In an effect, not inline: this runs on the server too, where there is no
  // `window` to patch. Nothing fetches until someone adds a chip, so being in
  // place after mount is early enough.
  useEffect(stubClientPatch, []);
  return <TechStackSection clientId={PREVIEW_ID} props={props} />;
}
