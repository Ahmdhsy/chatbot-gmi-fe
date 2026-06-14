"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumbs/Breadcrumb";
import {
  getAccessTokenFromCookie,
  getAuthHeader,
  getRoleFromCookie,
} from "@/app/lib/auth";
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

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8001/v1";

interface QuotaStatus {
  enabled: boolean;
  daily_quota: number;
  yearly_cap: number;
  contract_start: string;
  contract_end: string;
  in_contract_period: boolean;
  days_elapsed: number;
  cumulative_allowance: number;
  cumulative_used: number;
  available: number;
  available_today: number;
  used_today: number;
  carryover_in: number;
  yearly_used: number;
  yearly_remaining: number;
  updated_at: string | null;
  updated_by: string | null;
}

interface UserUsage {
  user_id: string | null;
  username: string | null;
  email: string | null;
  role: string | null;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_cost_usd: number | null;
  conversations: number;
  llm_calls: number;
  last_activity: string | null;
}

const fmt = (n: number | null | undefined) =>
  typeof n === "number" ? n.toLocaleString("id-ID") : "-";

const pct = (used: number, total: number) =>
  total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;

export default function TokenUsagePage() {
  const router = useRouter();
  const [quota, setQuota] = useState<QuotaStatus | null>(null);
  const [users, setUsers] = useState<UserUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [formEnabled, setFormEnabled] = useState(true);
  const [formDaily, setFormDaily] = useState("");
  const [formYearly, setFormYearly] = useState("");
  const [formStart, setFormStart] = useState("");
  const [formEnd, setFormEnd] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const isSuperadmin = role === "superadmin";

  const loadData = useCallback(async () => {
    const token = getAccessTokenFromCookie();
    if (!token) {
      router.replace("/signin");
      return;
    }
    try {
      const [quotaRes, usersRes] = await Promise.all([
        fetch(`${API_BASE}/token-usage/quota`, { headers: { ...getAuthHeader() } }),
        fetch(`${API_BASE}/token-usage/by-user?days=0&limit=50`, {
          headers: { ...getAuthHeader() },
        }),
      ]);

      if (quotaRes.status === 401 || usersRes.status === 401) {
        router.replace("/signin");
        return;
      }
      if (!quotaRes.ok || !usersRes.ok) {
        setError("Gagal mengambil data token usage.");
        setLoading(false);
        return;
      }

      const quotaData: QuotaStatus = await quotaRes.json();
      const usersData = await usersRes.json();
      setQuota(quotaData);
      setUsers(usersData.users ?? []);
      setLoading(false);
    } catch (err) {
      console.error("Gagal memuat token usage:", err);
      setError("Terjadi kesalahan jaringan.");
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    setRole(getRoleFromCookie());
    loadData();
  }, [loadData]);

  const handleOpenEdit = () => {
    if (!quota) return;
    setFormEnabled(quota.enabled);
    setFormDaily(String(quota.daily_quota));
    setFormYearly(String(quota.yearly_cap));
    setFormStart(quota.contract_start);
    setFormEnd(quota.contract_end);
    setFormError(null);
    setFormSuccess(null);
    setShowEditModal(true);
  };

  const handleSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    const daily = Number(formDaily);
    const yearly = Number(formYearly);
    if (!Number.isFinite(daily) || daily < 0) {
      setFormError("Jatah harian harus angka >= 0.");
      return;
    }
    if (!Number.isFinite(yearly) || yearly < 0) {
      setFormError("Total tahunan harus angka >= 0.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/token-usage/quota`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({
          enabled: formEnabled,
          daily_quota: Math.trunc(daily),
          yearly_cap: Math.trunc(yearly),
          contract_start: formStart,
          contract_end: formEnd,
        }),
      });

      if (res.ok) {
        const updated: QuotaStatus = await res.json();
        setQuota(updated);
        setFormSuccess("Kuota berhasil diperbarui!");
        setTimeout(() => setShowEditModal(false), 1000);
      } else {
        const body = await res.json().catch(() => null);
        const detail = body?.detail ?? "Gagal memperbarui kuota.";
        setFormError(typeof detail === "string" ? detail : JSON.stringify(detail));
      }
    } catch (err) {
      console.error("Gagal mengirim update kuota:", err);
      setFormError("Terjadi kesalahan jaringan.");
    } finally {
      setSubmitting(false);
    }
  };

  const dailyBudgetToday =
    quota ? quota.daily_quota + Math.max(quota.carryover_in, 0) : 0;

  return (
    <>
      <Breadcrumb pageName="Token Usage" />

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-solid border-primary border-t-transparent" />
        </div>
      ) : error ? (
        <div className="rounded-lg bg-red-500/10 p-4 text-center text-sm font-medium text-red-500 dark:bg-red-500/5">
          {error}
        </div>
      ) : (
        <>
          {/* Quota status header */}
          {quota && (
            <div className="mb-6 flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "rounded-full px-3 py-1 text-sm font-medium",
                      quota.enabled
                        ? "bg-[#219653]/[0.08] text-[#219653]"
                        : "bg-[#D34053]/[0.08] text-[#D34053]"
                    )}
                  >
                    {quota.enabled ? "Kuota Aktif" : "Kuota Nonaktif"}
                  </span>
                  <span className="text-sm text-gray-500 dark:text-[#8f8f8a]">
                    Kontrak: {dayjs(quota.contract_start).format("DD MMM YYYY")} –{" "}
                    {dayjs(quota.contract_end).format("DD MMM YYYY")}
                    {!quota.in_contract_period && (
                      <span className="ml-2 text-[#D34053]">(di luar periode)</span>
                    )}
                  </span>
                </div>
                {isSuperadmin && (
                  <button
                    onClick={handleOpenEdit}
                    className="flex items-center gap-2 rounded-lg bg-[#FE6C11] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#e05b0a]"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                    </svg>
                    Edit Kuota
                  </button>
                )}
              </div>

              {/* Cards */}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Jatah Harian" value={fmt(quota.daily_quota)} sub={`Budget hari ini: ${fmt(dailyBudgetToday)} (termasuk rollover)`} />
                <StatCard label="Terpakai Hari Ini" value={fmt(quota.used_today)} sub={`${pct(quota.used_today, dailyBudgetToday)}% dari budget hari ini`} barPct={pct(quota.used_today, dailyBudgetToday)} />
                <StatCard label="Sisa Tersedia" value={fmt(quota.available_today)} sub="Termasuk akumulasi rollover" highlight />
                <StatCard label="Sisa Tahunan" value={fmt(quota.yearly_remaining)} sub={`dari ${fmt(quota.yearly_cap)} (${pct(quota.yearly_used, quota.yearly_cap)}% terpakai)`} barPct={pct(quota.yearly_used, quota.yearly_cap)} />
              </div>
            </div>
          )}

          {/* Top users table */}
          <div className="rounded-[10px] border border-stroke bg-white p-4 shadow-1 dark:border-dark-3 dark:bg-gray-dark dark:shadow-card sm:p-7.5">
            <h3 className="mb-6 text-xl font-semibold text-dark dark:text-white">
              Top Users berdasarkan Token
            </h3>

            {users.length === 0 ? (
              <div className="py-10 text-center text-gray-500 dark:text-[#8f8f8a]">
                Belum ada data penggunaan token.
              </div>
            ) : (
              <div className="max-w-full overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-none bg-[#F7F9FC] dark:bg-dark-2 [&>th]:py-4 [&>th]:text-base [&>th]:text-dark [&>th]:dark:text-white">
                      <TableHead className="xl:pl-7.5">#</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="text-right">Total Token</TableHead>
                      <TableHead className="text-right">Percakapan</TableHead>
                      {isSuperadmin && (
                        <TableHead className="text-right">Biaya (USD)</TableHead>
                      )}
                      <TableHead className="xl:pr-7.5 text-right">Terakhir Aktif</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {users.map((u, idx) => (
                      <TableRow key={u.user_id ?? `anon-${idx}`} className="border-[#eee] dark:border-dark-3">
                        <TableCell className="text-dark dark:text-white xl:pl-7.5">{idx + 1}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium text-dark dark:text-white">
                              {u.username || u.email || (u.user_id ? u.user_id : "Tidak diketahui")}
                            </span>
                            {u.email && u.username && (
                              <span className="text-xs text-gray-500 dark:text-[#8f8f8a]">{u.email}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="capitalize text-dark dark:text-white">{u.role || "-"}</TableCell>
                        <TableCell className="text-right font-semibold text-dark dark:text-white">{fmt(u.total_tokens)}</TableCell>
                        <TableCell className="text-right text-dark dark:text-white">{fmt(u.conversations)}</TableCell>
                        {isSuperadmin && (
                          <TableCell className="text-right text-dark dark:text-white">
                            {u.total_cost_usd ? `$${u.total_cost_usd.toFixed(4)}` : "-"}
                          </TableCell>
                        )}
                        <TableCell className="xl:pr-7.5 text-right text-dark dark:text-white">
                          {u.last_activity ? dayjs(u.last_activity).format("DD MMM YYYY HH:mm") : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Edit Quota Modal (superadmin only) */}
      {showEditModal && (
        <div className="fixed inset-0 z-9999 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-[480px] rounded-[14px] border border-stroke bg-white p-6 shadow-1 dark:border-dark-3 dark:bg-[#232220] dark:shadow-card">
            <div className="flex items-center justify-between border-b border-stroke pb-4 dark:border-dark-3">
              <h3 className="text-lg font-bold text-dark dark:text-white">Edit Kuota Token</h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-gray-500 transition-colors hover:text-dark dark:text-[#8f8f8a] dark:hover:text-white"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmitEdit} className="mt-4 flex flex-col gap-4">
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

              <label className="flex items-center gap-2 text-sm font-semibold text-dark dark:text-[#ece7dc]">
                <input
                  type="checkbox"
                  checked={formEnabled}
                  onChange={(e) => setFormEnabled(e.target.checked)}
                  className="h-4 w-4 accent-[#FE6C11]"
                />
                Kuota aktif (enforce blokir saat habis)
              </label>

              <Field label="Jatah Harian (token / hari, untuk semua user)">
                <input type="number" min={0} required value={formDaily} onChange={(e) => setFormDaily(e.target.value)} className={inputCls} />
              </Field>

              <Field label="Total Tahunan (plafon mutlak)">
                <input type="number" min={0} required value={formYearly} onChange={(e) => setFormYearly(e.target.value)} className={inputCls} />
              </Field>

              <Field label="Tanggal Mulai Kontrak">
                <input type="date" required value={formStart} onChange={(e) => setFormStart(e.target.value)} className={inputCls} />
              </Field>

              <Field label="Tanggal Akhir Kontrak (kosongkan = mulai + 1 tahun)">
                <input type="date" value={formEnd} onChange={(e) => setFormEnd(e.target.value)} className={inputCls} />
              </Field>

              <div className="mt-4 flex items-center justify-end gap-3 border-t border-stroke pt-4 dark:border-dark-3">
                <button type="button" onClick={() => setShowEditModal(false)} className="rounded-lg border border-stroke px-4 py-2 text-sm font-semibold text-dark transition-colors hover:bg-gray-100 dark:border-dark-3 dark:text-white dark:hover:bg-[#2d2a27]">
                  Batal
                </button>
                <button type="submit" disabled={submitting} className="rounded-lg bg-[#FE6C11] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#e05b0a] disabled:opacity-50">
                  {submitting ? "Menyimpan..." : "Simpan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

const inputCls =
  "w-full rounded-lg border border-stroke bg-transparent px-4 py-2 text-sm text-dark outline-none transition-colors focus:border-primary dark:border-dark-3 dark:bg-dark-2 dark:text-white dark:focus:border-primary";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-dark dark:text-[#ece7dc]">{label}</label>
      {children}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  barPct,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  barPct?: number;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-[10px] border border-stroke bg-white p-5 shadow-1 dark:border-dark-3 dark:bg-gray-dark dark:shadow-card">
      <p className="text-sm font-medium text-gray-500 dark:text-[#8f8f8a]">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold", highlight ? "text-[#FE6C11]" : "text-dark dark:text-white")}>
        {value}
      </p>
      {typeof barPct === "number" && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-dark-3">
          <div
            className={cn("h-full rounded-full", barPct >= 90 ? "bg-[#D34053]" : "bg-[#FE6C11]")}
            style={{ width: `${barPct}%` }}
          />
        </div>
      )}
      {sub && <p className="mt-2 text-xs text-gray-500 dark:text-[#8f8f8a]">{sub}</p>}
    </div>
  );
}
