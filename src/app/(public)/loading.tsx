/**
 * Streaming fallback for public routes.
 *
 * A static skeleton, not a spinner. Public pages are server-rendered and their
 * content arrives in the HTML; this only covers the moment the server is still
 * assembling it. A spinner would add motion that conveys nothing, and it would
 * animate for users who asked not to see animation (docs/DESIGN.md §9).
 *
 * `aria-hidden` because the shapes carry no information — the live region below
 * is what a screen reader announces.
 */
export default function PublicLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <p role="status" className="sr-only">
        Loading page content
      </p>

      <div aria-hidden className="flex flex-col gap-4">
        <div className="h-10 w-2/3 rounded-[10px] bg-bg-card" />
        <div className="h-4 w-full max-w-2xl rounded bg-bg-card" />
        <div className="h-4 w-5/6 max-w-2xl rounded bg-bg-card" />

        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <div
              key={index}
              className="h-40 rounded-[14px] border border-border-default bg-bg-card"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
