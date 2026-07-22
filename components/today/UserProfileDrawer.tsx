"use client";

/* Today page — lightweight operational user profile (not a social profile).
   Ownership, workload, renewals — the context needed to assign work. */

import { Mail, Briefcase } from "lucide-react";
import { getUserProfile } from "@/lib/today/repo";
import { formatMoney, formatDate } from "@/lib/today/format";
import { Drawer } from "./Drawer";
import { AccountRef } from "./refs";
import { mentionInitials } from "./mentions";
import { useToday } from "./TodayContext";

export function UserProfileDrawer({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { openAddTask } = useToday();
  const p = getUserProfile(userId);
  if (!p) return null;
  const { user } = p;

  return (
    <Drawer
      eyebrow="Team member"
      title={<span className="inline-flex items-center gap-2"><span className="grid size-7 place-items-center rounded-full bg-sirius text-[11px] font-bold text-white">{mentionInitials(user.name)}</span>{user.name}</span>}
      subtitle={[user.role, user.team].filter(Boolean).join(" · ")}
      onClose={onClose}
      width="md"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 font-body text-[12.5px] text-fg-muted">
          {user.role && <span className="inline-flex items-center gap-1.5"><Briefcase size={13} className="text-fg-subtle" /> {user.role}</span>}
          {user.email && <span className="inline-flex items-center gap-1.5"><Mail size={13} className="text-fg-subtle" /> {user.email}</span>}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Stat label="Portfolio ARR" value={formatMoney(p.portfolioArr)} />
          <Stat label="Open actions" value={String(p.openActions)} />
          <Stat label="Overdue" value={String(p.overdueActions)} tone={p.overdueActions > 0 ? "danger" : undefined} />
        </div>

        <Block title={`Accounts owned (${p.accounts.length})`}>
          {p.accounts.length === 0 ? <Muted>No accounts owned.</Muted> : (
            <ul className="flex flex-wrap gap-1.5">{p.accounts.map((a) => <li key={a.id} className="font-body text-[12px]"><AccountRef id={a.id} /></li>)}</ul>
          )}
        </Block>

        <Block title="Upcoming renewals">
          {p.renewals.length === 0 ? <Muted>No upcoming renewals.</Muted> : (
            <ul className="flex flex-col gap-1">{p.renewals.map((a) => (
              <li key={a.id} className="flex items-center justify-between font-body text-[12.5px]"><AccountRef id={a.id} /><span className="text-fg-subtle">{a.renewalDate ? formatDate(a.renewalDate) : ""}</span></li>
            ))}</ul>
          )}
        </Block>

        <button onClick={() => openAddTask(p.accounts[0] ? { accountId: p.accounts[0].id } : undefined)} className="rounded-lg border border-border px-3 py-2 font-body text-[13px] font-semibold text-fg-muted hover:border-sirius hover:text-sirius">
          Assign a task
        </button>
      </div>
    </Drawer>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-2.5">
      <div className={`font-display text-[17px] font-semibold ${tone === "danger" ? "text-danger-fg" : "text-fg"}`}>{value}</div>
      <div className="mt-0.5 font-body text-[11px] text-fg-muted">{label}</div>
    </div>
  );
}
function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><h3 className="mb-1.5 font-body text-[11.5px] font-semibold uppercase tracking-[0.04em] text-fg-subtle">{title}</h3>{children}</div>;
}
function Muted({ children }: { children: React.ReactNode }) { return <p className="font-body text-[12px] text-fg-subtle">{children}</p>; }
