"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/app/lib/api";

interface KpiItem {
  metric: string;
  variant: string;
  label: string;
  value: string;
  unit: string;
  period: string;
}

interface Summary {
  location: string;
  items: KpiItem[];
  generatedAt: string;
}

function periodLabel(value: string): string {
  const monthly = /^(\d{4})-?(\d{2})$/.exec(value);
  if (monthly) {
    const date = new Date(Number(monthly[1]), Number(monthly[2]) - 1, 1);
    return date.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
  }
  return value || "terbaru";
}

export default function WidgetKpiSummary({ token, active = true }: { token: string; active?: boolean }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [streamError, setStreamError] = useState("");
  const requestRef = useRef<AbortController | null>(null);
  const pendingRefreshRef = useRef(false);

  const load = useCallback(async () => {
    if (requestRef.current) {
      pendingRefreshRef.current = true;
      return;
    }
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch("/reporting/widget-summary", {
        headers: { Authorization: `Bearer ${token}` },
        skipRedirectOn401: true,
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(typeof body?.detail === "string" ? body.detail : "Gagal mengambil rangkuman KPI.");
      }
      setSummary(await response.json() as Summary);
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : "Tidak bisa menghubungi server.");
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setLoading(false);
        if (pendingRefreshRef.current && !controller.signal.aborted) {
          pendingRefreshRef.current = false;
          void load();
        }
      }
    }
  }, [token]);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    let reconnectTimer: number | undefined;
    setStreamError("");
    void load();

    const connect = async () => {
      try {
        const response = await apiFetch("/reporting/widget-summary/events", {
          headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
          skipRedirectOn401: true,
          cache: "no-store",
          signal: controller.signal,
        });
        if ([401, 403, 424, 501].includes(response.status)) {
          const body = await response.json().catch(() => null);
          setStreamError(typeof body?.detail === "string" ? body.detail : "Update otomatis tidak tersedia.");
          return;
        }
        if (!response.ok || !response.body) throw new Error("SSE tidak tersedia");
        setStreamError("");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!controller.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
          let boundary = buffer.indexOf("\n\n");
          while (boundary !== -1) {
            const message = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            if (/^event: (ready|refresh)$/m.test(message)) void load();
            boundary = buffer.indexOf("\n\n");
          }
        }
      } catch {
        // Reconnect after a DB or network restart.
      }
      if (!controller.signal.aborted) reconnectTimer = window.setTimeout(() => void connect(), 3000);
    };
    void connect();
    return () => {
      controller.abort();
      window.clearTimeout(reconnectTimer);
      requestRef.current?.abort();
      requestRef.current = null;
      pendingRefreshRef.current = false;
    };
  }, [active, load, token]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-gray-dark">
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-dark-3 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-white">Rangkuman KPI</h2>
          <p className="truncate text-xs text-[#8f8f8a]">
            {summary ? `${summary.location} · otomatis saat data berubah` : "Data dari database sumber"}
          </p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading}
          className="rounded-lg border border-dark-3 px-2.5 py-1 text-xs text-[#ece7dc] hover:border-primary disabled:opacity-50">
          Perbarui
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {loading && !summary && <p className="text-sm text-[#8f8f8a]">Memuat KPI...</p>}
        {error && <div role="alert" className="mb-3 rounded-lg bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}
        {streamError && <div role="alert" className="mb-3 rounded-lg bg-red-500/10 p-3 text-sm text-red-400">{streamError}</div>}
        {summary && summary.items.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-1 xl:grid-cols-2">
            {summary.items.map((item) => (
              <article key={`${item.metric}:${item.variant}`} className="min-w-0 rounded-xl border border-dark-3 bg-dark-2 p-4">
                <p className="truncate text-xs font-medium text-[#bdb6aa]" title={item.label}>{item.label}</p>
                <p className="mt-2 break-all text-xl font-semibold tabular-nums text-white">
                  {item.value}<span className="ml-1 text-xs font-medium text-[#8f8f8a]">{item.unit}</span>
                </p>
                <p className="mt-2 text-xs text-[#8f8f8a]">{item.variant === "raw" ? "Tanggal" : "Periode"} {periodLabel(item.period)}</p>
              </article>
            ))}
          </div>
        )}
        {summary && summary.items.length === 0 && !loading && (
          <p className="text-sm text-[#8f8f8a]">Belum ada data KPI untuk lokasi ini.</p>
        )}
      </div>
    </div>
  );
}
