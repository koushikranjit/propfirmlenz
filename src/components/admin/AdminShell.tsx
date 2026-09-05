"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Icons from "lucide-react";
import type { LucideProps } from "lucide-react";
import { cx } from "@/components/ui/primitives";
import type { NavGroup } from "./nav";

/**
 * Admin shell — docs/ADMIN.md §2, docs/DESIGN.md §15.
 *
 * Desktop: persistent sidebar. Tablet/mobile: an off-canvas drawer, because a
 * squeezed sidebar is worse than none (docs/ADMIN.md §2.1).
 *
 * Accessibility: the drawer traps nothing the user cannot escape, the current
 * page is marked `aria-current`, and every control is keyboard-operable with a
 * visible focus ring (docs/DESIGN.md §8).
 */

const ICONS = Icons as unknown as Record<
  string,
  React.ComponentType<LucideProps> | undefined
>;

function Icon({ name, className }: { name: string; className?: string }) {
  const Cmp = ICONS[name];
  if (!Cmp) return null;
  return <Cmp className={className} aria-hidden />;
}

function NavLinks({
  groups,
  pathname,
  onNavigate,
}: {
  groups: NavGroup[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Admin sections" className="flex flex-col gap-6 px-3 py-4">
      {groups.map((group) => (
        <div key={group.label}>
          <h2 className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-widest text-text-metadata">
            {group.label}
          </h2>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active =
                item.href === "/admin"
                  ? pathname === "/admin"
                  : pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    // Spread conditionally: exactOptionalPropertyTypes forbids
                    // passing an explicit undefined for an optional prop.
                    {...(onNavigate ? { onClick: onNavigate } : {})}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-sm transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan",
                      "focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base",
                      active
                        ? // Active state uses cyan; the gradient is reserved for
                          // the logo and primary CTAs (docs/DESIGN.md §2.2).
                          "bg-bg-elevated text-brand-cyan"
                        : "text-text-secondary hover:bg-bg-elevated hover:text-text-primary",
                    )}
                  >
                    <Icon name={item.icon} className="size-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                    {!item.implemented ? (
                      <span className="ml-auto text-[10px] font-medium uppercase tracking-wide text-text-metadata">
                        Soon
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AdminShell({
  groups,
  adminName,
  adminEmail,
  logout,
  children,
}: {
  groups: NavGroup[];
  adminName: string;
  adminEmail: string;
  logout: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  // The drawer closes via each link's onNavigate handler rather than an effect
  // keyed on pathname: setState inside an effect causes a cascading render.

  return (
    <div className="min-h-screen bg-bg-base">
      {/* Skip link — first focusable element (docs/DESIGN.md §13). */}
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-[10px] focus:bg-bg-elevated focus:px-4 focus:py-2 focus:text-sm focus:text-text-primary focus:ring-2 focus:ring-brand-cyan"
      >
        Skip to main content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border-default bg-bg-card lg:flex">
        <div className="flex h-20 items-center border-b border-border-default px-4">
          <Link
            href="/admin"
            className="flex items-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
          >
            {/* The OFFICIAL logo, scaled only (docs/DESIGN.md §3 `[LOCKED]`).
                The lockup's own black margin eats about a third of the box, so
                a 28px logo left a 17px wordmark — this is the same mark at a
                size someone can actually read. */}
            <Image
              src="/brand/logo-576.png"
              alt="Prop Firm Lenz"
              width={576}
              height={288}
              priority
              className="h-12 w-auto"
            />
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto">
          <NavLinks groups={groups} pathname={pathname} />
        </div>
        <div className="border-t border-border-default p-3">
          <p className="truncate text-sm font-medium text-text-primary">
            {adminName}
          </p>
          <p className="truncate text-xs text-text-metadata">{adminEmail}</p>
          <div className="mt-2">{logout}</div>
        </div>
      </aside>

      {/* Mobile drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-bg-base/80 backdrop-blur-sm"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Admin navigation"
            className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-border-default bg-bg-card"
          >
            <div className="flex h-20 items-center justify-between border-b border-border-default px-4">
              <Image
                src="/brand/logo-576.png"
                alt="Prop Firm Lenz"
                width={576}
                height={288}
                className="h-12 w-auto"
              />
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close navigation"
                className="rounded p-1 text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
              >
                <Icons.X className="size-5" aria-hidden />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <NavLinks
                groups={groups}
                pathname={pathname}
                onNavigate={() => setDrawerOpen(false)}
              />
            </div>
            <div className="border-t border-border-default p-3">
              <p className="truncate text-sm font-medium text-text-primary">
                {adminName}
              </p>
              <p className="truncate text-xs text-text-metadata">
                {adminEmail}
              </p>
              <div className="mt-2">{logout}</div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Top bar */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border-default bg-bg-card/90 px-4 backdrop-blur lg:pl-[17rem]">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open navigation"
          aria-expanded={drawerOpen}
          className="rounded p-2 text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan lg:hidden"
        >
          <Icons.Menu className="size-5" aria-hidden />
        </button>

        {/* Below `lg` the sidebar is hidden, so without this the admin carried
            no mark at all until the drawer was opened. The icon, not the
            lockup — the bar has no room for a wordmark beside the search. */}
        <Link
          href="/admin"
          className="shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan lg:hidden"
        >
          <Image
            src="/brand/icon-192.png"
            alt="Prop Firm Lenz"
            width={192}
            height={192}
            className="size-9"
          />
        </Link>

        <form action="/admin/prop-firms" className="min-w-0 flex-1 max-w-md">
          <label htmlFor="admin-global-search" className="sr-only">
            Search prop firms
          </label>
          <div className="relative">
            <Icons.Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-metadata"
              aria-hidden
            />
            <input
              id="admin-global-search"
              name="search"
              type="search"
              placeholder="Search prop firms…"
              className="w-full rounded-[10px] border border-border-default bg-bg-near-black py-1.5 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-metadata focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
            />
          </div>
        </form>

        <div className="ml-auto hidden items-center gap-3 sm:flex">
          <span className="text-sm text-text-secondary">{adminName}</span>
          {logout}
        </div>
      </header>

      <main id="admin-main" className="px-4 py-6 lg:pl-[17rem] lg:pr-6">
        <div className="mx-auto max-w-[1280px]">{children}</div>
      </main>
    </div>
  );
}
