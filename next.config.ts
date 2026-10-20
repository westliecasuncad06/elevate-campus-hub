import type { NextConfig } from "next";

// Every page here depends on the signed-in user's session (cookies), so the app is fully dynamic.
// Cache Components / partial prefetching would only add Suspense requirements without caching anything useful.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
