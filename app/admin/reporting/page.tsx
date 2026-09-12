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
  const [includeChildren, setIncludeChildren] = useState(true);
  const [output, setOutput] = useState<OutputMode>("both");
  const [metric, setMetric] = useState("");
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
          setMetric(list[0].metrics[0]?.value ?? "");
        }
      })
      .catch(() => {
        if (active) setOptionsError("Gagal memuat daftar KPI. Coba muat ulang halaman.");
      });
    return () => { active = false; };
  }, []);

  // Switching table invalidates the metric picked from the previous catalog.
  useEffect(() => {
    if (table && !table.metrics.some((m) => m.value === metric)) {
      setMetric(table.metrics[0]?.value ?? "");
    }
  }, [table, metric]);

  const locationLabel = nop || region || area || "NATIONWIDE";

  const canRun =
    !!tableId &&
    !!metric &&
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
          includeChildren,
          output,
          metrics: metric,
          period: {
            mode: periodMode,
            date: periodMode === "daily" ? date : null,
            month: periodMode === "monthly" ? month : null,
          },
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.detail ?? "Laporan gagal dibuat.");
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
    setIncludeChildren(true); setOutput("both");
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

          <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-dark dark:text-[#ece7dc]">
            <input
              type="checkbox"
              checked={includeChildren}
              onChange={(e) => setIncludeChildren(e.target.checked)}
              className="size-4 accent-[#FE6C11]"
            />
            Tampilkan juga rincian level di bawahnya
          </label>

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
              <label className="text-xs font-semibold text-dark dark:text-[#ece7dc]">KPI</label>
              <select value={metric} onChange={(e) => setMetric(e.target.value)} className={SELECT_CLASS}>
                {!table?.metrics.length && <option value="">- Memuat -</option>}
                {table?.metrics.map((m) => (
                  <option key={m.value} value={m.value} className="dark:bg-[#232220]">
                    {m.label}
                  </option>
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
