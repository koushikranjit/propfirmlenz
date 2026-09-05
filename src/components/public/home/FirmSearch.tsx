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
    <section
      aria-labelledby="find-a-firm"
      className="border-b border-border-subtle bg-bg-near-black"
    >
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <h2
          id="find-a-firm"
          className="text-lg font-semibold text-text-primary"
        >
          Find a prop firm
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          Search by name, then filter the directory by platform, headquarters or
          verification status.
        </p>

        <form
          method="get"
          action="/prop-firms"
          role="search"
          className="mt-4 flex flex-col gap-3 sm:flex-row"
        >
          <div className="min-w-0 flex-1">
            <label htmlFor="home-firm-search" className="sr-only">
              Search prop firms by name
            </label>
            <input
              id="home-firm-search"
              name="q"
              type="search"
              autoComplete="off"
              placeholder="Search prop firms by name"
              className="h-12 w-full rounded-[10px] border border-border-default bg-bg-card px-4 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
            />
          </div>
          <button
            type="submit"
            className="inline-flex h-12 shrink-0 items-center justify-center rounded-[10px] border border-border-default bg-bg-elevated px-6 text-sm font-semibold text-text-primary hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
          >
            Search firms
          </button>
        </form>
      </div>
    </section>
  );
}
