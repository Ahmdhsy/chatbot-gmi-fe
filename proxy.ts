import { NextRequest, NextResponse } from "next/server";

// Browser-enforced framing policy for each registered website. The installation
// ID is public; the backend supplies the exact approved origin on each load.
export async function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const installationId = request.nextUrl.searchParams.get("widget");
  let allowedOrigins = (process.env.EMBED_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (installationId) {
    allowedOrigins = [];
    if (/^wgt_[a-f0-9]{32}$/.test(installationId)) {
      const apiBase = process.env.EMBED_POLICY_API_BASE ?? process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8001/v1";
      try {
        const result = await fetch(
          `${apiBase}/embed/installations/${installationId}/policy`,
          { cache: "no-store", signal: AbortSignal.timeout(3000) },
        );
        if (result.ok) {
          const data = await result.json();
          if (typeof data.origin === "string") allowedOrigins = [data.origin];
        }
      } catch {
        // Fail closed when the backend is unavailable.
      }
    }
  }
  response.headers.set(
    "Content-Security-Policy",
    `frame-ancestors ${allowedOrigins.length ? allowedOrigins.join(" ") : "'none'"}`,
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = { matcher: "/embed/:path*" };
