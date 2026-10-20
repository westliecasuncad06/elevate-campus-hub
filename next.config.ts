import type { NextConfig } from "next";

// Sent with every response. The Content-Security-Policy is separate: it carries a fresh nonce per request, so the proxy adds it.
const SECURITY_HEADERS = [
  // Browsers only ever talk to this site over https (for two years once they have seen this).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // Don't guess a file's type: a file is only ever treated as the type it was sent as.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Nobody can put this site inside another page (clickjacking). The CSP says the same for newer browsers.
  { key: "X-Frame-Options", value: "DENY" },
  // Other sites only learn which site you came from, never the page or its address details.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The QR scanner needs the camera on this site; nothing else here needs sensors or payments.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

// Every page here depends on the signed-in user's session (cookies), so the app is fully dynamic.
// Cache Components / partial prefetching would only add Suspense requirements without caching anything useful.
const nextConfig: NextConfig = {
  // Don't announce "X-Powered-By: Next.js" to everyone scanning for the framework.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
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
