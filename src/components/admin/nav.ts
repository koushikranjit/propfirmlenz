import type { PermissionKey } from "@/lib/auth/permissions";
import { PERMISSIONS } from "@/lib/auth/permissions";

/**
 * Admin navigation — docs/ADMIN.md §2.1.
 *
 * Items are filtered by permission before render, AND every route
 * independently authorises on the server. Hiding a link is presentation, not
 * security (docs/ARCHITECTURE.md §6.2 rule 4).
 *
 * `implemented: false` marks navigation that exists so the shell is complete,
 * but whose feature genuinely does not exist yet. Those routes render an honest
 * "not implemented" state — never a fake form pretending to work
 * (docs/CLAUDE.md §3, §4).
 */

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  permission?: PermissionKey;
  implemented: boolean;
  phase?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Prop Firms",
    items: [
      {
        label: "Dashboard",
        href: "/admin",
        icon: "LayoutDashboard",
        implemented: true,
      },
      {
        label: "Prop Firms",
        href: "/admin/prop-firms",
        icon: "Building2",
        permission: PERMISSIONS.FIRM_READ,
        implemented: true,
      },
      {
        label: "Offers",
        href: "/admin/offers",
        icon: "Tag",
        permission: PERMISSIONS.OFFER_EDIT,
        implemented: false,
        phase: "a later Phase 1 stage",
      },
    ],
  },
  {
    label: "Management",
    items: [
      {
        label: "Reviews",
        href: "/admin/reviews",
        icon: "Star",
        implemented: false,
        phase: "Phase 3",
      },
      {
        label: "Payouts",
        href: "/admin/payouts",
        icon: "Banknote",
        permission: PERMISSIONS.FIRM_READ,
        implemented: true,
      },
      {
        label: "Affiliate Clicks",
        href: "/admin/affiliate-clicks",
        icon: "MousePointerClick",
        permission: PERMISSIONS.AFFILIATE_LINK_READ,
        implemented: false,
        phase: "a later Phase 1 stage",
      },
      {
        label: "Submissions",
        href: "/admin/submissions",
        icon: "Inbox",
        implemented: false,
        phase: "Phase 7",
      },
      {
        label: "Users",
        href: "/admin/users",
        icon: "Users",
        implemented: false,
        phase: "Phase 2",
      },
    ],
  },
  {
    label: "Content",
    items: [
      {
        label: "Articles",
        href: "/admin/articles",
        icon: "FileText",
        implemented: false,
        phase: "Phase 6",
      },
      {
        label: "FAQs",
        href: "/admin/faqs",
        icon: "MessageCircleQuestion",
        implemented: false,
        phase: "Phase 6",
      },
      {
        label: "Media",
        href: "/admin/media",
        icon: "Image",
        permission: PERMISSIONS.MEDIA_UPLOAD,
        implemented: false,
        phase: "a later Phase 1 stage",
      },
    ],
  },
  {
    label: "SEO",
    items: [
      {
        label: "SEO",
        href: "/admin/seo",
        icon: "Search",
        permission: PERMISSIONS.SEO_WRITE,
        implemented: false,
        phase: "a later Phase 1 stage",
      },
      {
        label: "Analytics",
        href: "/admin/analytics",
        icon: "ChartLine",
        implemented: false,
        phase: "Phase 8",
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        label: "Audit Logs",
        href: "/admin/audit-logs",
        icon: "ScrollText",
        permission: PERMISSIONS.AUDIT_LOG_READ,
        implemented: true,
      },
      {
        label: "Admin Users & Roles",
        href: "/admin/admins",
        icon: "ShieldCheck",
        permission: PERMISSIONS.ADMIN_USER_MANAGE,
        implemented: false,
        phase: "a later Phase 1 stage",
      },
      {
        label: "Settings",
        href: "/admin/settings",
        icon: "Settings",
        implemented: false,
        phase: "a later Phase 1 stage",
      },
    ],
  },
];

/** Filters navigation to what this admin may actually open. */
export function visibleGroups(permissions: Set<string>): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => !item.permission || permissions.has(item.permission),
    ),
  })).filter((group) => group.items.length > 0);
}

/** Looks up a nav item by exact href, for the "not implemented" pages. */
export function findNavItem(href: string): NavItem | undefined {
  return NAV_GROUPS.flatMap((g) => g.items).find((i) => i.href === href);
}
