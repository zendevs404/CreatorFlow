import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // Conservative CSP: blocks framing, plugins and <base> hijacking without needing script nonces.
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
];

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Lets the dev server be opened through a Cloudflare quick tunnel (needed to test Meta OAuth).
  // Without these, Next.js blocks dev assets and rejects Server Actions whose Origin differs from the Host.
  allowedDevOrigins: ["*.trycloudflare.com"],
  experimental: { serverActions: { allowedOrigins: ["*.trycloudflare.com"] } },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default config;
