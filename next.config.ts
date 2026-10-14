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
      ],
    };
  },
};

export default nextConfig;
