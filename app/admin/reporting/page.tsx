"use client";

/* Form-driven reporting - same report output as the chat, without the LLM.
   The form IS the query plan: location + KPI + period go straight to
   POST /reporting/run, which runs the deterministic pivot pipeline. */

import React, { useEffect, useMemo, useState } from "react";
import Breadcrumb from "@/components/Breadcrumbs/Breadcrumb";
import { apiFetch } from "@/app/lib/api";
import { LocationHierarchy } from "@/app/lib/locationHierarchy";
import { LocationDropdowns, SELECT_CLASS } from "@/components/location-dropdowns";
import { Chart, MarkdownMessage } from "@/components/report-render";
import type { ChartData } from "@/components/report-render";

interface MetricOption {
  /** "set:key_driver" or a metric base like "payload_all" */
  value: string;
  label: string;
}

interface TableOption {
  tableId: string;
  tableName: string;
  metrics: MetricOption[];
  /** Available data window, used to bound the date/month inputs. */
  minDate?: string | null;
  maxDate?: string | null;
}

interface ReportResponse {
  markdown: string;
  charts?: Record<string, unknown>[] | null;
  generatedAt?: string;
}

type PeriodMode = "latest" | "daily" | "monthly";
type OutputMode = "both" | "table" | "chart";
type Coverage = "self" | "children" | "with_nation";

const COVERAGE_LABELS: Record<Coverage, string> = {
  self: "Lokasi ini saja",
  children: "+ rincian level di bawahnya",
  with_nation: "+ rincian & pembanding NATIONWIDE",
};

const OUTPUT_LABELS: Record<OutputMode, string> = {
  both: "Tabel + Grafik",
  table: "Tabel saja",
  chart: "Grafik saja",
};

const PERIOD_LABELS: Record<PeriodMode, string> = {
  latest: "Data terakhir tersedia",
  daily: "Tanggal tertentu",
  monthly: "Bulan tertentu (MTD)",
};

/** A readable message out of an error body.
 *
 * `detail` is a plain string for the errors this endpoint raises itself, but
 * FastAPI's own request validation returns a LIST of {loc, msg, type, input}
 * objects — putting that straight into state crashes the page ("Objects are not
 * valid as a React child"). Never trust the shape, always end up with a string.
 */
function errorText(body: unknown, fallback: string): string {
  const detail = (body as { detail?: unknown } | null | undefined)?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) =>
        item && typeof item === "object" && "msg" in item
          ? String((item as { msg: unknown }).msg)
          : ""
      )
      .filter(Boolean);
    if (messages.length) return messages.join("; ");
  }
  return fallback;
}

const BTN_PRIMARY =
  "flex items-center justify-center gap-2 rounded-lg bg-[#FE6C11] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#e05b0a] disabled:cursor-not-allowed disabled:opacity-50";

