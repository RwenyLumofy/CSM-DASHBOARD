/* Instant skeleton for the clients list. Because the list is force-dynamic and
   re-materializes ARR/completeness across every client + deal, going "back" to
   it used to block on a full re-render. This loading boundary lets the router
   swap in a skeleton immediately (and lets Next prefetch the list up to here).
   Layout mirrors app/(app)/clients/page.tsx + the ClientsTable toolbar so there
   is no jump when the table swaps in. */

const pulse = "animate-pulse bg-bg-muted";

export default function ClientsLoading() {
  return (
    <div className="flex flex-col gap-6 p-8">
      {/* Toolbar: total-clients / total-ARR stats + search */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-6">
          <div className={`h-12 w-32 rounded-xl ${pulse}`} />
          <div className={`h-12 w-32 rounded-xl ${pulse}`} />
        </div>
        <div className={`h-10 w-64 rounded-xl ${pulse}`} />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="h-11 border-b border-border bg-bg-muted/60" />
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-b-0">
            <div className={`h-4 w-44 rounded ${pulse}`} />
            <div className={`h-4 w-24 rounded ${pulse}`} />
            <div className={`h-4 w-16 rounded ${pulse}`} />
            <div className={`ml-auto h-4 w-20 rounded ${pulse}`} />
          </div>
        ))}
      </div>
    </div>
  );
}
