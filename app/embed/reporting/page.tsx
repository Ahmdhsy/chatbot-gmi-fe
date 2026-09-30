"use client";

/* Standalone chat for embedding on another site — no admin shell, no sidebar.
   Loaded inside an iframe by public/widget.js, or linked/iframed directly.

   The token arrives in the URL FRAGMENT (#token=...), never the query string:
   a fragment is not sent to the server, so it stays out of access logs and
   Referer headers. It is short-lived and only opens the reporting endpoints
   (see backend app/api/embed.py). */

import { useEffect, useState } from "react";
import { ThemeProvider } from "next-themes";
import ReportingChat from "@/components/reporting-chat";

function tokenFromHash(): string {
  if (typeof window === "undefined") return "";
  const hash = window.location.hash.replace(/^#/, "");
  return new URLSearchParams(hash).get("token") ?? "";
}

export default function EmbedReportingPage() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const t = tokenFromHash();
    // Drop the token from the address bar once read, so it is not left sitting
    // in a shared screen or copied link.
    if (t) window.history.replaceState(null, "", window.location.pathname);
    setToken(t);
  }, []);

  if (token === null) return null; // belum sempat membaca hash

  // Same forced-dark theme as the rest of the app (see app/admin/providers.tsx).
  // The report tables are styled dark on purpose; a light embed page put a black
  // table inside a white panel.
  const shell = (body: React.ReactNode) => (
    <ThemeProvider forcedTheme="dark" attribute="class">
      {body}
    </ThemeProvider>
  );

  if (!token) {
    return shell(
      <main className="grid h-dvh place-items-center bg-gray-dark p-6">
        <div className="max-w-xs text-center">
          <p className="text-sm font-medium text-red-500">Sesi kedaluwarsa</p>
          <p className="mt-1 text-sm text-[#8f8f8a]">
            Muat ulang halaman induknya untuk mulai lagi.
          </p>
        </div>
      </main>,
    );
  }

  return shell(
    // h-dvh + min-h-0: the panel is a fixed-height box, so the conversation
    // must be the part that scrolls — not the whole document.
    <div className="flex h-dvh min-h-0 flex-col bg-gray-dark">
      <header className="flex shrink-0 items-center gap-2.5 border-b border-dark-3 px-4 py-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary text-[13px] font-bold text-white">
          SR
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight text-white">
            Smart Interactive Reporting
          </p>
          <p className="truncate text-[11px] leading-tight text-[#8f8f8a]">
            Sebut lokasi, KPI, dan periodenya
          </p>
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <ReportingChat token={token} compact />
      </div>
    </div>,
  );
}
