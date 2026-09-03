import type { MetadataRoute } from "next";
import { canonicalUrl } from "@/lib/seo/canonical";

/**
 * docs/SEO.md §14. Preview and staging serve `Disallow: /` unconditionally —
 * no preview deployment may ever be indexable.
 */
export default function robots(): MetadataRoute.Robots {
  const isProduction = process.env.VERCEL_ENV === "production";

  if (!isProduction) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api", "/go/"],
      },
    ],
    sitemap: canonicalUrl("/sitemap.xml"),
  };
}
