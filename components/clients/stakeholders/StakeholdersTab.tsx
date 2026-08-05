"use client";

/* The account relationship workspace.

   Three things share this tab, in deliberate priority order:

     1. Coverage    what's MISSING. First, because a gap is invisible in any
                    list of what exists — you cannot see the absent economic
                    buyer by scrolling contacts.
     2. List        the reliable primary management surface. Sortable, dense,
                    every record reachable and editable.
     3. Map         a complementary view of org and influence. Explicitly
                    secondary: relationship graphs degrade badly with real
                    data, so the list never depends on it.

   Synced HubSpot contacts that nobody has mapped yet are surfaced at the
   bottom as one-click promotions, so the tab starts useful on an account
   where no one has done any mapping — rather than showing an empty state
   next to 40 contacts sitting one tab away. */

import { useMemo, useState } from "react";
import {
  Plus, Users, ShieldAlert, Info, AlertTriangle, ArrowUpRight, Network, List as ListIcon, Search,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/cn";
import type { Contact } from "@/lib/types";
import {
  ROLE_LABEL, SENTIMENT_LABEL, INFLUENCE_LABEL, ENGAGEMENT_LABEL,
  stakeholderName, stakeholderInitials,
  type StakeholderProfile, type StakeholderLink,
} from "@/lib/stakeholders/profile";
import { stakeholderCoverage, type CoverageGap, type CoverageSeverity } from "@/lib/stakeholders/coverage";
import { StakeholderDrawer } from "./StakeholderDrawer";
import { RelationshipMap } from "./RelationshipMap";

/* Sentiment is the one scale where colour genuinely aids scanning, so it also
   carries a text label — never colour alone (WCAG 1.4.1). */
const SENTIMENT_TONE: Record<string, string> = {
  champion: "bg-[#1F9D63]/10 text-[#1F9D63] border-[#1F9D63]/25",
  supportive: "bg-[#1F9D63]/8 text-[#1F9D63] border-[#1F9D63]/20",
  neutral: "bg-bg-muted text-fg-muted border-border",
  sceptical: "bg-[#8A6D12]/10 text-[#8A6D12] border-[#8A6D12]/25",
  detractor: "bg-[#B23A57]/10 text-[#B23A57] border-[#B23A57]/25",
  unknown: "bg-bg-muted text-fg-subtle border-border-subtle",
};

const GAP_TONE: Record<CoverageSeverity, { box: string; icon: typeof ShieldAlert; label: string }> = {
  critical: { box: "border-[#B23A57]/30 bg-[#B23A57]/5 text-[#B23A57]", icon: ShieldAlert, label: "Critical" },
  warning: { box: "border-[#C99A14]/30 bg-[#8A6D12]/5 text-[#8A6D12]", icon: AlertTriangle, label: "Warning" },
  info: { box: "border-border bg-bg-muted/50 text-fg-muted", icon: Info, label: "For information" },
};

function CoverageCard({ gap, onFix }: { gap: CoverageGap; onFix?: () => void }) {
  const tone = GAP_TONE[gap.severity];
  const Icon = tone.icon;
  return (
    <li className={cn("flex items-start gap-2.5 rounded-xl border px-3 py-2.5", tone.box)}>
      <Icon size={14} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-body text-[13px] font-semibold text-fg">
          <span className="sr-only">{tone.label}: </span>{gap.title}
        </p>
        {/* Always visible, never behind a tooltip — a warning a CSM can't
            audit is a warning they learn to ignore. */}
        <p className="mt-0.5 font-body text-[11.5px] leading-relaxed text-fg-muted">{gap.derivation}</p>
      </div>
      {gap.suggestedRole && onFix && (
        <button onClick={onFix}
          className="shrink-0 rounded-lg border border-border bg-bg px-2.5 py-1 font-body text-[11.5px] font-semibold text-fg-muted transition-colors hover:border-sirius hover:text-sirius">
          Map one
        </button>
      )}
    </li>
  );
}

export function StakeholdersTab({
  clientId, initialProfiles, initialLinks, contacts, canEdit, teamEmails, renewalDate, today,
}: {
  clientId: string;
  initialProfiles: StakeholderProfile[];
  initialLinks: StakeholderLink[];
  contacts: Contact[];
  canEdit: boolean;
  teamEmails: { email: string; name: string | null }[];
  renewalDate: string | null;
  today: string;
}) {
  const [profiles, setProfiles] = useState(initialProfiles);
  const [links, setLinks] = useState(initialLinks);
  const [view, setView] = useState<"list" | "map">("list");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{ profile: StakeholderProfile | null } | null>(null);

  const gaps = useMemo(
    () => stakeholderCoverage({ profiles, links, today, renewalDate }),
    [profiles, links, today, renewalDate],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q
      ? profiles.filter((p) =>
          [stakeholderName(p), p.email, p.jobTitle, p.department, ...p.roles.map((r) => ROLE_LABEL[r])]
            .some((v) => v?.toLowerCase().includes(q)))
      : profiles;
    // Most consequential first: influence outranks alphabetical, because the
    // question this tab answers is "who matters", not "who is called A".
    const inf = { high: 0, medium: 1, low: 2, unknown: 3 } as const;
    return [...rows].sort((a, b) => inf[a.influence] - inf[b.influence] || stakeholderName(a).localeCompare(stakeholderName(b)));
  }, [profiles, query]);

  /** Synced contacts nobody has mapped yet — the on-ramp for a cold account. */
  const unmapped = useMemo(() => {
    const claimed = new Set(profiles.map((p) => p.contactId).filter(Boolean));
    const emails = new Set(profiles.map((p) => p.email).filter(Boolean));
    return contacts.filter((c) => !claimed.has(c.id) && !(c.email && emails.has(c.email.toLowerCase())));
  }, [profiles, contacts]);

  function upsert(p: StakeholderProfile) {
    setProfiles((prev) => (prev.some((x) => x.id === p.id) ? prev.map((x) => (x.id === p.id ? p : x)) : [...prev, p]));
    setEditing(null);
  }
  function removed(id: string) {
    setProfiles((prev) => prev.filter((p) => p.id !== id));
    setLinks((prev) => prev.filter((l) => l.fromId !== id && l.toId !== id));
    setEditing(null);
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-[17px] font-semibold text-fg">Stakeholders</h2>
          <p className="mt-0.5 font-body text-[12.5px] text-fg-muted">
            {profiles.length === 0
              ? "Who is involved, who decides, and who is missing."
              : `${profiles.length} mapped · ${gaps.filter((g) => g.severity === "critical").length} critical gap${gaps.filter((g) => g.severity === "critical").length === 1 ? "" : "s"}`}
          </p>
        </div>
        {canEdit && (
          <button onClick={() => setEditing({ profile: null })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sirius px-3 py-2 font-body text-[13px] font-semibold text-white">
            <Plus size={14} /> Add stakeholder
          </button>
        )}
      </header>

      {gaps.length > 0 && (
        <section aria-labelledby="coverage-h">
          <h3 id="coverage-h" className="mb-2 font-body text-[12px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">
            Relationship coverage
          </h3>
          <ul className="flex flex-col gap-1.5">
            {gaps.map((g) => (
              <CoverageCard key={g.id} gap={g} onFix={canEdit ? () => setEditing({ profile: null }) : undefined} />
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Stakeholder view" className="flex rounded-lg border border-border p-0.5">
          {([["list", ListIcon, "List"], ["map", Network, "Relationship map"]] as const).map(([key, Icon, label]) => (
            <button key={key} role="tab" aria-selected={view === key} onClick={() => setView(key)}
              className={cn("inline-flex items-center gap-1.5 rounded-[6px] px-2.5 py-1.5 font-body text-[12.5px] font-medium transition-colors",
                view === key ? "bg-accent-soft text-sirius" : "text-fg-muted hover:text-fg")}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
        {view === "list" && profiles.length > 0 && (
          <label className="relative ml-auto flex min-w-[200px] flex-1 items-center sm:flex-none">
            <Search size={13} className="pointer-events-none absolute left-2.5 text-fg-subtle" aria-hidden />
            <span className="sr-only">Search stakeholders</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, role, title…"
              className="w-full rounded-lg border border-border bg-bg py-1.5 pl-7 pr-2.5 font-body text-[12.5px] text-fg outline-none placeholder:text-fg-subtle focus:border-sirius" />
          </label>
        )}
      </div>

      {view === "map" ? (
        <RelationshipMap profiles={profiles} links={links} clientId={clientId} canEdit={canEdit}
          onLinksChange={setLinks} onOpen={(p) => setEditing({ profile: p })} />
      ) : profiles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-5 py-8 text-center">
          <Users size={22} className="mx-auto text-fg-subtle" aria-hidden />
          <p className="mt-2 font-body text-[13.5px] font-semibold text-fg">No stakeholders mapped yet</p>
          <p className="mx-auto mt-1 max-w-md font-body text-[12.5px] leading-relaxed text-fg-muted">
            Nothing records who sponsors this account, who signs, or who would block a renewal.
            {unmapped.length > 0 && ` ${unmapped.length} synced contact${unmapped.length === 1 ? " is" : "s are"} available to promote below.`}
          </p>
          {canEdit && (
            <button onClick={() => setEditing({ profile: null })}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-sirius px-3 py-2 font-body text-[13px] font-semibold text-white">
              <Plus size={14} /> Add the first stakeholder
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[720px] border-collapse">
            <caption className="sr-only">Stakeholders on this account, most influential first</caption>
            <thead>
              <tr className="border-b border-border bg-bg-muted/40 text-left">
                {["Stakeholder", "Role", "Sentiment", "Influence", "Engagement", "Owner"].map((h) => (
                  <th key={h} scope="col" className="px-3 py-2 font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-border-subtle last:border-0 hover:bg-bg-muted/40">
                  <td className="px-3 py-2.5">
                    <button onClick={() => setEditing({ profile: p })} className="flex min-w-0 items-center gap-2.5 text-left">
                      <Avatar initials={stakeholderInitials(p)} size={28} />
                      <span className="min-w-0">
                        <span dir="auto" className="block truncate font-body text-[13px] font-semibold text-fg">{stakeholderName(p)}</span>
                        {p.jobTitle && <span dir="auto" className="block truncate font-body text-[11.5px] text-fg-subtle">{p.jobTitle}</span>}
                      </span>
                    </button>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="flex flex-wrap gap-1">
                      {p.roles.length === 0
                        ? <span className="font-body text-[11.5px] text-fg-subtle">No role set</span>
                        : p.roles.map((r) => (
                            <span key={r} className="rounded-full border border-border bg-bg-muted px-2 py-0.5 font-body text-[11px] font-medium text-fg-muted">
                              {ROLE_LABEL[r]}
                            </span>
                          ))}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={cn("inline-block rounded-full border px-2 py-0.5 font-body text-[11px] font-medium", SENTIMENT_TONE[p.sentiment])}>
                      {SENTIMENT_LABEL[p.sentiment]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-body text-[12px] text-fg-muted">{INFLUENCE_LABEL[p.influence]}</td>
                  <td className="px-3 py-2.5 font-body text-[12px] text-fg-muted">{ENGAGEMENT_LABEL[p.engagementStatus]}</td>
                  <td className="px-3 py-2.5 font-body text-[12px] text-fg-muted">{p.ownerEmail ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {unmapped.length > 0 && canEdit && view === "list" && (
        <section aria-labelledby="unmapped-h" className="rounded-xl border border-border-subtle bg-bg-muted/30 p-3.5">
          <h3 id="unmapped-h" className="font-body text-[12.5px] font-semibold text-fg">
            {unmapped.length} synced contact{unmapped.length === 1 ? "" : "s"} not yet mapped
          </h3>
          <p className="mt-0.5 font-body text-[11.5px] text-fg-muted">
            From HubSpot. Promoting one creates a stakeholder record you can add role, influence and sentiment to — the contact itself is unchanged.
          </p>
          <ul className="mt-2.5 flex flex-wrap gap-1.5">
            {unmapped.slice(0, 12).map((c) => {
              const label = [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || "Unnamed contact";
              return (
                <li key={c.id}>
                  <button
                    onClick={() => setEditing({
                      profile: {
                        // Seeded, not saved — the drawer's Save is what persists it.
                        id: "", contactId: c.id, firstName: c.firstName, lastName: c.lastName,
                        preferredName: null, jobTitle: c.jobTitle, department: null, company: null,
                        location: null, photoUrl: null, email: c.email?.toLowerCase() ?? null,
                        phone: c.phone, mobile: null, linkedinUrl: null, preferredChannel: "unknown",
                        timezone: null, roles: [], influence: "unknown", decisionAuthority: "unknown",
                        sentiment: "unknown", relationshipStrength: "unknown", engagementStatus: "unknown",
                        ownerEmail: null, lastContactedAt: null, nextEngagementAt: null, notes: null, tags: [],
                        // Promoting a contact by hand is a manual record, not a backfilled one.
                        source: "manual", migration: null,
                        createdAt: new Date().toISOString(), createdBy: null,
                        updatedAt: new Date().toISOString(), updatedBy: null,
                      } as StakeholderProfile,
                    })}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg px-2.5 py-1 font-body text-[12px] text-fg-muted transition-colors hover:border-sirius hover:text-sirius">
                    <span dir="auto">{label}</span>
                    <ArrowUpRight size={11} aria-hidden />
                    <span className="sr-only">— promote to stakeholder</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {editing && (
        <StakeholderDrawer
          clientId={clientId}
          // id "" is the seeded-from-contact case: treat as new.
          stakeholder={editing.profile?.id ? editing.profile : editing.profile}
          canEdit={canEdit}
          teamEmails={teamEmails}
          onClose={() => setEditing(null)}
          onSaved={upsert}
          onDeleted={removed}
        />
      )}
    </div>
  );
}
