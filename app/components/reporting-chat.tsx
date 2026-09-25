"use client";

/* Chat report tanpa LLM - pertanyaan diparse deterministik jadi query plan.
   Endpoint POST /reporting/ask memakai pipeline pivot yang sama dengan chat
   biasa, jadi tabelnya identik; bedanya nol panggilan model.

   Dipakai dua tempat: halaman admin (ikut sesi login) dan halaman embed di
   situs lain (membawa token embed sendiri). Satu-satunya perbedaan adalah dari
   mana Authorization-nya datang, jadi itu saja yang jadi prop.

   ponytail: riwayat hanya hidup di state komponen - refresh = kosong. Tambahkan
   localStorage (pola persistHistorySafely di app/chat/page.tsx) kalau riwayat
   memang diperlukan. */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/app/lib/api";
import { Chart, MarkdownMessage } from "@/components/report-render";
import type { ChartData } from "@/components/report-render";

interface Clarification {
  message?: string;
  locations?: string[];
  metrics?: string[];
}

interface AskResponse {
  markdown: string;
  charts?: Record<string, unknown>[] | null;
  generatedAt?: string;
  locationLabel?: string;
  understood?: Record<string, unknown> | null;
  suggestions?: string[] | null;
  clarification?: Clarification | null;
}

interface Message {
  id: string;
  role: "user" | "bot";
  text?: string;
  report?: AskResponse;
  error?: string;
}

const BTN_PRIMARY =
  "inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

const CHIP =
  "rounded-full border border-stroke px-3 py-1.5 text-left text-xs font-medium text-dark transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-3 dark:text-[#ece7dc] dark:hover:border-primary";

/** Pesan yang terbaca dari body error apa pun.
 *
 * `detail` berupa string untuk error yang endpoint ini lempar sendiri, tapi
 * validasi FastAPI mengembalikan LIST objek - menaruhnya langsung di state
 * membuat React crash. Selalu berakhir sebagai string. */
function errorText(body: unknown, fallback: string): string {
  const detail = (body as { detail?: unknown } | null | undefined)?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) =>
        item && typeof item === "object" && "msg" in item
          ? String((item as { msg: unknown }).msg)
          : "",
      )
      .filter(Boolean);
    if (messages.length) return messages.join("; ");
  }
  return fallback;
}

let seq = 0;
const uid = () => `m${++seq}`;

