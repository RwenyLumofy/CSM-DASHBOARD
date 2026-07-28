"use client";

/* Add / edit one stakeholder.

   A focused drawer rather than inline editing on the row: a stakeholder has
   ~25 meaningful fields, and making them all live-editable in a table turns
   every accidental click into a mutation. Explicit open → change → Save, with
   an unsaved-changes guard on close.

   Field order follows how a CSM learns about a person — who they are, how to
   reach them, then what they mean to the deal — rather than grouping by data
   type. Only the relationship block is expanded by default, because that is
   the part that is never populated by any sync and is the entire reason this
   record exists. */

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Trash2, AlertTriangle, ChevronDown } from "lucide-react";
import { Drawer } from "@/components/today/Drawer";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/cn";
import {
  STAKEHOLDER_ROLES, ROLE_LABEL, INFLUENCE_LEVELS, INFLUENCE_LABEL,
  DECISION_AUTHORITY, AUTHORITY_LABEL, SENTIMENTS, SENTIMENT_LABEL,
  RELATIONSHIP_STRENGTHS, STRENGTH_LABEL, ENGAGEMENT_STATUSES, ENGAGEMENT_LABEL,
  COMMUNICATION_CHANNELS, CHANNEL_LABEL, stakeholderInitials, stakeholderName,
  type StakeholderProfile, type StakeholderRole,
} from "@/lib/stakeholders/profile";
import { saveStakeholderAction, deleteStakeholderAction, type StakeholderInput } from "@/app/(app)/clients/[id]/stakeholder-actions";

const inputCls =
  "w-full rounded-[10px] border border-border bg-bg px-3 py-2 font-body text-[13px] text-fg outline-none transition-colors placeholder:text-fg-subtle focus:border-sirius focus:ring-2 focus:ring-sirius/15 disabled:opacity-50";

function Field({ label, htmlFor, error, hint, children }: {
  label: string; htmlFor?: string; error?: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="flex flex-col gap-1.5">
      <span className="font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">{label}</span>
      {children}
      {/* role="alert" so a validation failure is announced, not just coloured. */}
      {error && <span role="alert" className="font-body text-[11.5px] text-[#B23A57]">{error}</span>}
      {!error && hint && <span className="font-body text-[11.5px] text-fg-subtle">{hint}</span>}
    </label>
  );
}

function Group({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-t border-border-subtle pt-4">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left">
        <span className="font-body text-[12px] font-semibold uppercase tracking-[0.06em] text-fg-muted">{title}</span>
        <ChevronDown size={14} className={cn("shrink-0 text-fg-subtle transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>}
    </section>
  );
}

function Select({ id, value, onChange, options, labels }: {
  id?: string; value: string; onChange: (v: string) => void;
  options: readonly string[]; labels: Record<string, string>;
}) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      {options.map((o) => <option key={o} value={o}>{labels[o] ?? o}</option>)}
    </select>
  );
}

type Draft = Required<Omit<StakeholderInput, "id" | "contactId" | "roles" | "tags">> & {
  roles: StakeholderRole[]; tags: string[];
};

function toDraft(p: StakeholderProfile | null): Draft {
  return {
    firstName: p?.firstName ?? "", lastName: p?.lastName ?? "", preferredName: p?.preferredName ?? "",
    jobTitle: p?.jobTitle ?? "", department: p?.department ?? "", company: p?.company ?? "",
    location: p?.location ?? "", photoUrl: p?.photoUrl ?? "",
    email: p?.email ?? "", phone: p?.phone ?? "", mobile: p?.mobile ?? "", linkedinUrl: p?.linkedinUrl ?? "",
    preferredChannel: p?.preferredChannel ?? "unknown", timezone: p?.timezone ?? "",
    roles: p?.roles ?? [], influence: p?.influence ?? "unknown",
    decisionAuthority: p?.decisionAuthority ?? "unknown", sentiment: p?.sentiment ?? "unknown",
    relationshipStrength: p?.relationshipStrength ?? "unknown", engagementStatus: p?.engagementStatus ?? "unknown",
    ownerEmail: p?.ownerEmail ?? "", lastContactedAt: p?.lastContactedAt ?? "",
    nextEngagementAt: p?.nextEngagementAt ?? "", notes: p?.notes ?? "", tags: p?.tags ?? [],
  };
}

