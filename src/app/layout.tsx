import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { canonicalUrl, SITE_ORIGIN } from "@/lib/seo/canonical";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/seo/site";
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
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: canonicalUrl("/"),
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  twitter: { card: "summary_large_image" },
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
