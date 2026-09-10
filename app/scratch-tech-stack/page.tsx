import { notFound } from "next/navigation";
import { PreviewSection } from "./preview-client";

/* =========================================================================
   Dev preview — Client profile → General information → Tech stack.

   The real client page needs a signed-in owner, so this renders the real
   section against a hand-written properties bag: one card already filled, one
   empty, plus the two states that only appear when something goes wrong: no
   write access, and a write the server refuses. Saving is stubbed (see
   preview-client.tsx) — chips stick here, but nothing is written anywhere.

   Tracked (Tailwind skips gitignored paths) and 404s outside development.
   ========================================================================= */

export const metadata = { title: "Preview · Client tech stack" };

const FILLED = {
  tech_stack_hris: ["Workday", "ADP Workforce Now"],
  tech_stack_lms: ["Cornerstone OnDemand", "LinkedIn Learning"],
  tech_stack_performance: ["Lattice"],
  tech_stack_sso: ["Okta"],
  tech_stack_collaboration: ["Microsoft Teams", "Confluence"],
  tech_stack_other: ["In-house competency portal"],
  tech_stack_notes:
    "Workday is the system of record for the org chart; HR ops owns it and will only expose a nightly CSV.\nSSO is Okta — SCIM provisioning is possible but needs IT sign-off.",
};

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-6 sm:p-8">
      <div>
        <h1 className="font-display text-lg font-bold text-fg">Tech stack — recorded</h1>
        <p className="caption mt-1">Sections start collapsed; click the header to open. Type in any box to add a tool.</p>
      </div>
      <PreviewSection props={FILLED} />

      <h1 className="font-display text-lg font-bold text-fg">Tech stack — nothing recorded</h1>
      <PreviewSection props={{}} />

      <div>
        <h1 className="font-display text-lg font-bold text-fg">Tech stack — no write access</h1>
        <p className="caption mt-1">What a Guest or a non-owning operator sees: the list, no inputs.</p>
      </div>
      <PreviewSection props={FILLED} canEdit={false} />

      <div>
        <h1 className="font-display text-lg font-bold text-fg">Tech stack — the write is refused</h1>
        <p className="caption mt-1">Editable, but every save comes back 403. Add a chip to see the message.</p>
      </div>
      <PreviewSection props={FILLED} refuseWrites />
    </div>
  );
}