export function StakeholderDrawer({ clientId, stakeholder, canEdit, teamEmails, onClose, onSaved, onDeleted }: {
  clientId: string;
  /** null = creating a new one. */
  stakeholder: StakeholderProfile | null;
  canEdit: boolean;
  teamEmails: { email: string; name: string | null }[];
  onClose: () => void;
  onSaved: (p: StakeholderProfile) => void;
  onDeleted: (id: string) => void;
}) {
  const initial = useMemo(() => toDraft(stakeholder), [stakeholder]);
  const [draft, setDraft] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(initial), [draft, initial]);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  useEffect(() => { firstFieldRef.current?.focus(); }, []);

  function requestClose() {
    if (dirty && !window.confirm("Discard your unsaved changes to this stakeholder?")) return;
    onClose();
  }

  async function save() {
    setBusy(true); setError(null); setFieldErrors({});
    const r = await saveStakeholderAction(clientId, { id: stakeholder?.id, contactId: stakeholder?.contactId ?? null, ...draft });
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "Couldn't save."); setFieldErrors(r.fieldErrors ?? {}); return; }
    if (r.profile) onSaved(r.profile);
  }

  async function remove() {
    if (!stakeholder) return;
    setBusy(true); setError(null);
    const r = await deleteStakeholderAction(clientId, stakeholder.id);
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "Couldn't remove."); return; }
    onDeleted(stakeholder.id);
  }

  const displayName = stakeholder ? stakeholderName(stakeholder) : "New stakeholder";
  const toggleRole = (role: StakeholderRole) =>
    set("roles", draft.roles.includes(role) ? draft.roles.filter((r) => r !== role) : [...draft.roles, role]);

  return (
    <Drawer
      onClose={requestClose}
      width="lg"
      eyebrow={stakeholder ? "Stakeholder" : "Add stakeholder"}
      title={
        <span className="flex min-w-0 items-center gap-2.5">
          <Avatar initials={stakeholder ? stakeholderInitials(stakeholder) : "+"} size={28} />
          {/* dir="auto" so an Arabic name renders right-to-left without
              dragging the surrounding Latin chrome with it. */}
          <span dir="auto" className="min-w-0 truncate">{displayName}</span>
        </span>
      }
      footer={
        canEdit ? (
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={save} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sirius px-3.5 py-2 font-body text-[13px] font-semibold text-white transition-opacity disabled:opacity-50">
              {busy && <Loader2 size={13} className="animate-spin" />}
              {stakeholder ? "Save changes" : "Add stakeholder"}
            </button>
            <button onClick={requestClose} disabled={busy}
              className="rounded-lg border border-border px-3.5 py-2 font-body text-[13px] font-medium text-fg-muted transition-colors hover:text-fg">
              Cancel
            </button>
            {stakeholder && (
              <button onClick={() => setConfirmDelete(true)} disabled={busy}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 font-body text-[12.5px] font-medium text-[#B23A57] transition-colors hover:border-[#B23A57]">
                <Trash2 size={13} /> Remove
              </button>
            )}
          </div>
        ) : (
          <p className="font-body text-[12.5px] text-fg-subtle">You have read-only access to this account.</p>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-[#B23A57]/30 bg-[#B23A57]/5 px-3 py-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-[#B23A57]" />
            <span className="font-body text-[12.5px] text-[#B23A57]">{error}</span>
          </div>
        )}

        {/* Destructive confirmation states exactly what is and isn't removed —
            "remove" meaning two different things is how people delete the
            wrong record. */}
        {confirmDelete && stakeholder && (
          <div role="alertdialog" aria-labelledby="sh-del-title"
            className="rounded-lg border border-[#B23A57]/30 bg-[#B23A57]/5 p-3">
            <p id="sh-del-title" className="font-body text-[13px] font-semibold text-fg">Remove {displayName} from this account?</p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 font-body text-[12px] text-fg-muted">
              <li>Their relationship record and every link to other stakeholders will be deleted.</li>
              <li>Their coverage contribution (roles, sentiment, influence) is lost.</li>
              <li>
                {stakeholder.contactId
                  ? "The synced HubSpot contact is NOT deleted — it stays in Communication and will return on the next sync."
                  : "This stakeholder is not linked to a HubSpot contact, so nothing else references them."}
              </li>
            </ul>
            <div className="mt-2.5 flex items-center gap-2">
              <button onClick={remove} disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#B23A57] px-3 py-1.5 font-body text-[12.5px] font-semibold text-white disabled:opacity-50">
                {busy && <Loader2 size={12} className="animate-spin" />} Remove
              </button>
              <button onClick={() => setConfirmDelete(false)}
                className="rounded-lg border border-border px-3 py-1.5 font-body text-[12.5px] font-medium text-fg-muted hover:text-fg">
                Keep
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="First name" htmlFor="sh-first" error={fieldErrors.firstName}>
            <input ref={firstFieldRef} id="sh-first" dir="auto" className={inputCls} value={draft.firstName}
              onChange={(e) => set("firstName", e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Last name" htmlFor="sh-last">
            <input id="sh-last" dir="auto" className={inputCls} value={draft.lastName}
              onChange={(e) => set("lastName", e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Job title" htmlFor="sh-title">
            <input id="sh-title" dir="auto" className={inputCls} value={draft.jobTitle}
              onChange={(e) => set("jobTitle", e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Email" htmlFor="sh-email" error={fieldErrors.email}
            hint="Used to detect duplicates on this account.">
            <input id="sh-email" type="email" className={inputCls} value={draft.email}
              onChange={(e) => set("email", e.target.value)} disabled={!canEdit} />
          </Field>
        </div>

        {/* Roles first among the relationship fields: everything else is a
            judgement about a person whose part in the account is known. */}
        <fieldset className="border-t border-border-subtle pt-4">
          <legend className="font-body text-[12px] font-semibold uppercase tracking-[0.06em] text-fg-muted">
            Role in the account
          </legend>
          <p className="mt-1 font-body text-[11.5px] text-fg-subtle">Pick every role that applies — most people hold more than one.</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {STAKEHOLDER_ROLES.map((role) => {
              const on = draft.roles.includes(role);
              return (
                <button key={role} type="button" onClick={() => toggleRole(role)} disabled={!canEdit}
                  aria-pressed={on}
                  className={cn(
                    "rounded-full border px-2.5 py-1 font-body text-[12px] font-medium transition-colors disabled:opacity-50",
                    on ? "border-sirius bg-accent-soft text-sirius" : "border-border text-fg-muted hover:border-sirius hover:text-sirius",
                  )}>
                  {ROLE_LABEL[role]}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="grid grid-cols-1 gap-3 border-t border-border-subtle pt-4 sm:grid-cols-2">
          <Field label="Sentiment" htmlFor="sh-sent" hint="'Not assessed' is honest — it is not the same as neutral.">
            <Select id="sh-sent" value={draft.sentiment} onChange={(v) => set("sentiment", v)} options={SENTIMENTS} labels={SENTIMENT_LABEL} />
          </Field>
          <Field label="Influence" htmlFor="sh-inf">
            <Select id="sh-inf" value={draft.influence} onChange={(v) => set("influence", v)} options={INFLUENCE_LEVELS} labels={INFLUENCE_LABEL} />
          </Field>
          <Field label="Decision authority" htmlFor="sh-auth">
            <Select id="sh-auth" value={draft.decisionAuthority} onChange={(v) => set("decisionAuthority", v)} options={DECISION_AUTHORITY} labels={AUTHORITY_LABEL} />
          </Field>
          <Field label="Relationship strength" htmlFor="sh-str">
            <Select id="sh-str" value={draft.relationshipStrength} onChange={(v) => set("relationshipStrength", v)} options={RELATIONSHIP_STRENGTHS} labels={STRENGTH_LABEL} />
          </Field>
          <Field label="Engagement" htmlFor="sh-eng">
            <Select id="sh-eng" value={draft.engagementStatus} onChange={(v) => set("engagementStatus", v)} options={ENGAGEMENT_STATUSES} labels={ENGAGEMENT_LABEL} />
          </Field>
          <Field label="Lumofy owner" htmlFor="sh-owner" hint="Who keeps this relationship warm.">
            <select id="sh-owner" className={inputCls} value={draft.ownerEmail}
              onChange={(e) => set("ownerEmail", e.target.value)} disabled={!canEdit}>
              <option value="">Unassigned</option>
              {teamEmails.map((m) => <option key={m.email} value={m.email}>{m.name ?? m.email}</option>)}
            </select>
          </Field>
          <Field label="Last contacted" htmlFor="sh-last-c" error={fieldErrors.lastContactedAt}
            hint="Drives the champion-gone-quiet warning.">
            <input id="sh-last-c" type="date" className={inputCls} value={draft.lastContactedAt}
              onChange={(e) => set("lastContactedAt", e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Next planned engagement" htmlFor="sh-next" error={fieldErrors.nextEngagementAt}>
            <input id="sh-next" type="date" className={inputCls} value={draft.nextEngagementAt}
              onChange={(e) => set("nextEngagementAt", e.target.value)} disabled={!canEdit} />
          </Field>
        </div>

        <Group title="Contact details">
          <Field label="Phone" htmlFor="sh-phone">
            <input id="sh-phone" className={inputCls} value={draft.phone} onChange={(e) => set("phone", e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Mobile" htmlFor="sh-mob">
            <input id="sh-mob" className={inputCls} value={draft.mobile} onChange={(e) => set("mobile", e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="LinkedIn" htmlFor="sh-li" error={fieldErrors.linkedinUrl}>
            <input id="sh-li" className={inputCls} placeholder="https://linkedin.com/in/…" value={draft.linkedinUrl}
              onChange={(e) => set("linkedinUrl", e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Preferred channel" htmlFor="sh-chan">
            <Select id="sh-chan" value={draft.preferredChannel} onChange={(v) => set("preferredChannel", v)} options={COMMUNICATION_CHANNELS} labels={CHANNEL_LABEL} />
          </Field>
          <Field label="Time zone" htmlFor="sh-tz">
            <input id="sh-tz" className={inputCls} placeholder="Asia/Bahrain" value={draft.timezone}
              onChange={(e) => set("timezone", e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Location" htmlFor="sh-loc">
            <input id="sh-loc" dir="auto" className={inputCls} value={draft.location} onChange={(e) => set("location", e.target.value)} disabled={!canEdit} />
          </Field>
        </Group>

        <Group title="Organisation">
          <Field label="Preferred name" htmlFor="sh-pref" hint="What they actually go by.">
            <input id="sh-pref" dir="auto" className={inputCls} value={draft.preferredName}
              onChange={(e) => set("preferredName", e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Department" htmlFor="sh-dept">
            <input id="sh-dept" dir="auto" className={inputCls} value={draft.department}
              onChange={(e) => set("department", e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Company" htmlFor="sh-co" hint="Only when it isn't this account — partners, resellers.">
            <input id="sh-co" dir="auto" className={inputCls} value={draft.company}
              onChange={(e) => set("company", e.target.value)} disabled={!canEdit} />
          </Field>
        </Group>

        <section className="border-t border-border-subtle pt-4">
          <Field label="Notes" htmlFor="sh-notes">
            <textarea id="sh-notes" dir="auto" rows={4} className={cn(inputCls, "resize-y")} value={draft.notes}
              onChange={(e) => set("notes", e.target.value)} disabled={!canEdit} />
          </Field>
        </section>

        {stakeholder && (
          <p className="border-t border-border-subtle pt-3 font-body text-[11.5px] text-fg-subtle">
            Last updated {new Date(stakeholder.updatedAt).toLocaleDateString()}
            {stakeholder.updatedBy ? ` by ${stakeholder.updatedBy}` : ""}
            {stakeholder.contactId && " · linked to a synced HubSpot contact"}
          </p>
        )}
      </div>
    </Drawer>
  );
}
