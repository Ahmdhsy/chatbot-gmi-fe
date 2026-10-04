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

const CHIP_BASE =
  "border border-stroke text-left font-medium text-dark transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-3 dark:text-[#ece7dc] dark:hover:border-primary";

/** Inline pill — for the handful of follow-ups under an answer. */
const CHIP = `${CHIP_BASE} rounded-full px-3 py-1.5 text-xs`;

/** Grid cell — equal widths and exactly one line each, so a list of
 *  suggestions reads as a menu instead of a ragged run of pills in assorted
 *  lengths. `truncate` is the safety net for an unusually long location name;
 *  the button carries a title so the full text is still reachable on hover. */
const CHIP_CELL = `${CHIP_BASE} block w-full truncate rounded-xl px-3.5 py-2.5 text-[13px]`;

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

/** Drop the "**Tabel: <db table>**" line the pivot prepends — the card header
 *  already names the location, and a database table name is plumbing, not
 *  report content. Presentation-only: the shared formatter stays as is. */
function stripTableHeading(md: string): string {
  return md.replace(/^\*\*(?:Tabel|Table): [^*]+\*\*\s*$/gm, "").trim();
}

// Keep old tables, Markdown, and charts out of the textarea's render path.
// A report object stays the same while the user types the next question.
const ReportContent = React.memo(function ReportContent({ report }: { report: AskResponse }) {
  const markdown = React.useMemo(() => stripTableHeading(report.markdown), [report.markdown]);
  return (
    <>
      <MarkdownMessage content={markdown} />
      {(report.charts ?? []).map((chart, index) => (
        <Chart key={index} chart={chart as unknown as ChartData} />
      ))}
    </>
  );
});

