import Link from "next/link";

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * The shared breadcrumb trail. One implementation, used by both the admin
 * shell and the public site — the public route additionally derives its
 * `BreadcrumbList` JSON-LD from the SAME item list, so the visible trail and
 * the structured data cannot drift (docs/SEO.md §11 rule 5 `[LOCKED]`).
 *
 * `--text-muted` rather than `--text-metadata`: metadata grey only clears AA on
 * `--bg-base`, and breadcrumbs also sit on cards (docs/DESIGN.md §2.5).
 */
export function Breadcrumbs({
  items,
  className,
}: {
  items: Crumb[];
  className?: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className={className ?? "mb-4"}>
      <ol className="flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
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
