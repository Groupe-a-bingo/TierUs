import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["sharp", "pg", "pg-boss", "rate-limiter-flexible"],
  experimental: {
    serverActions: {
      // Avatar upload goes through a route handler; actions only carry small payloads.
      bodySizeLimit: "1mb",
      // public hostnames allowed to call server actions (e.g. Cloudflare tunnel)
      allowedOrigins: (process.env.EXTRA_ORIGINS ?? "")
        .split(",")
        .map((s) => s.trim().replace(/^https?:\/\//, ""))
        .filter(Boolean),
    },
  },
};

export default nextConfig;
