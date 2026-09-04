/**
 * Admin breadcrumbs — docs/ADMIN.md §2.2.
 *
 * The trail itself is the shared `components/ui/Breadcrumbs`; there is one
 * implementation, not an admin copy. No JSON-LD is emitted here: the admin
 * surface is noindex, so breadcrumb structured data would be pointless
 * (docs/SEO.md §9).
 */
export { Breadcrumbs, type Crumb } from "@/components/ui/Breadcrumbs";
