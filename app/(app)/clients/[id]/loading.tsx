/* Instant skeleton shown the moment a company profile is opened, while its
   server render (client lookup + deals/contacts/emails/meetings/actions reads)
   streams in. Two things this fixes about "navigating between companies is
   slow": (1) without a loading boundary the router keeps the PREVIOUS page
   frozen on screen until the whole render finishes — now the skeleton appears
   immediately; (2) Next.js only prefetches a dynamic route up to its nearest
   loading boundary, so before this file existed these pages weren't prefetched
   at all and every click was fully cold. Kept purely presentational (no data,
   no client JS) so it renders instantly. Padding/gaps mirror page.tsx to avoid
   a layout jump when the real content swaps in. */

const pulse = "animate-pulse bg-bg-muted";

export default function ClientProfileLoading() {
  return (
    <div className="flex flex-col gap-6 p-8">
      {/* "All clients" back link */}
      <div className={`h-4 w-24 rounded ${pulse}`} />

      {/* Header card — identity + metrics + owners */}
      <div className="flex flex-col gap-6 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-3">
            <div className={`h-7 w-64 rounded-lg ${pulse}`} />
            <div className="flex gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className={`h-4 w-20 rounded ${pulse}`} />
              ))}
            </div>
          </div>
          <div className={`h-8 w-28 rounded-lg ${pulse}`} />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={`h-16 rounded-xl ${pulse}`} />
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          <div className={`h-10 w-48 rounded-xl ${pulse}`} />
          <div className={`h-10 w-48 rounded-xl ${pulse}`} />
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={`h-8 w-24 rounded-lg ${pulse}`} />
        ))}
      </div>

      {/* Tab content */}
      <div className="flex flex-col gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={`h-28 rounded-xl ${pulse}`} />
        ))}
      </div>
    </div>
  );
}
