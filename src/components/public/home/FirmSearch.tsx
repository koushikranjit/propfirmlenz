/**
 * The discovery entry point — docs/SEO.md §12.
 *
 * A plain GET form that submits to the EXISTING directory route. There is no
 * second search implementation on the homepage: the directory already owns
 * name search, filtering, sorting and pagination, and duplicating it here
 * would create two behaviours to keep in step (CLAUDE.md §2).
 *
 * No JavaScript is involved, so the flow works for every visitor and every
 * crawler, and each search lands on a real, linkable `/prop-firms?q=` URL.
 * This is also the search that the homepage's `SearchAction` markup declares —
 * the two must stay together.
 */
export function FirmSearch() {
  return (
    <section aria-labelledby="find-a-firm" className="border-b border-border-subtle bg-bg-near-black">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="rounded-[16px] border border-border-default bg-bg-card p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-cyan">Directory search</p>
              <h2 id="find-a-firm" className="mt-1 text-xl font-semibold text-text-primary">Find a prop firm by name</h2>
            </div>
            <p className="max-w-md text-sm leading-relaxed text-text-muted">Search the published directory, then filter by platform, headquarters, or verification status.</p>
          </div>
          <form method="get" action="/prop-firms" role="search" className="mt-5 flex flex-col gap-3 sm:flex-row">
            <div className="min-w-0 flex-1">
              <label htmlFor="home-firm-search" className="sr-only">Search prop firms by name</label>
              <input id="home-firm-search" name="q" type="search" autoComplete="off" placeholder="Try “FundingPips” or “Alpha”" className="h-12 w-full rounded-[10px] border border-border-default bg-bg-near-black px-4 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base" />
            </div>
            <button type="submit" className="inline-flex h-12 shrink-0 items-center justify-center rounded-[10px] bg-[image:var(--gradient-brand)] px-6 text-sm font-semibold text-bg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base">Search directory</button>
          </form>
        </div>
      </div>
    </section>
  );
}
