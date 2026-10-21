"use client";

/* =========================================================================
   API keys (Settings → Integrations). Super-admin only — the page renders
   this section for super-admins, and every action re-checks isSuperAdmin()
   server-side (app/(app)/settings/api-key-actions.ts).

   A new key is shown once, here, and never again: only its hash is stored.
   ========================================================================= */

import { useState } from "react";
import { AlertTriangle, Check, Copy, KeyRound, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { createApiKeyAction, revokeApiKeyAction } from "@/app/(app)/settings/api-key-actions";
import type { ApiKeySummary } from "@/lib/api/store";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* Pinned to UTC so the server render and the browser agree. */
function utcDate(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function ApiKeysManager({
  databaseConfigured,
  initialKeys,
}: {
  databaseConfigured: boolean;
  initialKeys: ApiKeySummary[];
}) {
  const [keys, setKeys] = useState(initialKeys);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<{ name: string; key: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy("create");
    setError(null);
    setNewKey(null);
    setCopied(false);
    try {
      const res = await createApiKeyAction(name);
      if (!res.ok || !res.key) return setError(res.error ?? "Couldn't create the key.");
      setNewKey({ name: name.trim(), key: res.key });
      setKeys(res.keys ?? keys);
      setName("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function revoke(k: ApiKeySummary) {
    if (!window.confirm(`Revoke “${k.name}”? Anything using it stops working immediately. This can't be undone.`)) return;
    setBusy(k.id);
    setError(null);
    try {
      const res = await revokeApiKeyAction(k.id);
      if (!res.ok) return setError(res.error ?? "Couldn't revoke the key.");
      setKeys(res.keys ?? keys);
      if (newKey && newKey.key.startsWith(k.prefix)) setNewKey(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    if (!newKey) return;
    try {
      await navigator.clipboard.writeText(newKey.key);
      setCopied(true);
    } catch {
      setError("Couldn't copy. Select the key and copy it by hand.");
    }
  }

  const active = keys.filter((k) => !k.revokedAt);
  const revoked = keys.filter((k) => k.revokedAt);

  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="What is this key for? e.g. n8n renewals workflow"
          maxLength={80}
          disabled={!databaseConfigured}
          className="min-w-0 flex-1 rounded-[10px] border border-border bg-surface px-3 py-2 font-body text-[13px] text-fg placeholder:text-fg-muted focus:border-sirius focus:outline-none"
        />
        <button
          type="submit"
          disabled={!databaseConfigured || busy !== null || !name.trim()}
          className="inline-flex shrink-0 items-center gap-2 rounded-[10px] bg-sirius px-4 py-2 font-body text-[13px] font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {busy === "create" ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
          Create key
        </button>
      </form>

      {newKey && (
        <div className="mt-4 rounded-lg bg-success-bg px-3 py-3 font-body text-[12.5px] text-success-fg">
          <p className="font-semibold">Key for “{newKey.name}” created. Copy it now: it won't be shown again.</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 select-all break-all rounded-md bg-surface px-2 py-1.5 font-mono text-[12px] text-fg">
              {newKey.key}
            </code>
            <button
              type="button"
              onClick={copy}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 font-semibold text-fg hover:bg-surface-sunken"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-danger-bg px-3 py-2.5 font-body text-[12.5px] text-danger-fg">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-5">
        {active.length === 0 ? (
          <p className="caption">No active keys. Nothing can read Signal through the API.</p>
        ) : (
          <ul className="divide-y divide-border">
            {active.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 items-start gap-2.5">
                  <KeyRound size={15} className="mt-0.5 shrink-0 text-fg-muted" />
                  <div className="min-w-0">
                    <p className="font-body text-[13px] font-semibold text-fg">{k.name}</p>
                    <p className="caption mt-0.5">
                      <code className="font-mono">{k.prefix}…</code> · created {utcDate(k.createdAt)} by {k.createdByEmail} · last used{" "}
                      {utcDate(k.lastUsedAt)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => revoke(k)}
                  disabled={busy !== null}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-[10px] border border-border px-3 py-1.5 font-body text-[12.5px] font-semibold text-danger-fg transition-colors hover:bg-danger-bg disabled:opacity-50"
                >
                  {busy === k.id && <Loader2 size={13} className="animate-spin" />}
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
        {revoked.length > 0 && (
          <details className="mt-3">
            <summary className={cn("caption cursor-pointer")}>
              {revoked.length} revoked key{revoked.length === 1 ? "" : "s"}
            </summary>
            <ul className="mt-2 flex flex-col gap-1.5">
              {revoked.map((k) => (
                <li key={k.id} className="caption">
                  <span className="text-fg line-through">{k.name}</span> (<code className="font-mono">{k.prefix}…</code>) · revoked{" "}
                  {utcDate(k.revokedAt)} by {k.revokedByEmail ?? "unknown"}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}
