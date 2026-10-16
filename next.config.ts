import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/",
          destination: "/clone.html",
        },
        {
          source: "/clone",
          destination: "/clone.html",
        },
        {
          source: "/home",
          destination: "/clone.html",
        },
        {
          source: "/challenges",
          destination: "/clone.html",
        },
        {
          source: "/best-sellers",
          destination: "/clone.html",
        },
        {
          source: "/comparisons",
          destination: "/clone.html",
        },
        {
          source: "/compare",
          destination: "/clone.html",
        },
        {
          source: "/spreads",
          destination: "/clone.html",
        },
        {
          source: "/reviews",
          destination: "/clone.html",
        },
        {
          source: "/favorites",
          destination: "/clone.html",
        },
        {
          source: "/payouts",
          destination: "/clone.html",
        },
        {
          source: "/offers",
          destination: "/clone.html",
        },
        {
          source: "/widgets",
          destination: "/clone.html",
        },
        {
          source: "/partner-badges",
          destination: "/clone.html",
        },
        {
          source: "/firm/:slug*",
          destination: "/clone.html",
        },
      ],
    };
  },
};

export default nextConfig;