export default function ReportingPage() {
  const [hierarchy, setHierarchy] = useState<LocationHierarchy | null>(null);
  const [tables, setTables] = useState<TableOption[]>([]);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  const [tableId, setTableId] = useState("");
  const [area, setArea] = useState("");
  const [region, setRegion] = useState("");
  const [nop, setNop] = useState("");
  const [coverage, setCoverage] = useState<Coverage>("children");
  const [output, setOutput] = useState<OutputMode>("both");
  const [metrics, setMetrics] = useState<string[]>([]);
  const [periodMode, setPeriodMode] = useState<PeriodMode>("latest");
  const [date, setDate] = useState("");
  const [month, setMonth] = useState("");

  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const table = useMemo(
    () => tables.find((t) => t.tableId === tableId) ?? null,
    [tables, tableId]
  );

  useEffect(() => {
    let active = true;
    apiFetch("/auth/location-hierarchy")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (active && data) setHierarchy(data); })
      .catch(() => { /* dropdowns stay empty; nationwide report still works */ });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    apiFetch("/reporting/options")
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((data: { tables: TableOption[] }) => {
        if (!active) return;
        const list = data.tables ?? [];
        setTables(list);
        if (list.length) {
          setTableId(list[0].tableId);
          const first = list[0].metrics[0]?.value;
          setMetrics(first ? [first] : []);
        }
      })
      .catch(() => {
        if (active) setOptionsError("Gagal memuat daftar KPI. Coba muat ulang halaman.");
      });
    return () => { active = false; };
  }, []);

  // Switching table invalidates KPIs picked from the previous catalog.
  useEffect(() => {
    if (!table) return;
    const known = new Set(table.metrics.map((m) => m.value));
    setMetrics((prev) => {
      const kept = prev.filter((m) => known.has(m));
      if (kept.length === prev.length) return prev;  // no change → keep identity
      return kept.length ? kept : [table.metrics[0]?.value].filter(Boolean) as string[];
    });
  }, [table]);

  const toggleMetric = (value: string) =>
    setMetrics((prev) =>
      prev.includes(value) ? prev.filter((m) => m !== value) : [...prev, value]
    );

  const locationPicked = !!(nop || region || area);
  const locationLabel = locationPicked ? nop || region || area : "NATIONWIDE";

  const canRun =
    !!tableId &&
    metrics.length > 0 &&
    !running &&
    (periodMode !== "daily" || !!date) &&
    (periodMode !== "monthly" || !!month);

  const run = async () => {
    setRunning(true);
    setError(null);
    setReport(null);
    try {
      const res = await apiFetch("/reporting/run", {
        method: "POST",
        body: JSON.stringify({
          tableId,
          area: area || null,
          region: region || null,
          nop: nop || null,
          coverage,
          output,
          metrics,
          period: {
            mode: periodMode,
            date: periodMode === "daily" ? date : null,
            month: periodMode === "monthly" ? month : null,
          },
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(errorText(body, "Laporan gagal dibuat."));
        return;
      }
      if (!body?.markdown?.trim() && !body?.charts?.length) {
        setError("Tidak ada data untuk kombinasi lokasi & periode ini.");
        return;
      }
      setReport(body);
    } catch {
      setError("Terjadi kesalahan jaringan.");
    } finally {
      setRunning(false);
    }
  };

  const reset = () => {
    setArea(""); setRegion(""); setNop("");
    setPeriodMode("latest"); setDate(""); setMonth("");
    setCoverage("children"); setOutput("both");
    setReport(null); setError(null);
  };

  const charts = (report?.charts ?? []) as unknown as ChartData[];

  return (
    <>
      <Breadcrumb pageName="Reporting" />

      <div className="rounded-[10px] border border-stroke bg-white p-4 shadow-1 dark:border-dark-3 dark:bg-gray-dark dark:shadow-card sm:p-7.5">
        <div className="mb-6">
          <h3 className="text-xl font-semibold text-dark dark:text-white">Buat Laporan KPI</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-[#8f8f8a]">
            Pilih lokasi, KPI, dan periodenya - tabel yang keluar sama persis dengan
            laporan di chat, tanpa perlu mengetik pertanyaan.
          </p>
        </div>

        {optionsError && (
          <div className="mb-5 rounded-lg bg-red-500/10 p-3 text-sm font-medium text-red-500 dark:bg-red-500/5">
            {optionsError}
          </div>
        )}

        <div className="flex flex-col gap-5">
          <LocationDropdowns
            hierarchy={hierarchy}
            area={area}
            region={region}
            nop={nop}
            onAreaChange={(v) => { setArea(v); setRegion(""); setNop(""); }}
            onRegionChange={(v) => { setRegion(v); setNop(""); }}
            onNopChange={setNop}
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-dark dark:text-[#ece7dc]">
              KPI{" "}
              <span className="font-normal text-gray-500 dark:text-[#8f8f8a]">
                (boleh pilih lebih dari satu — {metrics.length} dipilih)
              </span>
            </label>
            <div className="grid max-h-52 grid-cols-1 gap-x-6 gap-y-2 overflow-y-auto rounded-lg border border-stroke p-3 dark:border-dark-3 sm:grid-cols-3">
              {!table?.metrics.length && (
                <span className="text-sm text-gray-500 dark:text-[#8f8f8a]">Memuat…</span>
              )}
              {table?.metrics.map((m) => (
                <label
                  key={m.value}
                  className="flex cursor-pointer items-center gap-2 text-sm text-dark dark:text-[#ece7dc]"
                >
                  <input
                    type="checkbox"
                    checked={metrics.includes(m.value)}
                    onChange={() => toggleMetric(m.value)}
                    className="size-4 shrink-0 accent-[#FE6C11]"
                  />
                  {/* A set is a bundle of KPIs, not one of them — mark it so the
                      two never read as the same kind of choice. */}
                  <span className={m.value.startsWith("set:") ? "font-semibold" : ""}>
                    {m.label}
                    {m.value.startsWith("set:") && " (paket)"}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {tables.length > 1 && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-dark dark:text-[#ece7dc]">Sumber Data</label>
                <select value={tableId} onChange={(e) => setTableId(e.target.value)} className={SELECT_CLASS}>
                  {tables.map((t) => (
                    <option key={t.tableId} value={t.tableId} className="dark:bg-[#232220]">
                      {t.tableName}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-dark dark:text-[#ece7dc]">Cakupan</label>
              <select
                value={coverage}
                onChange={(e) => setCoverage(e.target.value as Coverage)}
                disabled={!locationPicked}
                className={SELECT_CLASS}
              >
                {(Object.keys(COVERAGE_LABELS) as Coverage[]).map((c) => (
                  <option key={c} value={c} className="dark:bg-[#232220]">{COVERAGE_LABELS[c]}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-dark dark:text-[#ece7dc]">Periode</label>
              <select
                value={periodMode}
                onChange={(e) => setPeriodMode(e.target.value as PeriodMode)}
                className={SELECT_CLASS}
              >
                {(Object.keys(PERIOD_LABELS) as PeriodMode[]).map((m) => (
                  <option key={m} value={m} className="dark:bg-[#232220]">{PERIOD_LABELS[m]}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-dark dark:text-[#ece7dc]">Tampilan</label>
              <select
                value={output}
                onChange={(e) => setOutput(e.target.value as OutputMode)}
                className={SELECT_CLASS}
              >
                {(Object.keys(OUTPUT_LABELS) as OutputMode[]).map((o) => (
                  <option key={o} value={o} className="dark:bg-[#232220]">{OUTPUT_LABELS[o]}</option>
                ))}
              </select>
            </div>

            {periodMode !== "latest" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-dark dark:text-[#ece7dc]">
                  {periodMode === "daily" ? "Tanggal" : "Bulan"}
                </label>
                {periodMode === "daily" ? (
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    min={table?.minDate ?? undefined}
                    max={table?.maxDate ?? undefined}
                    className={SELECT_CLASS}
                  />
                ) : (
                  <input
                    type="month"
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                    min={table?.minDate?.slice(0, 7) ?? undefined}
                    max={table?.maxDate?.slice(0, 7) ?? undefined}
                    className={SELECT_CLASS}
                  />
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button onClick={run} disabled={!canRun} className={BTN_PRIMARY}>
              {running && (
                <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              )}
              {running ? "Menyusun laporan..." : "Buat Laporan"}
            </button>
            <button
              onClick={reset}
              className="rounded-lg border border-stroke px-5 py-2.5 text-sm font-medium text-dark transition-colors hover:bg-gray-2 dark:border-dark-3 dark:text-white dark:hover:bg-dark-2"
            >
              Reset
            </button>
            <span className="text-sm text-gray-500 dark:text-[#8f8f8a]">
              Lokasi: <b className="text-dark dark:text-white">{locationLabel}</b>
              {!locationPicked && " — tanpa lokasi, laporan keluar sebagai overview nasional + area + region"}
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-6 rounded-lg bg-red-500/10 p-4 text-sm font-medium text-red-500 dark:bg-red-500/5">
          {error}
        </div>
      )}

      {report && (
        <div className="mt-6 rounded-[10px] border border-[#3c3c3c] bg-[#1e1e1e] p-5 shadow-1">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[#343434] pb-3">
            <h4 className="text-base font-semibold text-[#ece7db]">
              Laporan {locationLabel}
            </h4>
            {report.generatedAt && (
              <span className="text-xs text-[#8f8f8a]">
                dibuat {new Date(report.generatedAt).toLocaleString("id-ID")}
              </span>
            )}
          </div>
          <div className="text-[#d8d2c4]">
            {!!report.markdown?.trim() && <MarkdownMessage content={report.markdown} />}
            {charts.map((c, idx) => <Chart key={idx} chart={c} />)}
          </div>
        </div>
      )}
    </>
  );
}
