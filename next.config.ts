import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle (.next/standalone) so the production
  // Docker image is small and doesn't need the full node_modules tree.
  output: "standalone",

  // Don't leak the framework version in the response header.
  poweredByHeader: false,

  // Dev in Docker on a Windows host: the host-to-VM file-sharing layer drops
  // filesystem events, so Fast Refresh never fires and edits only appear after
  // a container restart. Polling is Next's documented last resort for exactly
  // this case — it costs CPU/IO, so keep it to dev only.
  // ponytail: drop this the moment dev stops running through a bind mount
  // (running `npm run dev` on the host, or Docker Desktop synchronized file
  // shares, both restore native events without the polling cost).
  ...(process.env.NODE_ENV === "development"
    ? { watchOptions: { pollIntervalMs: 1000 } }
    : {}),

  // Baseline security headers on every frontend response. (Caddy also sets HSTS
  // etc. at the edge; these keep the app safe even if served directly.)
  async headers() {
    // Sites allowed to iframe the /embed pages, comma-separated, e.g.
    // "https://portal.example.co.id,https://intranet.example.co.id".
    // Empty (the default) means nobody may embed — an origin must be named
    // deliberately, never inherited from a wildcard.
    const embedders = (process.env.EMBED_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);

    const baseHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
    ];

    return [
      {
        // The /embed pages are the ONLY ones meant to live in someone else's
        // frame. X-Frame-Options has no allow-list, so they use CSP
        // frame-ancestors instead; it is what modern browsers honour anyway.
        source: "/embed/:path*",
        headers: [
          ...baseHeaders,
          {
            key: "Content-Security-Policy",
            value: `frame-ancestors ${embedders.length ? embedders.join(" ") : "'none'"}`,
          },
        ],
      },
      {
        // Everything else stays un-framable, clickjacking included. The
        // negative lookahead matters: Next applies EVERY matching rule, so a
        // plain "/:path*" here would put X-Frame-Options: DENY back on the
        // embed pages and override their frame-ancestors allow-list.
        source: "/((?!embed/).*)",
        headers: [...baseHeaders, { key: "X-Frame-Options", value: "DENY" }],
      },
    ];
  },
};

export default nextConfig;
