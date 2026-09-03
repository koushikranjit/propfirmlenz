import Link from "next/link";

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * Admin breadcrumbs — docs/ADMIN.md §2.2.
 *
 * No JSON-LD here: the admin surface is noindex, so breadcrumb structured data
 * would be pointless and is deliberately omitted (docs/SEO.md §9).
 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex flex-wrap items-center gap-1.5 text-xs text-text-metadata">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li
              key={`${item.label}-${i}`}
              className="flex items-center gap-1.5"
            >
              {item.href && !last ? (
                <Link
                  href={item.href}
                  className="rounded hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className={last ? "text-text-secondary" : undefined}
                  aria-current={last ? "page" : undefined}
                >
                  {item.label}
                </span>
              )}
              {!last ? <span aria-hidden>/</span> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
