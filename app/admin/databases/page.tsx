"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Breadcrumb from "@/components/Breadcrumbs/Breadcrumb";
import { apiFetch } from "@/app/lib/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import dayjs from "dayjs";

// ── Types (mirror backend response models in app/api/databases.py) ──────────

interface ConnectionType {
  connectionId: string;
  name: string;
  dbType: string;
  host: string;
  port: number;
  databaseName: string;
  schemaName: string | null;
  connectionType: string;
  status: string;
  isReadOnly: boolean;
  createdAt: string;
  lastTestedAt: string | null;
  testStatus: string | null;
  testError: string | null;
}

interface TableMeta {
  tableName: string;
  schemaName: string | null;
  rowCount: number;
  isView: boolean;
  columns: { name: string; type?: string }[];
}

interface JobInfo {
  jobId: string;
  label: string;
  status: "queued" | "running" | "succeeded" | "failed" | string;
  detail?: string;
}

interface MetricInfo {
  base: string;
  description: string;
  aliases: string[];
  sets: string[];
  variantCount: number;
  autoDiscovered: boolean;
  overridden: boolean;
}

/** A business term naming a group of KPIs, e.g. "key driver". */
interface MetricSet {
  name: string;
  label: string;
  aliases: string[];
  members: string[];
}

interface TableMetrics {
  tableId: string;
  tableName: string;
  metrics: MetricInfo[];
  sets: MetricSet[];
}

/** Editable fields of one metric row (aliases as comma-separated text). */
interface MetricDraft {
  description: string;
  aliases: string;
}

/** Editable fields of one metric set. */
interface SetDraft {
  aliases: string;
  members: string[];
}

const toDraft = (m: MetricInfo): MetricDraft => ({
  description: m.description,
  aliases: m.aliases.join(", "),
});

const toSetDraft = (s: MetricSet): SetDraft => ({
  aliases: s.aliases.join(", "),
  members: [...s.members],
});

const parseCsv = (text: string) =>
  text.split(",").map((s) => s.trim()).filter(Boolean);

const DB_TYPE_OPTIONS = ["postgresql", "mysql", "sqlserver", "oracle"];

const INGESTION_MODES = [
  {
    value: "metadata_only",
    label: "Metadata Only (recommended)",
    hint: "Hanya schema + catalog; data di-query live saat chatbot butuh.",
  },
  {
    value: "full",
    label: "Full",
    hint: "Salin seluruh isi tabel ke sistem (berat untuk tabel besar).",
  },
  {
    value: "incremental",
    label: "Incremental",
    hint: "Tambahkan baris baru sejak ingestion terakhir.",
  },
];

const EMPTY_CONN_FORM = {
  name: "",
  dbType: "postgresql",
  host: "",
  port: "5432",
  databaseName: "",
  username: "",
  password: "",
  schemaName: "",
};

const JOB_POLL_INTERVAL_MS = 3000;

// ── Small presentational helpers ─────────────────────────────────────────────

const inputClass =
  "w-full rounded-lg border border-stroke bg-transparent px-4 py-2 text-sm text-dark outline-none dark:border-dark-3 dark:bg-dark-2 dark:text-white focus:border-primary dark:focus:border-primary transition-colors";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-dark dark:text-[#ece7dc]">
        {label}
      </label>
      {children}
    </div>
  );
}

