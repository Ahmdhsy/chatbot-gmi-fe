import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle (.next/standalone) so the production
  // Docker image is small and doesn't need the full node_modules tree.
  output: "standalone",

  // Don't leak the framework version in the response header.
  poweredByHeader: false,

  // Baseline security headers on every frontend response. (Caddy also sets HSTS
  // etc. at the edge; these keep the app safe even if served directly.)
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
