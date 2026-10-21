import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  allowedDevOrigins: ["*.trycloudflare.com"],
  experimental: { serverActions: { allowedOrigins: ["*.trycloudflare.com"] } },
};

export default config;