function Chips({
  items,
  onPick,
  label,
  disabled,
  center = false,
  grid = false,
}: {
  items: string[];
  onPick: (value: string) => void;
  label?: string;
  disabled?: boolean;
  center?: boolean;
  /** Two even columns instead of wrapping pills. One column below sm, which is
   *  also what the 520px widget iframe gets — no extra breakpoint needed. */
  grid?: boolean;
}) {
  if (!items.length) return null;
  return (
    <div className="mt-2.5">
      {label && (
        <p className={`mb-2 text-xs text-gray-500 dark:text-[#8f8f8a] ${center ? "text-center" : ""}`}>
          {label}
        </p>
      )}
      <div
        className={
          grid
            ? "grid grid-cols-1 gap-2 sm:grid-cols-2"
            : `flex flex-wrap gap-2 ${center ? "justify-center" : ""}`
        }
      >
        {items.map((item) => (
          <button
            key={item}
            type="button"
            disabled={disabled}
            onClick={() => onPick(item)}
            className={grid ? CHIP_CELL : CHIP}
            title={grid ? item : undefined}
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
  /**
   * Widget layout: fill the parent instead of drawing a dashboard card, and
   * drop the chrome that only earns its space on a full page (timestamps,
   * generous padding). A 520px panel has no room for any of it.
   */
  compact?: boolean;
}

export default function ReportingChat({ token, compact = false }: ReportingChatProps) {
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
    <div
      className={
        compact
          ? "flex h-full min-h-0 flex-col bg-white dark:bg-gray-dark"
          // Full width, matching every other admin page. A centered card left
          // page-background gutters beside it; a centered column inside a full
          // card left gutters inside it. The box and its content agree now:
          // both fill the content area. Only the empty state centers itself.
          : "rounded-[10px] bg-white p-5 shadow-1 dark:bg-gray-dark dark:shadow-card"
      }
    >
      <>
        {/* No intro paragraph: the empty state below already says how to ask,
            and once a conversation starts the hint is just a line of noise
            sitting above it. */}
        {/* min-h-0 lets this flex child actually shrink, so THIS is the only
            vertical scroller. Without it the panel grows and you end up
            scrolling three nested boxes to read one table. */}
        {/* One column width for everything — conversation, suggestions and the
            composer. They used to disagree (1024px of chips above a 1400px
            input), which reads as a misalignment before you can name it. */}
        <div
          className={
            compact
              ? "flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4"
              : "flex max-h-[65vh] min-h-[20rem] flex-col gap-5 overflow-y-auto pr-1"
          }
        >
          {messages.length === 0 && (
            // Centred deliberately, and width-capped: chips stretched across a
            // 1400px dashboard column read as a toolbar, not as suggestions.
            <div className="m-auto w-full max-w-5xl px-2 text-center">
              <div className="mx-auto mb-3 grid size-11 place-items-center rounded-full bg-primary/10 text-primary">
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12Z" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="text-base font-semibold text-dark dark:text-white">
                Mau lihat laporan apa?
              </p>
              <p className="mt-1 text-sm text-gray-500 dark:text-[#8f8f8a]">
                Sebut lokasi, KPI, dan periodenya - atau pilih salah satu di bawah.
              </p>
              {starters.length > 0 ? (
                <div className="mt-5">
                  <Chips items={starters} onPick={send} disabled={sending} grid />
                </div>
              ) : (
                <p className="mt-5 text-sm text-gray-500 dark:text-[#8f8f8a]">
                  Belum ada rekomendasi - pastikan sumber data sudah terhubung.
                </p>
              )}
            </div>
          )}

          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm text-white">
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
                  // Follows the surrounding theme. It used to be hardcoded dark,
                  // which read as a hole punched in a light widget panel.
                  <div
                    className={`min-w-0 overflow-hidden rounded-xl border border-stroke bg-gray-2 dark:border-dark-3 dark:bg-dark-2 ${
                      compact ? "p-3" : "p-5"
                    }`}
                  >
                    <div
                      className={`flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-stroke dark:border-dark-3 ${
                        compact ? "mb-2 pb-2" : "mb-3 pb-3"
                      }`}
                    >
                      <h4
                        className={`font-semibold text-dark dark:text-white ${
                          compact ? "text-sm" : "text-base"
                        }`}
                      >
                        {m.report.locationLabel}
                      </h4>
                      {/* A timestamp is worth a line on a dashboard, not in a
                          panel this narrow. */}
                      {!compact && m.report.generatedAt && (
                        <span className="text-xs text-gray-500 dark:text-[#8f8f8a]">
                          dibuat {new Date(m.report.generatedAt).toLocaleString("id-ID")}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 text-dark dark:text-[#d8d2c4]">
                      <ReportContent report={m.report} />
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

        <div
          className={`flex items-end gap-2 border-t border-stroke dark:border-dark-3 ${
            compact ? "px-4 py-3" : "mt-5 gap-3 pt-5"
          }`}
        >
          <textarea
            rows={compact ? 1 : 2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder={compact ? "Tanya laporan..." : "mis. Berikan report untuk Region Sumbagsel terupdate"}
            className={`min-w-0 flex-1 resize-none rounded-lg border border-stroke bg-transparent text-sm text-dark outline-none focus:border-primary dark:border-dark-3 dark:text-white ${
              compact ? "px-3 py-2" : "px-4 py-2.5"
            }`}
          />
          <button
            onClick={() => send(input)}
            disabled={sending || !input.trim()}
            // In the panel the label is dead weight — the arrow is universally
            // read as send, and the width it frees goes to the input.
            aria-label="Kirim"
            className={
              compact
                ? "grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-white transition-colors hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                : BTN_PRIMARY
            }
          >
            {compact ? (
              <svg viewBox="0 0 20 20" className="size-4" fill="currentColor" aria-hidden="true">
                <path d="M1.7 2.2 18.4 9.3c.6.3.6 1.1 0 1.4L1.7 17.8c-.6.3-1.3-.3-1.1-.9l1.9-5.6c.1-.2.2-.4.5-.4l7.6-.9-7.6-.9c-.3 0-.4-.2-.5-.4L.6 3.1c-.2-.6.5-1.2 1.1-.9Z" />
              </svg>
            ) : (
              "Kirim"
            )}
          </button>
        </div>
      </>
    </div>
  );
}