function Chips({
  items,
  onPick,
  label,
  disabled,
}: {
  items: string[];
  onPick: (value: string) => void;
  label?: string;
  disabled?: boolean;
}) {
  if (!items.length) return null;
  return (
    <div className="mt-3">
      {label && (
        <p className="mb-2 text-xs text-gray-500 dark:text-[#8f8f8a]">{label}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <button
            key={item}
            type="button"
            disabled={disabled}
            onClick={() => onPick(item)}
            className={CHIP}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}

export interface ReportingChatProps {
  /** Embed token. Absent on the admin page, where the login session applies. */
  token?: string;
  /** Header shown above the conversation; hidden when the host supplies its own. */
  heading?: string;
  subheading?: string;
}

export default function ReportingChat({ token, heading, subheading }: ReportingChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [starters, setStarters] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  // An embed runs on someone else's page: it carries its own token and must
  // never bounce the visitor to our /signin.
  const call = useCallback(
    (path: string, init: RequestInit = {}) =>
      apiFetch(path, {
        ...init,
        ...(token
          ? {
              headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
              skipRedirectOn401: true,
            }
          : {}),
      }),
    [token],
  );

  useEffect(() => {
    call("/reporting/ask/examples")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setStarters(d?.suggestions ?? []))
      .catch(() => setStarters([]));
  }, [call]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const send = useCallback(
    async (raw: string) => {
      const question = raw.trim();
      if (!question || sending) return;
      setInput("");
      setSending(true);
      setMessages((prev) => [...prev, { id: uid(), role: "user", text: question }]);
      try {
        const res = await call("/reporting/ask", {
          method: "POST",
          body: JSON.stringify({ question }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          setMessages((prev) => [
            ...prev,
            { id: uid(), role: "bot", error: errorText(body, "Gagal menyusun laporan.") },
          ]);
          return;
        }
        setMessages((prev) => [...prev, { id: uid(), role: "bot", report: body as AskResponse }]);
      } catch {
        setMessages((prev) => [
          ...prev,
          { id: uid(), role: "bot", error: "Tidak bisa menghubungi server." },
        ]);
      } finally {
        setSending(false);
      }
    },
    [sending, call],
  );

  return (
    <div className="rounded-[10px] bg-white p-5 shadow-1 dark:bg-gray-dark dark:shadow-card">
      <>
        {heading && (
          <h3 className="mb-1 text-lg font-semibold text-dark dark:text-white">{heading}</h3>
        )}
        <p className="mb-4 text-sm text-gray-500 dark:text-[#8f8f8a]">
          {subheading ??
            "Tulis pertanyaannya apa adanya - sebut lokasi, KPI, dan periodenya. Jawabannya berupa tabel; tambahkan kata “grafik” kalau sekalian ingin visualisasinya."}
        </p>

        <div className="flex max-h-[62vh] min-h-[22rem] flex-col gap-5 overflow-y-auto pr-1">
          {messages.length === 0 && (
            <div className="my-auto">
              <Chips
                items={starters}
                onPick={send}
                disabled={sending}
                label="Coba salah satu:"
              />
              {starters.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-[#8f8f8a]">
                  Belum ada rekomendasi - pastikan sumber data sudah terhubung.
                </p>
              )}
            </div>
          )}

          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-white">
                  {m.text}
                </div>
              </div>
            ) : (
              <div key={m.id}>
                {m.error && (
                  <div className="rounded-lg bg-red-500/10 p-4 text-sm font-medium text-red-500 dark:bg-red-500/5">
                    {m.error}
                  </div>
                )}

                {m.report?.clarification && (
                  <div className="rounded-lg border border-stroke p-4 dark:border-dark-3">
                    <p className="text-sm text-dark dark:text-[#ece7dc]">
                      {m.report.clarification.message || "Pertanyaannya belum bisa dipahami."}
                    </p>
                    {/* Kandidat mengisi input tanpa langsung kirim - user biasanya
                        masih mau menyunting sisa kalimatnya. */}
                    <Chips
                      items={m.report.clarification.locations ?? []}
                      onPick={setInput}
                      disabled={sending}
                      label="Lokasi yang tersedia:"
                    />
                    <Chips
                      items={m.report.clarification.metrics ?? []}
                      onPick={setInput}
                      disabled={sending}
                      label="KPI yang tersedia:"
                    />
                  </div>
                )}

                {!m.report?.clarification && !!m.report?.markdown?.trim() && (
                  <div className="rounded-[10px] border border-[#3c3c3c] bg-[#1e1e1e] p-5 shadow-1">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[#343434] pb-3">
                      <h4 className="text-base font-semibold text-[#ece7db]">
                        Laporan {m.report.locationLabel}
                      </h4>
                      {m.report.generatedAt && (
                        <span className="text-xs text-[#8f8f8a]">
                          dibuat {new Date(m.report.generatedAt).toLocaleString("id-ID")}
                        </span>
                      )}
                    </div>
                    <div className="text-[#d8d2c4]">
                      <MarkdownMessage content={m.report.markdown} />
                      {(m.report.charts ?? []).map((c, idx) => (
                        <Chart key={idx} chart={c as unknown as ChartData} />
                      ))}
                    </div>
                  </div>
                )}

                <Chips
                  items={m.report?.suggestions ?? []}
                  onPick={send}
                  disabled={sending}
                  label="Lanjutkan dengan:"
                />
              </div>
            ),
          )}

          {sending && (
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-[#8f8f8a]">
              <span className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              Menyusun laporan...
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="mt-5 flex items-end gap-3 border-t border-stroke pt-5 dark:border-dark-3">
          <textarea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="mis. Berikan report untuk Region Sumbagsel terupdate"
            className="flex-1 resize-none rounded-lg border border-stroke bg-transparent px-4 py-2.5 text-sm text-dark outline-none focus:border-primary dark:border-dark-3 dark:text-white"
          />
          <button onClick={() => send(input)} disabled={sending || !input.trim()} className={BTN_PRIMARY}>
            Kirim
          </button>
        </div>
      </>
    </div>
  );
}
