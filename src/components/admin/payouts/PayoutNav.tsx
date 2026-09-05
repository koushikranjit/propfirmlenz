import Link from "next/link";

/**
 * Sub-navigation for Payout Tracking — docs/PAYOUTS.md §11.
 *
 * Payout tracking is one system with several operational surfaces, so they
 * share a nav rather than each being a top-level sidebar entry. Reviews, media
 * and the audit log stay where they are.
 */
const SECTIONS: { href: string; label: string }[] = [
  { href: "/admin/payouts", label: "Dashboard" },
  { href: "/admin/payouts/wallets", label: "Wallets" },
  { href: "/admin/payouts/candidates", label: "Candidates" },
  { href: "/admin/payouts/verified", label: "Verified Payouts" },
  { href: "/admin/payouts/networks", label: "Networks" },
  { href: "/admin/payouts/providers", label: "Providers" },
  { href: "/payouts/methodology", label: "Methodology" },
];

export function PayoutNav({ current }: { current: string }) {
  return (
    <nav aria-label="Payout tracking" className="mt-4">
      {/* Scrolls rather than wraps: a nav that reflows to three rows is worse
          than one that slides. */}
      <ul className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {SECTIONS.map((section) => {
          const active = section.href === current;
          return (
            <li key={section.href}>
              <Link
                href={section.href}
                aria-current={active ? "page" : undefined}
                className={
                  "inline-flex shrink-0 whitespace-nowrap rounded-[10px] border px-3.5 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base " +
                  (active
                    ? "border-brand-cyan/50 bg-bg-elevated text-brand-cyan"
                    : "border-transparent text-text-secondary hover:bg-bg-elevated hover:text-text-primary")
                }
              >
                {section.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
