import type * as React from "react";

/**
 * A firm-profile section — docs/DESIGN.md §7.
 *
 * Every section is a landmark with a real heading and a stable anchor id, so
 * the in-page navigation, deep links, and the accessibility tree all agree.
 */
export function Section({
  id,
  title,
  description,
  actions,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const headingId = `${id}-heading`;

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className="scroll-mt-24 border-t border-border-subtle pt-8"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2
          id={headingId}
          className="text-lg font-semibold text-text-primary sm:text-xl"
        >
          {title}
        </h2>
        {actions}
      </div>
      {description ? (
        <p className="mt-1 text-sm text-text-muted">{description}</p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/**
 * An honest "nothing published here yet" state.
 *
 * A missing value is a real answer and is stated as one. It is never filled
 * with a zero, a dash, or an estimate (CLAUDE.md §3 `[LOCKED]`).
 */
export function NoData({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-[10px] border border-dashed border-border-default px-4 py-6 text-sm text-text-muted">
      {children}
    </p>
  );
}
