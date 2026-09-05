import type * as React from "react";
import Link from "next/link";

/**
 * A homepage section — one landmark, one `h2`, one optional trailing link.
 *
 * The heading hierarchy is fixed by construction: the hero owns the single
 * `h1`, every section here is an `h2`, and cards inside them are `h3`. That is
 * what keeps the outline readable to a screen reader and to a crawler
 * (CLAUDE.md §7).
 */
export function HomeSection({
  id,
  title,
  description,
  link,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  /** Descriptive anchor text only — never "click here" (docs/SEO.md §12). */
  link?: { href: string; label: string };
  children: React.ReactNode;
}) {
  const headingId = `${id}-heading`;

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className="scroll-mt-20 border-b border-border-subtle bg-bg-base"
    >
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <h2
              id={headingId}
              className="text-2xl font-semibold text-text-primary sm:text-3xl"
            >
              {title}
            </h2>
            {description ? (
              <p className="mt-2 text-text-muted">{description}</p>
            ) : null}
          </div>

          {link ? (
            <Link
              href={link.href}
              className="rounded-[10px] border border-border-default bg-bg-elevated px-4 py-2 text-sm font-medium text-text-primary hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
            >
              {link.label}
            </Link>
          ) : null}
        </div>

        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}
