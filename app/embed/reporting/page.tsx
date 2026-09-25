"use client";

/* Standalone chat for embedding on another site — no admin shell, no sidebar.
   Loaded inside an iframe by public/widget.js, or linked/iframed directly.

   The token arrives in the URL FRAGMENT (#token=...), never the query string:
   a fragment is not sent to the server, so it stays out of access logs and
   Referer headers. It is short-lived and only opens the reporting endpoints
   (see backend app/api/embed.py). */

import { useEffect, useState } from "react";
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

  if (!token) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <div className="rounded-lg bg-red-500/10 p-4 text-sm font-medium text-red-500">
          Token tidak ada atau sudah kedaluwarsa. Muat ulang halaman induknya.
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-2 p-4 dark:bg-[#1a1a19]">
      <ReportingChat token={token} />
    </main>
  );
}
