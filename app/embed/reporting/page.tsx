"use client";

/* Standalone chat for embedding on another site — no admin shell, no sidebar.
   Loaded inside an iframe by public/widget.js, or linked/iframed directly.

   A superadmin-issued reporting token arrives in the URL fragment, which is
   removed from the address bar after the page reads it. */

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
    const receiveToken = (event: MessageEvent) => {
      if (event.source !== window.parent || event.data?.type !== "reporting-widget-token") return;
      if (typeof event.data.token === "string") setToken(event.data.token);
    };
    window.addEventListener("message", receiveToken);
    return () => window.removeEventListener("message", receiveToken);
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
          <p className="text-sm font-medium text-red-500">Token widget belum dipasang</p>
          <p className="mt-1 text-sm text-[#8f8f8a]">
            Minta superadmin membuat token di Dashboard → Token Widget.
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
