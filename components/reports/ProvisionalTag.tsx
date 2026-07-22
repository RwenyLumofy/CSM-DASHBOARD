/* A subtle "provisional" marker for any ARR figure that inherits the ledger
   drift. It is NOT a repeat of the reconciliation warning (that lives once, in
   the page banner) — just a quiet flag that this number sits on unreconciled
   sources, with the explanation in a hover/focus tooltip.

   CSS-only tooltip (group-hover + focus-within) so it stays a server component
   and opens without a mouse — the dot is focusable. */
export function ProvisionalTag() {
  return (
    <span className="group/prov relative inline-flex align-middle">
      <button
        type="button"
        aria-label="Provisional figure — ARR sources are unreconciled"
        className="ml-1 inline-flex size-3.5 items-center justify-center rounded-full bg-warning-bg text-[8px] font-bold leading-none text-warning-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-warning-fg/40"
      >
        !
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-[calc(100%+6px)] z-50 w-[min(80vw,220px)] -translate-x-1/2 rounded-lg border border-border bg-surface p-2.5 font-body text-[11px] font-normal normal-case leading-relaxed tracking-normal text-fg-muted opacity-0 shadow-lg transition-opacity duration-[140ms] group-hover/prov:opacity-100 group-focus-within/prov:opacity-100"
      >
        Provisional — this figure draws on ARR sources that don’t yet reconcile. See the data-quality banner above.
      </span>
    </span>
  );
}