function ModalShell({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-9999 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        className={cn(
          "relative w-full rounded-[14px] border border-stroke bg-white p-6 shadow-1 dark:border-dark-3 dark:bg-[#232220] dark:shadow-card animate-slideIn",
          wide ? "max-w-[640px]" : "max-w-[480px]",
        )}
      >
        <div className="flex items-center justify-between border-b border-stroke pb-4 dark:border-dark-3">
          <h3 className="text-lg font-bold text-dark dark:text-white">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-dark dark:text-[#8f8f8a] dark:hover:text-white transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
      <style>{`@keyframes slideIn { from { opacity:0; transform:translateY(-20px) } to { opacity:1; transform:translateY(0) } } .animate-slideIn { animation: slideIn 0.2s ease-out forwards; }`}</style>
    </div>
  );
}

function StatusPill({
  tone,
  children,
}: {
  tone: "green" | "red" | "yellow" | "gray";
  children: React.ReactNode;
}) {
  const tones = {
    green: "bg-[#219653]/[0.08] text-[#219653]",
    red: "bg-[#D34053]/[0.08] text-[#D34053]",
    yellow: "bg-[#FFA70B]/[0.08] text-[#FFA70B]",
    gray: "bg-gray-500/[0.08] text-gray-500",
  };
  return (
    <span className={cn("max-w-fit rounded-full px-3.5 py-1 text-sm font-medium", tones[tone])}>
      {children}
    </span>
  );
}

function jobTone(status: string): "green" | "red" | "yellow" {
  if (status === "succeeded") return "green";
  if (status === "failed") return "red";
  return "yellow";
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ManageDatabasesPage() {
  const [connections, setConnections] = useState<ConnectionType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // One active job per connection (ingestion or catalog sync)
  const [jobs, setJobs] = useState<Record<string, JobInfo>>({});
  const pollTimers = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  // Connection test feedback per connection
  const [testing, setTesting] = useState<Record<string, boolean>>({});

  // Add-connection modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [connForm, setConnForm] = useState({ ...EMPTY_CONN_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Ingest modal
  const [ingestConn, setIngestConn] = useState<ConnectionType | null>(null);
  const [tables, setTables] = useState<TableMeta[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [tablesError, setTablesError] = useState<string | null>(null);
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());
  const [ingestMode, setIngestMode] = useState("metadata_only");

  // Delete modal
  const [connToDelete, setConnToDelete] = useState<ConnectionType | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Manage Metrics modal
  const [metricsConn, setMetricsConn] = useState<ConnectionType | null>(null);
  const [metricTables, setMetricTables] = useState<TableMetrics[]>([]);
  const [metricsTableId, setMetricsTableId] = useState("");
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [metricDrafts, setMetricDrafts] = useState<Record<string, MetricDraft>>({});
  const [metricSaving, setMetricSaving] = useState<Record<string, boolean>>({});
  const [metricSaved, setMetricSaved] = useState<Record<string, boolean>>({});
  // Metric set editor (inside the same modal)
  const [setDrafts, setSetDrafts] = useState<Record<string, SetDraft>>({});
  const [newSetName, setNewSetName] = useState("");
  const [setSaving, setSetSaving] = useState<Record<string, boolean>>({});
  const [expandedSet, setExpandedSet] = useState<string | null>(null);

  const currentTable = metricTables.find((t) => t.tableId === metricsTableId);

  const fetchConnections = useCallback(async () => {
    try {
      const res = await apiFetch("/databases/connections");
      if (res.ok) {
        setConnections(await res.json());
        setError(null);
      } else {
        setError(`Gagal mengambil daftar koneksi (status ${res.status}).`);
      }
    } catch {
      setError("Terjadi kesalahan jaringan.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConnections();
    const timers = pollTimers.current;
    return () => {
      Object.values(timers).forEach(clearInterval);
    };
  }, [fetchConnections]);

  // ── Job polling ────────────────────────────────────────────────────────────

  const trackJob = (connectionId: string, jobId: string, label: string) => {
    setJobs((prev) => ({
      ...prev,
      [connectionId]: { jobId, label, status: "queued" },
    }));

    if (pollTimers.current[connectionId]) {
      clearInterval(pollTimers.current[connectionId]);
    }
    pollTimers.current[connectionId] = setInterval(async () => {
      try {
        const res = await apiFetch(`/databases/ingestions/${jobId}`);
        if (!res.ok) return;
        const data = await res.json();
        const status: string = data.status;
        const detail =
          status === "failed"
            ? (data.error?.message ?? "Job failed")
            : data.summary
              ? JSON.stringify(data.summary)
              : undefined;

        setJobs((prev) => ({
          ...prev,
          [connectionId]: { jobId, label, status, detail },
        }));

        if (status === "succeeded" || status === "failed") {
          clearInterval(pollTimers.current[connectionId]);
          delete pollTimers.current[connectionId];
        }
      } catch {
        // transient network error — keep polling
      }
    }, JOB_POLL_INTERVAL_MS);
  };

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleTest = async (conn: ConnectionType) => {
    setTesting((prev) => ({ ...prev, [conn.connectionId]: true }));
    try {
      await apiFetch(`/databases/connections/${conn.connectionId}/test`, {
        method: "POST",
      });
      await fetchConnections(); // testStatus/testError updated server-side
    } finally {
      setTesting((prev) => ({ ...prev, [conn.connectionId]: false }));
    }
  };

  const handleSync = async (conn: ConnectionType) => {
    try {
      const res = await apiFetch(
        `/databases/connections/${conn.connectionId}/sync`,
        { method: "POST" },
      );
      const body = await res.json().catch(() => null);
      if (res.ok) {
        trackJob(conn.connectionId, body.ingestionId, "Sync Catalog");
      } else {
        setJobs((prev) => ({
          ...prev,
          [conn.connectionId]: {
            jobId: "-",
            label: "Sync Catalog",
            status: "failed",
            detail: body?.detail ?? `Gagal memulai sync (status ${res.status}).`,
          },
        }));
      }
    } catch {
      setJobs((prev) => ({
        ...prev,
        [conn.connectionId]: {
          jobId: "-",
          label: "Sync Catalog",
          status: "failed",
          detail: "Terjadi kesalahan jaringan.",
        },
      }));
    }
  };

  const handleOpenIngest = async (conn: ConnectionType) => {
    setIngestConn(conn);
    setTables([]);
    setSelectedTables(new Set());
    setIngestMode("metadata_only");
    setTablesError(null);
    setTablesLoading(true);
    try {
      const res = await apiFetch("/databases/tables/list", {
        method: "POST",
        body: JSON.stringify({
          connectionId: conn.connectionId,
          schemaName: conn.schemaName || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setTables(data.tables ?? []);
      } else {
        const body = await res.json().catch(() => null);
        setTablesError(body?.detail ?? `Gagal mengambil daftar tabel (status ${res.status}).`);
      }
    } catch {
      setTablesError("Terjadi kesalahan jaringan.");
    } finally {
      setTablesLoading(false);
    }
  };

  const toggleTable = (name: string) => {
    setSelectedTables((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleStartIngest = async () => {
    if (!ingestConn || selectedTables.size === 0) return;
    const conn = ingestConn;
    try {
      const res = await apiFetch("/databases/ingestions", {
        method: "POST",
        body: JSON.stringify({
          connectionId: conn.connectionId,
          tables: Array.from(selectedTables),
          ingestionMode: ingestMode,
          schemaFilter: conn.schemaName || null,
        }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok) {
        setIngestConn(null);
        trackJob(conn.connectionId, body.ingestionId, `Ingest (${ingestMode})`);
      } else {
        setTablesError(body?.detail ?? `Gagal memulai ingestion (status ${res.status}).`);
      }
    } catch {
      setTablesError("Terjadi kesalahan jaringan.");
    }
  };

  // ── Manage Metrics ─────────────────────────────────────────────────────────

  const selectMetricsTable = (tables: TableMetrics[], tableId: string) => {
    setMetricsTableId(tableId);
    const table = tables.find((t) => t.tableId === tableId);
    setMetricDrafts(
      Object.fromEntries((table?.metrics ?? []).map((m) => [m.base, toDraft(m)])),
    );
    setSetDrafts(
      Object.fromEntries((table?.sets ?? []).map((s) => [s.name, toSetDraft(s)])),
    );
    setMetricSaved({});
  };

  const reloadMetrics = async (connectionId: string, keepTableId: string) => {
    const res = await apiFetch(`/databases/connections/${connectionId}/metrics`);
    if (!res.ok) return;
    const body: TableMetrics[] = await res.json();
    setMetricTables(body);
    const stillThere = body.some((t) => t.tableId === keepTableId);
    selectMetricsTable(body, stillThere ? keepTableId : (body[0]?.tableId ?? ""));
  };

  /** Create a set, or save an existing set's aliases + member columns. */
  const handleSaveSet = async (name: string, draft?: SetDraft) => {
    const key = name.trim();
    if (!metricsConn || !metricsTableId || !key) return;
    setSetSaving((prev) => ({ ...prev, [key]: true }));
    setMetricsError(null);
    try {
      const res = await apiFetch(
        `/databases/tables/${metricsTableId}/metric-sets/${key}`,
        {
          method: "PUT",
          body: JSON.stringify({
            label: key,
            ...(draft
              ? { aliases: parseCsv(draft.aliases), members: draft.members }
              : {}),
          }),
        },
      );
      if (res.ok) {
        if (!draft) setNewSetName("");
        await reloadMetrics(metricsConn.connectionId, metricsTableId);
      } else {
        const body = await res.json().catch(() => null);
        setMetricsError(body?.detail ?? `Gagal menyimpan set (status ${res.status}).`);
      }
    } catch {
      setMetricsError("Terjadi kesalahan jaringan.");
    } finally {
      setSetSaving((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleDeleteSet = async (name: string) => {
    if (!metricsConn || !metricsTableId) return;
    setSetSaving((prev) => ({ ...prev, [name]: true }));
    try {
      const res = await apiFetch(
        `/databases/tables/${metricsTableId}/metric-sets/${name}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        if (expandedSet === name) setExpandedSet(null);
        await reloadMetrics(metricsConn.connectionId, metricsTableId);
      } else {
        const body = await res.json().catch(() => null);
        setMetricsError(body?.detail ?? `Gagal menghapus set (status ${res.status}).`);
      }
    } catch {
      setMetricsError("Terjadi kesalahan jaringan.");
    } finally {
      setSetSaving((prev) => ({ ...prev, [name]: false }));
    }
  };

  const handleOpenMetrics = async (conn: ConnectionType) => {
    setMetricsConn(conn);
    setMetricTables([]);
    setMetricsError(null);
    setMetricsLoading(true);
    try {
      const res = await apiFetch(`/databases/connections/${conn.connectionId}/metrics`);
      const body = await res.json().catch(() => null);
      if (res.ok) {
        setMetricTables(body);
        if (body.length > 0) selectMetricsTable(body, body[0].tableId);
      } else {
        setMetricsError(body?.detail ?? `Gagal mengambil metric catalog (status ${res.status}).`);
      }
    } catch {
      setMetricsError("Terjadi kesalahan jaringan.");
    } finally {
      setMetricsLoading(false);
    }
  };

  const handleSaveMetric = async (metric: MetricInfo) => {
    const draft = metricDrafts[metric.base];
    if (!draft) return;

    // Only send fields the admin actually changed, so untouched fields keep
    // following the generated catalog on future syncs.
    const aliases = parseCsv(draft.aliases);
    const payload: Record<string, unknown> = {};
    if (draft.description !== metric.description) payload.description = draft.description;
    if (aliases.join("|") !== metric.aliases.join("|")) payload.aliases = aliases;
    if (Object.keys(payload).length === 0) return;

    setMetricSaving((prev) => ({ ...prev, [metric.base]: true }));
    setMetricsError(null);
    try {
      const res = await apiFetch(
        `/databases/tables/${metricsTableId}/metrics/${metric.base}`,
        { method: "PATCH", body: JSON.stringify(payload) },
      );
      const body = await res.json().catch(() => null);
      if (res.ok) {
        setMetricTables((prev) =>
          prev.map((t) =>
            t.tableId === metricsTableId
              ? { ...t, metrics: t.metrics.map((m) => (m.base === metric.base ? body : m)) }
              : t,
          ),
        );
        setMetricSaved((prev) => ({ ...prev, [metric.base]: true }));
        setTimeout(() => setMetricSaved((prev) => ({ ...prev, [metric.base]: false })), 2000);
      } else {
        setMetricsError(body?.detail ?? `Gagal menyimpan metric (status ${res.status}).`);
      }
    } catch {
      setMetricsError("Terjadi kesalahan jaringan.");
    } finally {
      setMetricSaving((prev) => ({ ...prev, [metric.base]: false }));
    }
  };

  const handleAddConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    const port = parseInt(connForm.port, 10);
    if (!connForm.name.trim() || !connForm.host.trim() || !connForm.databaseName.trim() || !connForm.username.trim() || !connForm.password) {
      setFormError("Semua field (kecuali Schema) wajib diisi.");
      return;
    }
    if (Number.isNaN(port) || port <= 0) {
      setFormError("Port harus berupa angka valid.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch("/databases/connections", {
        method: "POST",
        body: JSON.stringify({
          name: connForm.name.trim(),
          dbType: connForm.dbType,
          host: connForm.host.trim(),
          port,
          databaseName: connForm.databaseName.trim(),
          username: connForm.username.trim(),
          password: connForm.password,
          schemaName: connForm.schemaName.trim() || null,
        }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok) {
        setFormSuccess("Koneksi berhasil didaftarkan!");
        await fetchConnections();
        setTimeout(() => {
          setShowAddModal(false);
          setConnForm({ ...EMPTY_CONN_FORM });
          setFormSuccess(null);
        }, 1200);
      } else {
        const detail = body?.detail ?? "Gagal mendaftarkan koneksi.";
        setFormError(typeof detail === "string" ? detail : JSON.stringify(detail));
      }
    } catch {
      setFormError("Terjadi kesalahan jaringan.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connToDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await apiFetch(
        `/databases/connections/${connToDelete.connectionId}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        setConnToDelete(null);
        await fetchConnections();
      } else {
        const body = await res.json().catch(() => null);
        setDeleteError(body?.detail ?? "Gagal menghapus koneksi.");
      }
    } catch {
      setDeleteError("Terjadi kesalahan jaringan.");
    } finally {
      setDeleting(false);
    }
  };

  const setForm = (key: keyof typeof EMPTY_CONN_FORM) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setConnForm((prev) => ({ ...prev, [key]: e.target.value }));

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <Breadcrumb pageName="Database Sources" />

      <div className="rounded-[10px] border border-stroke bg-white p-4 shadow-1 dark:border-dark-3 dark:bg-gray-dark dark:shadow-card sm:p-7.5">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-xl font-semibold text-dark dark:text-white">
            External Database Connections
          </h3>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 rounded-lg bg-[#FE6C11] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#e05b0a] transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Connection
          </button>
        </div>

        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-solid border-primary border-t-transparent" />
          </div>
        ) : error ? (
          <div className="rounded-lg bg-red-500/10 p-4 text-center text-sm font-medium text-red-500 dark:bg-red-500/5">
            {error}
          </div>
        ) : connections.length === 0 ? (
          <div className="py-10 text-center text-gray-500 dark:text-[#8f8f8a]">
            Belum ada koneksi database terdaftar.
          </div>
        ) : (
          <div className="max-w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-none bg-[#F7F9FC] dark:bg-dark-2 [&>th]:py-4 [&>th]:text-base [&>th]:text-dark [&>th]:dark:text-white">
                  <TableHead className="xl:pl-7.5">Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Host / Database</TableHead>
                  <TableHead>Test Status</TableHead>
                  <TableHead>Last Job</TableHead>
                  <TableHead>Created At</TableHead>
                  <TableHead className="xl:pr-7.5 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {connections.map((conn) => {
                  const job = jobs[conn.connectionId];
                  return (
                    <TableRow key={conn.connectionId} className="border-[#eee] dark:border-dark-3">
                      <TableCell className="xl:pl-7.5">
                        <span className="font-medium text-dark dark:text-white">{conn.name}</span>
                        <div className="font-mono text-xs text-gray-500 dark:text-[#8f8f8a]">
                          {conn.connectionId}
                        </div>
                      </TableCell>

                      <TableCell className="capitalize text-dark dark:text-white">
                        {conn.dbType}
                      </TableCell>

                      <TableCell className="text-dark dark:text-white">
                        {conn.host}:{conn.port}
                        <div className="text-xs text-gray-500 dark:text-[#8f8f8a]">
                          {conn.databaseName}
                          {conn.schemaName ? ` · ${conn.schemaName}` : ""}
                        </div>
                      </TableCell>

                      <TableCell>
                        {testing[conn.connectionId] ? (
                          <StatusPill tone="yellow">Testing…</StatusPill>
                        ) : conn.testStatus === "success" ? (
                          <StatusPill tone="green">Connected</StatusPill>
                        ) : conn.testStatus ? (
                          <StatusPill tone="red">Failed</StatusPill>
                        ) : (
                          <StatusPill tone="gray">Untested</StatusPill>
                        )}
                        {conn.testError && !testing[conn.connectionId] && (
                          <div className="mt-1 max-w-[220px] truncate text-xs text-red-500" title={conn.testError}>
                            {conn.testError}
                          </div>
                        )}
                      </TableCell>

                      <TableCell>
                        {job ? (
                          <div className="flex flex-col gap-1">
                            <StatusPill tone={jobTone(job.status)}>
                              {job.label}: {job.status}
                            </StatusPill>
                            {job.detail && (
                              <span className="max-w-[240px] truncate text-xs text-gray-500 dark:text-[#8f8f8a]" title={job.detail}>
                                {job.detail}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-gray-500 dark:text-[#8f8f8a]">-</span>
                        )}
                      </TableCell>

                      <TableCell className="text-dark dark:text-white">
                        {conn.createdAt ? dayjs(conn.createdAt).format("MMM DD, YYYY HH:mm") : "-"}
                      </TableCell>

                      <TableCell className="xl:pr-7.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleTest(conn)}
                            disabled={testing[conn.connectionId]}
                            className="rounded-lg border border-stroke px-3 py-1.5 text-xs font-semibold text-dark hover:bg-gray-100 disabled:opacity-50 dark:border-dark-3 dark:text-white dark:hover:bg-[#2d2a27] transition-colors"
                            title="Test koneksi ke database"
                          >
                            Test
                          </button>
                          <button
                            onClick={() => handleOpenIngest(conn)}
                            className="rounded-lg bg-blue-500/10 px-3 py-1.5 text-xs font-semibold text-blue-500 hover:bg-blue-500/20 transition-colors"
                            title="Pilih tabel untuk di-ingest"
                          >
                            Ingest Tables
                          </button>
                          <button
                            onClick={() => handleSync(conn)}
                            disabled={job ? job.status === "queued" || job.status === "running" : false}
                            className="rounded-lg bg-[#FE6C11]/10 px-3 py-1.5 text-xs font-semibold text-[#FE6C11] hover:bg-[#FE6C11]/20 disabled:opacity-50 transition-colors"
                            title="Refresh catalog: kolom KPI baru, lokasi baru, samples, embedding"
                          >
                            Sync Catalog
                          </button>
                          <button
                            onClick={() => handleOpenMetrics(conn)}
                            className="rounded-lg bg-[#219653]/10 px-3 py-1.5 text-xs font-semibold text-[#219653] hover:bg-[#219653]/20 transition-colors"
                            title="Edit deskripsi, alias istilah bisnis, dan flag report/key-driver per KPI"
                          >
                            Manage Metrics
                          </button>
                          <button
                            onClick={() => { setConnToDelete(conn); setDeleteError(null); }}
                            className="rounded p-1.5 text-red-500 hover:bg-red-500/10 transition-colors"
                            title="Delete Connection"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4.5 h-4.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Add Connection Modal */}
      {showAddModal && (
        <ModalShell
          title="Add Database Connection"
          onClose={() => { setShowAddModal(false); setConnForm({ ...EMPTY_CONN_FORM }); setFormError(null); setFormSuccess(null); }}
        >
          <form onSubmit={handleAddConnection} className="mt-4 flex flex-col gap-4">
            {formError && (
              <div className="rounded-lg bg-red-500/10 p-3 text-sm font-medium text-red-500 dark:bg-red-500/5">
                {formError}
              </div>
            )}
            {formSuccess && (
              <div className="rounded-lg bg-green-500/10 p-3 text-sm font-medium text-green-500 dark:bg-green-500/5">
                {formSuccess}
              </div>
            )}

            <Field label="Connection Name">
              <input type="text" required placeholder="e.g. Telecom KPI Production" value={connForm.name} onChange={setForm("name")} className={inputClass} />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Database Type">
                <select value={connForm.dbType} onChange={setForm("dbType")} className={inputClass}>
                  {DB_TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t} className="dark:bg-[#232220]">{t}</option>
                  ))}
                </select>
              </Field>
              <Field label="Port">
                <input type="number" required placeholder="5432" value={connForm.port} onChange={setForm("port")} className={inputClass} />
              </Field>
            </div>

            <Field label="Host">
              <input type="text" required placeholder="e.g. host.docker.internal" value={connForm.host} onChange={setForm("host")} className={inputClass} />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Database Name">
                <input type="text" required placeholder="e.g. tsel" value={connForm.databaseName} onChange={setForm("databaseName")} className={inputClass} />
              </Field>
              <Field label="Schema (optional)">
                <input type="text" placeholder="e.g. public" value={connForm.schemaName} onChange={setForm("schemaName")} className={inputClass} />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Username">
                <input type="text" required placeholder="Database username" value={connForm.username} onChange={setForm("username")} className={inputClass} />
              </Field>
              <Field label="Password">
                <input type="password" required placeholder="Database password" value={connForm.password} onChange={setForm("password")} className={inputClass} />
              </Field>
            </div>

            <div className="mt-4 flex items-center justify-end gap-3 border-t border-stroke pt-4 dark:border-dark-3">
              <button
                type="button"
                onClick={() => { setShowAddModal(false); setConnForm({ ...EMPTY_CONN_FORM }); setFormError(null); setFormSuccess(null); }}
                className="rounded-lg border border-stroke px-4 py-2 text-sm font-semibold text-dark hover:bg-gray-100 dark:border-dark-3 dark:text-white dark:hover:bg-[#2d2a27] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-[#FE6C11] px-5 py-2 text-sm font-semibold text-white hover:bg-[#e05b0a] disabled:opacity-50 transition-colors"
              >
                {submitting ? "Saving..." : "Save Connection"}
              </button>
            </div>
          </form>
        </ModalShell>
      )}

      {/* Ingest Tables Modal */}
      {ingestConn && (
        <ModalShell title={`Ingest Tables — ${ingestConn.name}`} onClose={() => setIngestConn(null)} wide>
          <div className="mt-4 flex flex-col gap-4">
            {tablesError && (
              <div className="rounded-lg bg-red-500/10 p-3 text-sm font-medium text-red-500 dark:bg-red-500/5">
                {tablesError}
              </div>
            )}

            {tablesLoading ? (
              <div className="flex h-32 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-t-transparent" />
              </div>
            ) : (
              <>
                <Field label={`Pilih tabel (${selectedTables.size} dipilih)`}>
                  <div className="max-h-64 overflow-y-auto rounded-lg border border-stroke dark:border-dark-3">
                    {tables.length === 0 ? (
                      <div className="p-4 text-center text-sm text-gray-500 dark:text-[#8f8f8a]">
                        Tidak ada tabel ditemukan.
                      </div>
                    ) : (
                      tables.map((t) => (
                        <label
                          key={`${t.schemaName ?? ""}.${t.tableName}`}
                          className="flex cursor-pointer items-center justify-between border-b border-stroke px-4 py-2.5 last:border-b-0 hover:bg-gray-50 dark:border-dark-3 dark:hover:bg-[#2d2a27]"
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={selectedTables.has(t.tableName)}
                              onChange={() => toggleTable(t.tableName)}
                              className="h-4 w-4 accent-[#FE6C11]"
                            />
                            <div>
                              <span className="text-sm font-medium text-dark dark:text-white">
                                {t.tableName}
                              </span>
                              {t.isView && (
                                <span className="ml-2 text-xs text-blue-500">view</span>
                              )}
                            </div>
                          </div>
                          <span className="text-xs text-gray-500 dark:text-[#8f8f8a]">
                            {t.columns.length} cols · {t.rowCount.toLocaleString()} rows
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </Field>

                <Field label="Ingestion Mode">
                  <select value={ingestMode} onChange={(e) => setIngestMode(e.target.value)} className={inputClass}>
                    {INGESTION_MODES.map((m) => (
                      <option key={m.value} value={m.value} className="dark:bg-[#232220]">
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 dark:text-[#8f8f8a]">
                    {INGESTION_MODES.find((m) => m.value === ingestMode)?.hint}
                  </p>
                </Field>
              </>
            )}

            <div className="mt-2 flex items-center justify-end gap-3 border-t border-stroke pt-4 dark:border-dark-3">
              <button
                type="button"
                onClick={() => setIngestConn(null)}
                className="rounded-lg border border-stroke px-4 py-2 text-sm font-semibold text-dark hover:bg-gray-100 dark:border-dark-3 dark:text-white dark:hover:bg-[#2d2a27] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStartIngest}
                disabled={selectedTables.size === 0 || tablesLoading}
                className="rounded-lg bg-[#FE6C11] px-5 py-2 text-sm font-semibold text-white hover:bg-[#e05b0a] disabled:opacity-50 transition-colors"
              >
                Start Ingestion
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* Manage Metrics Modal */}
      {metricsConn && (
        <ModalShell title={`Manage Metrics — ${metricsConn.name}`} onClose={() => setMetricsConn(null)} wide>
          <div className="mt-4 flex flex-col gap-4">
            {metricsError && (
              <div className="rounded-lg bg-red-500/10 p-3 text-sm font-medium text-red-500 dark:bg-red-500/5">
                {metricsError}
              </div>
            )}

            {metricsLoading ? (
              <div className="flex h-32 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-t-transparent" />
              </div>
            ) : (
              <>
                {metricTables.length > 1 && (
                  <Field label="Tabel">
                    <select
                      value={metricsTableId}
                      onChange={(e) => selectMetricsTable(metricTables, e.target.value)}
                      className={inputClass}
                    >
                      {metricTables.map((t) => (
                        <option key={t.tableId} value={t.tableId} className="dark:bg-[#232220]">
                          {t.tableName}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}

                <p className="text-xs text-gray-500 dark:text-[#8f8f8a]">
                  <b>Set</b> = istilah bisnis untuk SEKELOMPOK kolom (mis.{" "}
                  <span className="font-mono">key driver</span> = PGB + RGB + RGB Data) —
                  buka sebuah set untuk memilih kolom anggotanya dan mengatur aliasnya.{" "}
                  <b>Alias metric</b> (di daftar bawah) = istilah bisnis untuk SATU kolom
                  (mis. <span className="font-mono">payload user</span>).
                  Perubahan langsung dipakai chatbot dan tetap tersimpan saat Sync Catalog.
                </p>

                {/* Metric sets — each set picks its own member columns */}
                <Field label="Metric Sets">
                  <div className="flex flex-col gap-2 rounded-lg border border-stroke p-3 dark:border-dark-3">
                    {(currentTable?.sets ?? []).map((s) => {
                      const draft = setDrafts[s.name];
                      const open = expandedSet === s.name;
                      return (
                        <div key={s.name} className="rounded-lg border border-stroke dark:border-dark-3">
                          <div className="flex items-center gap-2 p-2">
                            <button
                              type="button"
                              onClick={() => setExpandedSet(open ? null : s.name)}
                              className="flex flex-1 items-center gap-2 text-left"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                                strokeWidth={2} stroke="currentColor"
                                className={cn("h-3.5 w-3.5 shrink-0 text-gray-500 transition-transform", open && "rotate-90")}
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                              </svg>
                              <span className="font-mono text-xs font-semibold text-dark dark:text-white">
                                {s.name}
                              </span>
                              <span className="text-xs text-gray-500 dark:text-[#8f8f8a]">
                                {s.members.length} kolom
                                {s.members.length > 0 && ` · ${s.members.join(", ")}`}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSet(s.name)}
                              disabled={setSaving[s.name]}
                              className="shrink-0 rounded p-1.5 text-red-500 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
                              title={`Hapus set ${s.name}`}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>

                          {open && draft && (
                            <div className="flex flex-col gap-2.5 border-t border-stroke p-3 dark:border-dark-3">
                              <Field label="Aliases (comma-separated)">
                                <input
                                  type="text"
                                  placeholder="e.g. key driver, driver utama"
                                  value={draft.aliases}
                                  onChange={(e) =>
                                    setSetDrafts((prev) => ({
                                      ...prev,
                                      [s.name]: { ...prev[s.name], aliases: e.target.value },
                                    }))
                                  }
                                  className={cn(inputClass, "py-1.5 text-xs")}
                                />
                              </Field>

                              <Field label={`Kolom anggota (${draft.members.length} dipilih)`}>
                                <div className="max-h-44 overflow-y-auto rounded-lg border border-stroke dark:border-dark-3">
                                  {(currentTable?.metrics ?? []).map((m) => (
                                    <label
                                      key={m.base}
                                      className="flex cursor-pointer items-center gap-2.5 border-b border-stroke px-3 py-1.5 last:border-b-0 hover:bg-gray-50 dark:border-dark-3 dark:hover:bg-[#2d2a27]"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={draft.members.includes(m.base)}
                                        onChange={(e) =>
                                          setSetDrafts((prev) => ({
                                            ...prev,
                                            [s.name]: {
                                              ...prev[s.name],
                                              members: e.target.checked
                                                ? [...prev[s.name].members, m.base]
                                                : prev[s.name].members.filter((b) => b !== m.base),
                                            },
                                          }))
                                        }
                                        className="h-4 w-4 accent-[#FE6C11]"
                                      />
                                      <span className="font-mono text-xs font-medium text-dark dark:text-white">
                                        {m.base}
                                      </span>
                                      <span className="truncate text-xs text-gray-500 dark:text-[#8f8f8a]" title={m.description}>
                                        {m.description}
                                      </span>
                                    </label>
                                  ))}
                                </div>
                              </Field>

                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => handleSaveSet(s.name, draft)}
                                  disabled={setSaving[s.name]}
                                  className="rounded-lg bg-[#FE6C11] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#e05b0a] disabled:opacity-50 transition-colors"
                                >
                                  {setSaving[s.name] ? "Saving..." : "Save Set"}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    <div className="flex items-center gap-2 border-t border-stroke pt-2 dark:border-dark-3">
                      <input
                        type="text"
                        placeholder="nama set baru, mis. trafik"
                        value={newSetName}
                        onChange={(e) => setNewSetName(e.target.value)}
                        className={cn(inputClass, "py-1.5 text-xs")}
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveSet(newSetName)}
                        disabled={setSaving[newSetName.trim()] || !newSetName.trim()}
                        className="shrink-0 rounded-lg bg-[#219653] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1b7a44] disabled:opacity-50 transition-colors"
                      >
                        + Set
                      </button>
                    </div>
                  </div>
                </Field>

                <div className="max-h-[420px] overflow-y-auto rounded-lg border border-stroke dark:border-dark-3">
                  {(currentTable?.metrics ?? []).map((m) => {
                    const draft = metricDrafts[m.base];
                    if (!draft) return null;
                    return (
                      <div key={m.base} className="border-b border-stroke p-4 last:border-b-0 dark:border-dark-3">
                        <div className="mb-2 flex items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-dark dark:text-white">{m.base}</span>
                          <span className="text-xs text-gray-500 dark:text-[#8f8f8a]">{m.variantCount} kolom</span>
                          {m.autoDiscovered && <StatusPill tone="yellow">auto</StatusPill>}
                          {m.overridden && <StatusPill tone="green">edited</StatusPill>}
                        </div>

                        <div className="flex flex-col gap-2.5">
                          <Field label="Description">
                            <input
                              type="text"
                              value={draft.description}
                              onChange={(e) =>
                                setMetricDrafts((prev) => ({
                                  ...prev,
                                  [m.base]: { ...prev[m.base], description: e.target.value },
                                }))
                              }
                              className={inputClass}
                            />
                          </Field>
                          <Field label="Aliases (comma-separated)">
                            <input
                              type="text"
                              placeholder="e.g. payload user, paying user data"
                              value={draft.aliases}
                              onChange={(e) =>
                                setMetricDrafts((prev) => ({
                                  ...prev,
                                  [m.base]: { ...prev[m.base], aliases: e.target.value },
                                }))
                              }
                              className={inputClass}
                            />
                          </Field>

                          <div className="flex items-center justify-between gap-4">
                            <span className="truncate text-xs text-gray-500 dark:text-[#8f8f8a]">
                              {m.sets.length > 0
                                ? `Anggota set: ${m.sets.join(", ")}`
                                : "Belum masuk set manapun"}
                            </span>

                            <div className="flex shrink-0 items-center gap-2">
                              {metricSaved[m.base] && (
                                <span className="text-xs font-medium text-[#219653]">Saved ✓</span>
                              )}
                              <button
                                type="button"
                                onClick={() => handleSaveMetric(m)}
                                disabled={metricSaving[m.base]}
                                className="rounded-lg bg-[#FE6C11] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#e05b0a] disabled:opacity-50 transition-colors"
                              >
                                {metricSaving[m.base] ? "Saving..." : "Save"}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </ModalShell>
      )}

      {/* Delete Connection Modal */}
      {connToDelete && (
        <ModalShell title="Delete Connection" onClose={() => setConnToDelete(null)}>
          <form onSubmit={handleDelete} className="mt-4 flex flex-col gap-4">
            {deleteError && (
              <div className="rounded-lg bg-red-500/10 p-3 text-sm font-medium text-red-500 dark:bg-red-500/5">
                {deleteError}
              </div>
            )}

            <p className="text-sm text-gray-500 dark:text-[#ece7dc]">
              Apakah anda yakin akan menghapus koneksi ini? Tabel yang sudah
              ter-ingest dari koneksi ini tidak akan bisa di-query lagi.
            </p>

            <div className="rounded-lg bg-red-500/5 border border-red-500/20 p-3.5 font-mono text-xs text-red-500 dark:bg-red-500/10">
              <div className="grid grid-cols-3 gap-y-1">
                <span className="font-semibold">Name:</span>
                <span className="col-span-2 overflow-hidden text-ellipsis">{connToDelete.name}</span>
                <span className="font-semibold">Host:</span>
                <span className="col-span-2 overflow-hidden text-ellipsis">
                  {connToDelete.host}:{connToDelete.port}/{connToDelete.databaseName}
                </span>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-3 border-t border-stroke pt-4 dark:border-dark-3">
              <button
                type="button"
                onClick={() => setConnToDelete(null)}
                className="rounded-lg border border-stroke px-4 py-2 text-sm font-semibold text-dark hover:bg-gray-100 dark:border-dark-3 dark:text-white dark:hover:bg-[#2d2a27] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={deleting}
                className="rounded-lg bg-red-500 px-5 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                {deleting ? "Deleting..." : "Delete Connection"}
              </button>
            </div>
          </form>
        </ModalShell>
      )}
    </>
  );
}
