import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { canonicalUrl, SITE_ORIGIN } from "@/lib/seo/canonical";
import { BRAND, OG_IMAGE, SITE_DESCRIPTION, SITE_NAME } from "@/lib/seo/site";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  alternates: { canonical: canonicalUrl("/") },
  /**
   * The browser-tab and home-screen mark. There was none before this — every
   * page rendered with whatever blank icon the browser defaults to.
   *
   * `icons` is not set by `buildMetadata`, so the root value applies to every
   * page in the app.
   */
  icons: {
    icon: [
      { url: BRAND.icon32, sizes: "32x32", type: "image/png" },
      { url: BRAND.icon192, sizes: "192x192", type: "image/png" },
      { url: BRAND.icon512, sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: BRAND.appleIcon, sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: canonicalUrl("/"),
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE],
  },
  twitter: { card: "summary_large_image", images: [OG_IMAGE.url] },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
