"use client";

import { useEffect, useState } from "react";
import Breadcrumb from "@/components/Breadcrumbs/Breadcrumb";
import { API_BASE, apiFetch } from "@/app/lib/api";

interface EligibleUser { userId: string; email: string; role: string; scope: string }
interface Installation {
  installationId: string;
  label: string;
  origin: string;
  scope: string;
  targetUserId: string;
  active: boolean;
  createdAt: string;
}

async function responseError(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null);
  return typeof body?.detail === "string" ? body.detail : fallback;
}

export default function WidgetTokensPage() {
  const [users, setUsers] = useState<EligibleUser[]>([]);
  const [targetUserId, setTargetUserId] = useState("");
  const [error, setError] = useState("");
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [siteLabel, setSiteLabel] = useState("");
  const [siteOrigin, setSiteOrigin] = useState("");
  const [creatingSite, setCreatingSite] = useState(false);
  const [copiedSite, setCopiedSite] = useState("");

  useEffect(() => {
    let active = true;
    apiFetch("/embed/eligible-users", { skipRedirectOn401: true })
      .then(async (response) => {
        if (response.status === 403) setDenied(true);
        if (!response.ok) throw new Error(await responseError(response, "Tidak bisa memuat akun widget."));
        return (await response.json()) as EligibleUser[];
      })
      .then((data) => {
        if (!active) return;
        setUsers(data);
        setTargetUserId(data[0]?.userId ?? "");
      })
      .catch((cause) => { if (active) setError(cause.message || "Tidak bisa memuat akun widget."); })
      .finally(() => { if (active) setLoading(false); });
    apiFetch("/embed/installations", { skipRedirectOn401: true })
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseError(response, "Tidak bisa memuat daftar website."));
        return (await response.json()) as Installation[];
      })
      .then((data) => { if (active) setInstallations(data); })
      .catch((cause) => { if (active) setError(cause.message || "Tidak bisa memuat daftar website."); });
    return () => { active = false; };
  }, []);

  const createSite = async () => {
    if (!targetUserId || !siteLabel.trim() || !siteOrigin.trim() || creatingSite) return;
    setCreatingSite(true);
    setError("");
    try {
      const response = await apiFetch("/embed/installations", {
        method: "POST",
        body: JSON.stringify({ label: siteLabel.trim(), origin: siteOrigin.trim(), targetUserId }),
        skipRedirectOn401: true,
      });
      if (!response.ok) throw new Error(await responseError(response, "Gagal mendaftarkan website."));
      const installation = (await response.json()) as Installation;
      setInstallations((current) => [installation, ...current]);
      setSiteLabel("");
      setSiteOrigin("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal mendaftarkan website.");
    } finally {
      setCreatingSite(false);
    }
  };

  const revokeSite = async (installation: Installation) => {
    if (!window.confirm(`Cabut akses widget untuk ${installation.label}?`)) return;
    setError("");
    try {
      const response = await apiFetch(`/embed/installations/${installation.installationId}`, {
        method: "DELETE", skipRedirectOn401: true,
      });
      if (!response.ok) throw new Error(await responseError(response, "Gagal mencabut akses website."));
      setInstallations((current) => current.map((item) => item.installationId === installation.installationId
        ? { ...item, active: false } : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal mencabut akses website.");
    }
  };

  const snippet = (installation: Installation) =>
    `<script src="${window.location.origin}/widget.js" data-widget-id="${installation.installationId}" data-api-base="${API_BASE}"></script>`;

  const copySite = async (installation: Installation) => {
    try {
      await navigator.clipboard.writeText(snippet(installation));
      setCopiedSite(installation.installationId);
    } catch {
      setError("Clipboard tidak tersedia. Salin kode dari kolom di bawah.");
    }
  };

  return (
    <div className="mx-auto max-w-3xl text-white">
      <Breadcrumb pageName="Token Widget" />
      <h1 className="text-2xl font-semibold">Kode Widget Reporting</h1>
      {denied ? <p role="alert" className="mt-6 text-sm text-red-400">Hanya superadmin yang dapat membuka halaman ini.</p> : <>
      <p className="mt-2 text-sm text-[#aaa49c]">
        Daftarkan website sekali, lalu salin kode widget ke halaman website itu.
        Kode pemasangan berlaku sampai dicabut. Sesi akses diperbarui otomatis;
        cakupan data mengikuti akun yang dipilih.
      </p>
      {error && <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}

      <div className="mt-6 space-y-4 rounded-xl border border-dark-3 bg-gray-dark p-5">
        <h2 className="text-lg font-semibold">Daftarkan website baru</h2>
        <label className="block text-sm" htmlFor="site-label">Nama website</label>
        <input id="site-label" value={siteLabel} onChange={(event) => setSiteLabel(event.target.value)}
          placeholder="Portal Operasional" maxLength={120}
          className="w-full rounded-lg border border-dark-3 bg-[#232220] px-3 py-2.5 text-sm text-white" />
        <label className="block text-sm" htmlFor="site-origin">Alamat website (origin)</label>
        <input id="site-origin" value={siteOrigin} onChange={(event) => setSiteOrigin(event.target.value)}
          placeholder="https://portal.example.com" type="url"
          className="w-full rounded-lg border border-dark-3 bg-[#232220] px-3 py-2.5 text-sm text-white" />
        <p className="text-xs text-[#aaa49c]">Isi alamat utama saja, tanpa path. Untuk demo lokal: http://localhost:8080.</p>
        <label className="block text-sm" htmlFor="site-account">Akun dan cakupan data</label>
        <select id="site-account" value={targetUserId}
          onChange={(event) => setTargetUserId(event.target.value)} disabled={loading || creatingSite}
          className="w-full rounded-lg border border-dark-3 bg-[#232220] px-3 py-2.5 text-sm text-white">
          {users.map((user) => <option key={user.userId} value={user.userId}>
            {user.email} — {user.role} — {user.scope}
          </option>)}
        </select>
        <button type="button" onClick={createSite}
          disabled={loading || creatingSite || !targetUserId || !siteLabel.trim() || !siteOrigin.trim()}
          className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          {creatingSite ? "Mendaftarkan..." : "Buat kode widget"}
        </button>
      </div>

      <div className="mt-6 rounded-xl border border-dark-3 bg-gray-dark p-5">
        <h2 className="text-lg font-semibold">Website terdaftar</h2>
        {installations.length === 0 && <p className="mt-2 text-sm text-[#aaa49c]">Belum ada website yang didaftarkan.</p>}
        <div className="mt-3 space-y-4">
          {installations.map((installation) => <div key={installation.installationId}
            className="rounded-lg border border-dark-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><strong>{installation.label}</strong><p className="text-xs text-[#aaa49c]">{installation.origin} · {installation.scope}</p></div>
              <span className={installation.active ? "text-xs text-green-400" : "text-xs text-red-400"}>
                {installation.active ? "Aktif" : "Dicabut"}
              </span>
            </div>
            {installation.active && <>
              <textarea readOnly value={snippet(installation)} aria-label={`Kode widget ${installation.label}`}
                className="mt-3 h-20 w-full resize-none rounded-lg border border-dark-3 bg-[#232220] p-3 font-mono text-xs text-white" />
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => copySite(installation)}
                  className="rounded-lg border border-dark-3 px-3 py-2 text-sm hover:border-primary">
                  {copiedSite === installation.installationId ? "Tersalin" : "Salin kode"}
                </button>
                <button type="button" onClick={() => revokeSite(installation)}
                  className="rounded-lg border border-red-500/50 px-3 py-2 text-sm text-red-400">
                  Cabut akses
                </button>
              </div>
            </>}
          </div>)}
        </div>
      </div>

      </>}
    </div>
  );
}
