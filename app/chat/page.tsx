"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  FormEvent,
  KeyboardEvent,
} from "react";
import { getAccessTokenFromCookie, clearAccessTokenCookie, getRoleFromCookie } from "../lib/auth";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import RadioButtonCheckedIcon from "@mui/icons-material/RadioButtonChecked";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8001/v1";

/* ─────────────────────────── Types ─────────────────────────── */
interface ClarificationOption {
  value: string;
  label: string;
  description?: string | null;
}

interface ClarificationStep {
  id: string;
  question: string;
  options: ClarificationOption[];
}

interface ClarificationData {
  message: string;
  steps: ClarificationStep[];
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
  evidence?: Record<string, unknown>[];
  suggestions?: string[];
  chart?: Record<string, unknown> | null;
  data?: Record<string, unknown> | null;
  clarification?: ClarificationData | null;
}

interface Conversation {
  id: string;
  title: string;
  /** conversationId returned by the API — used for memory continuity */
  apiConversationId?: string;
  messages: Message[];
  createdAt: Date;
}

interface StoredMessage extends Omit<Message, "createdAt"> {
  createdAt: string;
}

interface StoredConversation extends Omit<Conversation, "createdAt" | "messages"> {
  createdAt: string;
  messages: StoredMessage[];
}

interface StoredHistoryPayload {
  activeId: string;
  conversations: StoredConversation[];
}

interface ApiErrorDetail {
  loc?: Array<string | number>;
  msg?: string;
  type?: string;
}

interface LangchainConversationMeta {
  conversationId?: string;
  id?: string;
  session_id?: string;
  sessionId?: string;
  messageCount?: number;
  message_count?: number;
  lastActivity?: string | null;
  last_activity?: string | null;
}

interface LangchainConversationListResponse {
  totalConversations?: number;
  conversations?: LangchainConversationMeta[];
}

interface LangchainHistoryItem {
  role?: string;
  question?: string;
  answer?: string;
  timestamp?: string | null;
}

interface LangchainHistoryResponse {
  conversationId?: string;
  source?: string;
  history?: LangchainHistoryItem[];
}

interface LangchainRawMessage {
  type?: string;
  role?: string;
  content?: string;
}

interface LangchainMessagesResponse {
  conversationId?: string;
  messages?: LangchainRawMessage[];
}

/* ── API request / response shapes ── */
interface ChatApiRequest {
  conversationId: string;
  message: string;
  context?: Record<string, unknown>;
  responseMode?: Record<string, boolean>;
  useLangChainMemory?: boolean;
}

interface ChatApiResponse {
  conversationId: string;
  answer: string;
  evidence?: Record<string, unknown>[];
  data?: Record<string, unknown> | null;
  chart?: Record<string, unknown> | null;
  suggestions?: string[];
  clarification?: ClarificationData | null;
  clarification_data?: ClarificationData | null;
  description_clarification_section?: ClarificationData | null;
}

type ToastType = "success" | "error" | "info";
interface ToastState { type: ToastType; message: string }

/* ─────────────────────────── ClarificationPanel ─────────────────────────── */
function ClarificationPanel({
  clarification,
  onSubmit,
  onClose,
  disabled,
}: {
  clarification: ClarificationData;
  onSubmit: (text: string) => void;
  onClose: () => void;
  disabled: boolean;
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [customText, setCustomText] = useState("");
  const [hoveredOption, setHoveredOption] = useState<string | null>(null);

  const totalSteps = clarification.steps.length;
  const step = clarification.steps[currentStep];

  function handleSelectOption(value: string) {
    if (disabled) return;
    const newSelections = { ...selections, [step.id]: value };
    setSelections(newSelections);

    if (currentStep < totalSteps - 1) {
      setCurrentStep((s) => s + 1);
      return;
    }

    const parts = clarification.steps.map((s, idx) => {
      const sel = idx === currentStep ? value : newSelections[s.id];
      const opt = s.options.find((o) => o.value === sel);
      return opt ? `${opt.label} (${opt.value})` : sel ?? "";
    });
    onSubmit(`Pilihan saya: ${parts.filter(Boolean).join(", ")}`);
  }

  function handleCustomSubmit() {
    if (!customText.trim() || disabled) return;
    onSubmit(customText.trim());
  }

  function handleCustomKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleCustomSubmit();
  }

  const canGoPrev = currentStep > 0;
  const canGoNext = currentStep < totalSteps - 1 && selections[step.id] !== undefined;

  return (
    <div
      style={{
        background: "#262626",
        borderRadius: 14,
        border: "1px solid #3a3a3a",
        overflow: "hidden",
        boxShadow: "0 -2px 16px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.06)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 18px 12px",
          borderBottom: "1px solid rgba(0,0,0,0.07)",
          background: "linear-gradient(135deg, #2a2a2a 0%, #252525 100%)",
          gap: 12,
        }}
      >
        <span
          style={{
            fontSize: "0.9rem",
            fontWeight: 600,
            color: "#e1dccc",
            flex: 1,
            lineHeight: 1.4,
          }}
        >
          {step.question}
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {totalSteps > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button
                onClick={() => canGoPrev && setCurrentStep((s) => s - 1)}
                disabled={!canGoPrev}
                style={{
                  background: "none",
                  border: "none",
                  cursor: canGoPrev ? "pointer" : "default",
                  color: canGoPrev ? "#FE6C11" : "#ccc",
                  fontSize: "1.1rem",
                  padding: "2px 4px",
                  lineHeight: 1,
                }}
              >
                {"<"}
              </button>
              <span style={{ fontSize: "0.78rem", color: "#8f8f8a", minWidth: 40, textAlign: "center" }}>
                {currentStep + 1} of {totalSteps}
              </span>
              <button
                onClick={() => canGoNext && setCurrentStep((s) => s + 1)}
                disabled={!canGoNext}
                style={{
                  background: "none",
                  border: "none",
                  cursor: canGoNext ? "pointer" : "default",
                  color: canGoNext ? "#FE6C11" : "#ccc",
                  fontSize: "1.1rem",
                  padding: "2px 4px",
                  lineHeight: 1,
                }}
              >
                {">"}
              </button>
            </div>
          )}

          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#bbb",
              fontSize: "1.2rem",
              padding: "2px 4px",
              lineHeight: 1,
              display: "flex",
              alignItems: "center",
            }}
          >
            x
          </button>
        </div>
      </div>

      <div style={{ maxHeight: 224, overflowY: "auto" }}>
        {step.options.map((opt, idx) => {
          const isSelected = selections[step.id] === opt.value;
          const isHovered = hoveredOption === opt.value;
          const isActive = isSelected || isHovered;

          return (
            <button
              key={opt.value}
              onClick={() => handleSelectOption(opt.value)}
              onMouseEnter={() => setHoveredOption(opt.value)}
              onMouseLeave={() => setHoveredOption(null)}
              disabled={disabled}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 18px",
                background: isSelected
                  ? "linear-gradient(135deg, #fff3eb 0%, #fff8f5 100%)"
                  : isHovered
                    ? "#fff8f5"
                    : "transparent",
                border: "none",
                borderBottom: "1px solid rgba(0,0,0,0.05)",
                borderLeft: isSelected ? "3px solid #FE6C11" : "3px solid transparent",
                cursor: disabled ? "not-allowed" : "pointer",
                textAlign: "left",
                fontFamily: "inherit",
                transition: "background .12s, border-color .12s",
              }}
            >
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  flexShrink: 0,
                  background: isActive
                    ? "linear-gradient(135deg, #FE6C11, #FF4400)"
                    : "rgba(0,0,0,0.06)",
                  color: isActive ? "#fff" : "#888",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  transition: "all .12s",
                }}
              >
                {isSelected ? "v" : idx + 1}
              </span>

              <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                <span
                  style={{
                    fontSize: "0.88rem",
                    color: isActive ? "#1a1a2e" : "#374151",
                    fontWeight: isActive ? 600 : 400,
                    lineHeight: 1.4,
                  }}
                >
                  {opt.label}
                </span>
                {opt.description && (
                  <span
                    style={{
                      fontSize: "0.75rem",
                      color: isActive ? "#FE6C11" : "#9ca3af",
                      lineHeight: 1.3,
                      fontWeight: 400,
                    }}
                  >
                    {opt.description}
                  </span>
                )}
              </span>

              <span
                style={{
                  color: "#FE6C11",
                  opacity: isActive ? 1 : 0,
                  fontSize: "1rem",
                  transition: "opacity .12s",
                }}
              >
                {isSelected ? "v" : ">"}
              </span>
            </button>
          );
        })}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 18px",
          borderTop: "1px solid rgba(0,0,0,0.06)",
          background: "#232323",
        }}
      >
        <span style={{ color: "#bbb", fontSize: "1rem", flexShrink: 0 }}>*</span>
        <input
          value={customText}
          onChange={(e) => setCustomText(e.target.value)}
          onKeyDown={handleCustomKeyDown}
          placeholder="Ketik jawaban lain..."
          disabled={disabled}
          style={{
            flex: 1,
            background: "none",
            border: "none",
            outline: "none",
            color: "#d5d0c5",
            fontSize: "0.85rem",
            fontFamily: "inherit",
          }}
        />
        <button
          onClick={onClose}
          style={{
            background: "#1d1d1d",
            border: "1px solid #3a3a3a",
            borderRadius: 8,
            color: "#8f8f8a",
            cursor: "pointer",
            fontSize: "0.8rem",
            fontFamily: "inherit",
            padding: "5px 14px",
            transition: "all .12s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,0,0,0.05)";
            (e.currentTarget as HTMLButtonElement).style.color = "#374151";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "none";
            (e.currentTarget as HTMLButtonElement).style.color = "#888";
          }}
        >
          Skip
        </button>
      </div>
    </div>
  );
}

const ChatInput = React.memo(function ChatInput({
  onSend,
  disabled,
  placeholder,
  variant,
  onFileUpload,
  activeFile,
  onClearFile,
  fileUploadError,
}: {
  onSend: (text: string) => void;
  disabled: boolean;
  placeholder: string;
  variant: "hero" | "footer";
  onFileUpload?: (file: File) => void;
  activeFile?: { fileId: string; filename: string; status: "uploading" | "ready" | "error" } | null;
  onClearFile?: () => void;
  fileUploadError?: string | null;
}) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [value]);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  }, [value, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const isActive = value.trim().length > 0 && !disabled;
  const buttonSize = variant === "hero" ? 34 : 44;
  const buttonRadius = variant === "hero" ? 10 : 14;
  const buttonFontSize = variant === "hero" ? "0.95rem" : "1.2rem";

  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        handleSubmit();
      }}
      style={
        variant === "hero"
          ? {
              width: "min(520px, 90%)",
              background: "#2a2a2a",
              borderRadius: 16,
              border: "1px solid #3a3a3a",
              padding: "14px 16px",
              boxShadow: "0 14px 26px rgba(0, 0, 0, 0.3)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }
          : {
        width: "100%",
              display: "flex",
              alignItems: "flex-end",
              gap: 12,
              background: "linear-gradient(135deg, #2a2a2a 0%, #242424 100%)",
              borderRadius: 18,
              padding: "12px 12px 12px 18px",
              border: "1.5px solid #3a3a3a",
              transition: "all .2s ease",
              boxShadow: "0 6px 20px rgba(0, 0, 0, 0.3)",
            }
      }
      onMouseEnter={(e) => {
        if (variant === "footer") {
          (e.currentTarget as HTMLFormElement).style.borderColor = "#4a4a4a";
          (e.currentTarget as HTMLFormElement).style.boxShadow = "0 10px 24px rgba(0, 0, 0, 0.4)";
        }
      }}
      onMouseLeave={(e) => {
        if (variant === "footer") {
          (e.currentTarget as HTMLFormElement).style.borderColor = "#3a3a3a";
          (e.currentTarget as HTMLFormElement).style.boxShadow = "0 6px 20px rgba(0, 0, 0, 0.3)";
        }
      }}
    >
      {/* File context banner */}
      {(activeFile || fileUploadError) && (
        <div style={{ marginBottom: 8 }}>
          {activeFile && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 10px",
              borderRadius: 8,
              background: activeFile.status === "uploading" ? "rgba(201,115,66,0.12)" : "rgba(80,180,120,0.12)",
              border: `1px solid ${activeFile.status === "uploading" ? "rgba(201,115,66,0.3)" : "rgba(80,180,120,0.3)"}`,
              fontSize: "0.82rem",
              color: activeFile.status === "uploading" ? "#c97342" : "#6ecf98",
            }}>
              <span>{activeFile.status === "uploading" ? "⏳" : "📄"}</span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {activeFile.status === "uploading"
                  ? `Memproses ${activeFile.filename}…`
                  : `${activeFile.filename} — pertanyaan akan dijawab dari file ini`}
              </span>
              {activeFile.status === "ready" && onClearFile && (
                <button
                  type="button"
                  onClick={onClearFile}
                  title="Hapus konteks file"
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: "#6ecf98", fontSize: "1rem", lineHeight: 1, padding: "0 2px",
                    flexShrink: 0,
                  }}
                >×</button>
              )}
            </div>
          )}
          {fileUploadError && (
            <div style={{
              padding: "5px 10px",
              borderRadius: 8,
              background: "rgba(220,60,60,0.12)",
              border: "1px solid rgba(220,60,60,0.3)",
              fontSize: "0.82rem",
              color: "#e07070",
              marginTop: activeFile ? 4 : 0,
            }}>
              ⚠ {fileUploadError}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
        {/* Hidden file input */}
        {onFileUpload && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFileUpload(f);
                e.target.value = "";
              }}
            />
            {/* Paperclip button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={activeFile?.status === "uploading"}
              title="Upload file Excel/CSV"
              style={{
                flexShrink: 0,
                width: 36,
                height: 36,
                borderRadius: 10,
                background: activeFile?.status === "ready" ? "rgba(80,180,120,0.18)" : "rgba(255,255,255,0.07)",
                border: `1px solid ${activeFile?.status === "ready" ? "rgba(80,180,120,0.4)" : "transparent"}`,
                cursor: activeFile?.status === "uploading" ? "default" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: activeFile?.status === "ready" ? "#6ecf98" : "#8f8f8a",
                fontSize: "1.05rem",
                opacity: activeFile?.status === "uploading" ? 0.5 : 1,
                transition: "all .2s ease",
              }}
            >
              📎
            </button>
          </>
        )}

        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          style={{
            flex: "1 1 0%",
            minWidth: 0,
            width: "100%",
            paddingRight: 0,
            resize: "none",
            border: "none",
            background: "transparent",
            outline: "none",
            fontSize: "0.95rem",
            lineHeight: 1.6,
            color: "#e2ddd2",
            fontFamily: "inherit",
            maxHeight: 160,
            overflowY: "auto",
            opacity: disabled ? 0.6 : 1,
            transition: "opacity .2s",
          }}
        />
        <button
          type="submit"
          disabled={!isActive}
          style={{
            flexShrink: 0,
            width: buttonSize,
            height: buttonSize,
            borderRadius: buttonRadius,
            background: isActive
              ? "linear-gradient(135deg, #c97342, #b76231)"
              : "rgba(255,255,255,0.08)",
            border: "none",
            cursor: isActive ? "pointer" : "default",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all .2s ease",
            color: isActive ? "#fff" : "#8f8f8a",
            fontSize: buttonFontSize,
            boxShadow: isActive && variant === "footer" ? "0 4px 12px rgba(201, 115, 66, 0.35)" : "none",
          }}
          onMouseEnter={(e) => {
            if (isActive && variant === "footer") {
              (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)";
              (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 8px 18px rgba(201, 115, 66, 0.45)";
            }
          }}
          onMouseLeave={(e) => {
            if (variant === "footer") {
              (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
              (e.currentTarget as HTMLButtonElement).style.boxShadow = isActive
                ? "0 4px 12px rgba(201, 115, 66, 0.35)"
                : "none";
            }
          }}
        >
          {disabled ? <RadioButtonCheckedIcon sx={{ fontSize: 16 }} /> : "➤"}
        </button>
      </div>
      {variant === "hero" && <div />}
    </form>
  );
});

/* ─────────────────────────── Toast ─────────────────────────── */
function Toast({ type, message, onClose }: ToastState & { onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);

  const bg = type === "success" ? "#1a7f5a" : type === "error" ? "#c0392b" : "#2563eb";
  const icon = type === "success" ? "✓" : type === "error" ? "✕" : "ℹ";

  return (
    <div
      role="alert"
      style={{
        position: "fixed", top: 24, right: 24, zIndex: 9999,
        display: "flex", alignItems: "center", gap: 10,
        padding: "13px 18px", borderRadius: 12,
        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
        background: bg, color: "#fff",
        fontSize: "0.875rem", fontWeight: 500,
        maxWidth: 360,
        animation: "slideIn .25s ease",
      }}
    >
      <span style={{ fontSize: "1.1rem" }}>{icon}</span>
      <span style={{ flex: 1 }}>{message}</span>
      <button onClick={onClose}
        style={{ background: "none", border: "none", color: "rgba(255,255,255,.7)", cursor: "pointer", fontSize: "1rem" }}>×</button>
      <style>{`@keyframes slideIn{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:translateX(0)}}`}</style>
    </div>
  );
}

/* ─────────────────────────── Chart Component ─────────────────────────── */
interface ChartData {
  type: string;
  title: string;
  data: Array<Record<string, unknown>>;
  xField?: string;
  yField?: string;
  seriesField?: string;
  colorScheme?: string[];
  smooth?: boolean;
  lineWidth?: number;
  pointSize?: number;
  [key: string]: unknown; // Allow additional properties
}

function toChartLabel(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value.trim() || fallback;
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const preferredKeys = [
      "label", "name", "month", "period", "region", "area", "metric", "category", "x", "id",
    ];
    for (const key of preferredKeys) {
      const candidate = obj[key];
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
      if (typeof candidate === "number" || typeof candidate === "boolean") return String(candidate);
    }
    const firstPrimitive = Object.values(obj).find(
      (v) => typeof v === "string" || typeof v === "number" || typeof v === "boolean"
    );
    if (firstPrimitive !== undefined) return String(firstPrimitive);
  }

  return fallback || "N/A";
}

function trimLabel(label: string, max = 16) {
  if (label.length <= max) return label;
  return `${label.slice(0, max)}...`;
}

function inferYField(data: Array<Record<string, unknown>>) {
  if (!data || data.length === 0) return "value";
  const preferred = ["value", "y", "nps", "score", "amount", "total"];
  const sample = data[0];
  for (const key of preferred) {
    if (typeof sample[key] === "number" || !Number.isNaN(Number(sample[key]))) return key;
  }
  const numericKey = Object.keys(sample).find((key) => typeof sample[key] === "number" || !Number.isNaN(Number(sample[key])));
  return numericKey || "value";
}

function inferXField(data: Array<Record<string, unknown>>, yField: string) {
  if (!data || data.length === 0) return "label";
  const preferred = ["label", "month", "period", "time", "date", "region", "area", "name", "category", "x"];
  const sample = data[0];
  for (const key of preferred) {
    if (key !== yField && key in sample) return key;
  }
  const stringKey = Object.keys(sample).find((key) => key !== yField && typeof sample[key] !== "number");
  return stringKey || "label";
}

function inferSeriesField(data: Array<Record<string, unknown>>, xField: string, yField: string) {
  if (!data || data.length === 0) return undefined;
  const preferred = ["series", "metric", "type", "legend", "group", "dataset", "line", "tipe"];
  const sample = data[0];
  const keys = Object.keys(sample);

  const preferredByLower = keys.find((key) => {
    const lower = key.toLowerCase();
    return preferred.includes(lower) && key !== xField && key !== yField;
  });
  if (preferredByLower) {
    const uniq = new Set(data.map((row) => toChartLabel(row[preferredByLower])));
    if (uniq.size > 1 && uniq.size < data.length) return preferredByLower;
  }

  for (const key of preferred) {
    if (key in sample && key !== xField && key !== yField) {
      const uniq = new Set(data.map((row) => toChartLabel(row[key])));
      if (uniq.size > 1 && uniq.size < data.length) return key;
    }
  }

  const candidates = keys.filter((key) => key !== xField && key !== yField);
  for (const key of candidates) {
    const uniq = new Set(data.map((row) => toChartLabel(row[key])));
    if (uniq.size > 1 && uniq.size < data.length) return key;
  }

  return undefined;
}

function buildLegendItems(
  chart: ChartData,
  colors: string[],
  fields?: { xField: string; seriesField?: string }
) {
  const xField = fields?.xField || chart.xField || "label";
  const seriesField = fields?.seriesField || chart.seriesField;
  const items: Array<{ label: string; color: string }> = [];

  if (chart.type === "pie") {
    const labels = Array.from(
      new Set(
        chart.data.map((row, idx) => toChartLabel(row[xField], `Item ${idx + 1}`))
      )
    );
    return labels.map((label, idx) => ({
      label: trimLabel(label, 22),
      color: colors[idx % colors.length],
    }));
  }

  if (seriesField) {
    const seriesNames = Array.from(
      new Set(
        chart.data.map((row, idx) => toChartLabel(row[seriesField], `Series ${idx + 1}`))
      )
    );
    return seriesNames.map((label, idx) => ({
      label: trimLabel(label, 22),
      color: colors[idx % colors.length],
    }));
  }

  const singleLabel = trimLabel(chart.title || "Series", 26);
  items.push({ label: singleLabel, color: colors[0] });
  return items;
}

function Chart({ chart }: { chart: ChartData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoverColumnsRef = useRef<Array<{
    x: number;
    xLabel: string;
    rows: Array<{ series: string; value: number; color: string }>;
  }>>([]);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    xLabel: string;
    rows: Array<{ series: string; value: number; color: string }>;
  } | null>(null);

  const yField = chart.yField || inferYField(chart.data);
  const xField = chart.xField || inferXField(chart.data, yField);
  const seriesField = chart.seriesField || inferSeriesField(chart.data, xField, yField);
  const chartType = String(chart.type || "").toLowerCase();
  const isLineChart = chartType.includes("line");
  const isBarChart = chartType.includes("bar") || chartType.includes("column");
  const isPieChart = chartType.includes("pie");
  const isTooltipChart = isLineChart || isBarChart;
  const colors = chart.colorScheme || ['#5B8FF9', '#5AD8A6', '#F6BD16', '#E86452', '#6DC8EC'];
  const legendItems = buildLegendItems(chart, colors, { xField, seriesField });
  const legendSignature = legendItems.map((item) => `${item.label}:${item.color}`).join("|");

  useEffect(() => {
    if (!chart || !chart.data || chart.data.length === 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const drawChart = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      try {

      const cssWidth = Math.max(parent.clientWidth, 320);
      const cssHeight = chart.seriesField ? 420 : 360;
      const dpr = Math.max(window.devicePixelRatio || 1, 1);

      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(cssHeight * dpr);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssWidth, cssHeight);
      ctx.imageSmoothingEnabled = true;

      const padding = {
        top: 54,
        right: 24,
        bottom: isPieChart ? 28 : 78,
        left: 56,
      };
      const chartWidth = cssWidth - padding.left - padding.right;
      const chartHeight = cssHeight - padding.top - padding.bottom;
      if (chartWidth <= 0 || chartHeight <= 0) return;

      // Get chart configuration
      const hasMultipleSeries = !!(seriesField && chart.data.length > 0);
      const rowCount = chart.data.length;
      const xLabelStepBase = Math.max(1, Math.ceil(rowCount / 12));

      // ========== GROUP DATA BY SERIES ==========
      const groupedData: Record<string, typeof chart.data> = {};
      if (hasMultipleSeries) {
        chart.data.forEach((item) => {
          const key = toChartLabel(item[seriesField as string], "Series");
          if (!groupedData[key]) groupedData[key] = [];
          groupedData[key].push(item);
        });
      } else {
        groupedData.default = chart.data;
      }

      // Keep source order so labels don't jump alphabetically.
      const uniqueXValues = Array.from(
        new Set(chart.data.map((item, index) => toChartLabel(item[xField], `#${index + 1}`)))
      );

      // ========== CALCULATE MAX VALUE ==========
      const maxRawValue = Math.max(...chart.data.map((d) => Number(d[yField]) || 0));
      const maxValue = Math.max(maxRawValue * 1.12, 1);

      // ========== DRAW TITLE ==========
      ctx.fillStyle = '#1a1a2e';
      ctx.font = "bold 16px Inter, Tahoma, Geneva, Verdana, sans-serif";
      ctx.textAlign = 'center';
      ctx.fillText(chart.title, cssWidth / 2, 28);

      // Draw Y-axis
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padding.left, padding.top);
      ctx.lineTo(padding.left, cssHeight - padding.bottom);
      ctx.stroke();

      // Draw X-axis
      ctx.beginPath();
      ctx.moveTo(padding.left, cssHeight - padding.bottom);
      ctx.lineTo(cssWidth - padding.right, cssHeight - padding.bottom);
      ctx.stroke();

      // Draw chart based on type
      if (isBarChart) {
        hoverColumnsRef.current = [];
        const barWidth = chartWidth / chart.data.length * 0.6;
        const gap = chartWidth / chart.data.length;
        const xLabelStep = Math.max(1, Math.ceil(chart.data.length / 12));
        const showValueLabels = rowCount <= 24;
        const hoverMap = new Map<string, {
          x: number;
          xLabel: string;
          rows: Array<{ series: string; value: number; color: string }>;
        }>();

        chart.data.forEach((item: Record<string, unknown>, index: number) => {
          const value = Number(item[yField]) || 0;
          const barHeight = (value / maxValue) * chartHeight;
          const x = padding.left + gap * index + (gap - barWidth) / 2;
          const y = cssHeight - padding.bottom - barHeight;

          // Draw bar
          ctx.fillStyle = colors[index % colors.length];
          ctx.fillRect(x, y, barWidth, barHeight);

          if (showValueLabels) {
            // Draw value on top
            ctx.fillStyle = '#1a1a2e';
            ctx.font = "11px Inter, Tahoma, Geneva, Verdana, sans-serif";
            ctx.textAlign = 'center';
            ctx.fillText(value.toString(), x + barWidth / 2, y - 5);
          }

          if (index % xLabelStep === 0 || index === chart.data.length - 1) {
            // Draw X-axis label
            ctx.save();
            ctx.translate(x + barWidth / 2, cssHeight - padding.bottom + 15);
            ctx.rotate(-Math.PI / 5);
            ctx.textAlign = 'right';
            ctx.fillStyle = '#6b7280';
            ctx.font = "10px Inter, Tahoma, Geneva, Verdana, sans-serif";
            const label = toChartLabel(item[xField], `#${index + 1}`);
            ctx.fillText(trimLabel(label, 14), 0, 0);
            ctx.restore();
          }

          const xLabel = toChartLabel(item[xField], `#${index + 1}`);
          const seriesLabel = seriesField
            ? toChartLabel(item[seriesField], "Series")
            : (legendItems[0]?.label || "Series");
          const existing = hoverMap.get(`${xLabel}`);
          if (!existing) {
            hoverMap.set(`${xLabel}`, {
              x: x + barWidth / 2,
              xLabel,
              rows: [{ series: seriesLabel, value, color: colors[index % colors.length] }],
            });
          } else {
            existing.rows.push({ series: seriesLabel, value, color: colors[index % colors.length] });
          }
        });
        hoverColumnsRef.current = Array.from(hoverMap.values()).sort((a, b) => a.x - b.x);
      } else if (isLineChart) {
        hoverColumnsRef.current = [];
        if (hasMultipleSeries) {
          // ========== MULTI-SERIES LINE CHART ==========
          const seriesNames = Object.keys(groupedData);
          const xLabelStep = Math.max(xLabelStepBase, Math.ceil(uniqueXValues.length / 12));
          const showPointLabels = uniqueXValues.length <= 18 && seriesNames.length <= 4;
          const hoverMap = new Map<string, {
            x: number;
            xLabel: string;
            rows: Array<{ series: string; value: number; color: string }>;
          }>();

          seriesNames.forEach((seriesName, seriesIndex) => {
            const seriesData = groupedData[seriesName];
            const color = colors[seriesIndex % colors.length];

            // Sort and create points for this series
            const points = seriesData
              .sort((a, b) => {
                const aIndex = uniqueXValues.indexOf(toChartLabel(a[xField]));
                const bIndex = uniqueXValues.indexOf(toChartLabel(b[xField]));
                return aIndex - bIndex;
              })
              .map((item) => {
                const xLabel = toChartLabel(item[xField]);
                const xIndex = uniqueXValues.indexOf(xLabel);
                const x = padding.left + (xIndex / (uniqueXValues.length - 1 || 1)) * chartWidth;
                const value = Number(item[yField]) || 0;
                const y = cssHeight - padding.bottom - (value / maxValue) * chartHeight;
                return { x, y, value, label: xLabel };
              });

            // Draw line
            ctx.strokeStyle = color;
            ctx.lineWidth = chart.lineWidth || 2.5;
            ctx.beginPath();

            const smooth = chart.smooth === true;
            if (smooth && points.length > 1) {
              // Smooth curve (bezier)
              ctx.moveTo(points[0].x, points[0].y);
              for (let i = 0; i < points.length - 1; i++) {
                const p0 = points[Math.max(0, i - 1)];
                const p1 = points[i];
                const p2 = points[i + 1];
                const p3 = points[Math.min(points.length - 1, i + 2)];

                const cp1x = p1.x + (p2.x - p0.x) / 6;
                const cp1y = p1.y + (p2.y - p0.y) / 6;
                const cp2x = p2.x - (p3.x - p1.x) / 6;
                const cp2y = p2.y - (p3.y - p1.y) / 6;

                ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
              }
            } else {
              // Straight lines
              points.forEach((point, index) => {
                if (index === 0) ctx.moveTo(point.x, point.y);
                else ctx.lineTo(point.x, point.y);
              });
            }
            ctx.stroke();

            // Draw points
            ctx.fillStyle = color;
            const pointSize = chart.pointSize || 4;
            const pointLabelStep = Math.max(1, Math.ceil(points.length / 10));

            points.forEach((point, idx) => {
              ctx.beginPath();
              ctx.arc(point.x, point.y, pointSize, 0, Math.PI * 2);
              ctx.fill();

              if (showPointLabels && (idx % pointLabelStep === 0 || idx === points.length - 1)) {
                // Draw value label
                ctx.fillStyle = '#1a1a2e';
                ctx.font = "10px Inter, Tahoma, Geneva, Verdana, sans-serif";
                ctx.textAlign = 'center';
                ctx.fillText(point.value.toFixed(1), point.x, point.y - pointSize - 4);
                ctx.fillStyle = color; // Reset for next point
              }

              const existing = hoverMap.get(point.label);
              if (!existing) {
                hoverMap.set(point.label, {
                  x: point.x,
                  xLabel: point.label,
                  rows: [{ series: seriesName, value: point.value, color }],
                });
              } else {
                existing.rows.push({ series: seriesName, value: point.value, color });
              }
            });
          });
          hoverColumnsRef.current = Array.from(hoverMap.values()).sort((a, b) => a.x - b.x);

          // ========== DRAW X-AXIS LABELS ==========
          uniqueXValues.forEach((xValue, index) => {
            if (index % xLabelStep !== 0 && index !== uniqueXValues.length - 1) return;
            const x = padding.left + (index / (uniqueXValues.length - 1 || 1)) * chartWidth;
            ctx.save();
            ctx.translate(x, cssHeight - padding.bottom + 16);
            ctx.rotate(-Math.PI / 5);
            ctx.textAlign = 'right';
            ctx.fillStyle = '#6b7280';
            ctx.font = "10px Inter, Tahoma, Geneva, Verdana, sans-serif";
            ctx.fillText(trimLabel(String(xValue), 14), 0, 0);
            ctx.restore();
          });

        } else {
          // ========== SINGLE SERIES LINE CHART ==========
          const gap = chartWidth / (chart.data.length - 1 || 1);

          // Get all points coordinates
          const points = chart.data.map((item: Record<string, unknown>, index: number) => {
            const value = Number(item[yField]) || 0;
            return {
              x: padding.left + gap * index,
              y: cssHeight - padding.bottom - (value / maxValue) * chartHeight,
              value,
            };
          });

          // Draw line
          ctx.strokeStyle = colors[0];
          ctx.lineWidth = (chart as Record<string, unknown>).lineWidth as number || 3;
          ctx.beginPath();

          // Check if smooth line is requested
          const smooth = (chart as Record<string, unknown>).smooth === true;

          if (smooth && points.length > 1) {
            // Draw smooth curve using bezier curves
            ctx.moveTo(points[0].x, points[0].y);

            for (let i = 0; i < points.length - 1; i++) {
              const p0 = points[Math.max(0, i - 1)];
              const p1 = points[i];
              const p2 = points[i + 1];
              const p3 = points[Math.min(points.length - 1, i + 2)];

              // Calculate control points for smooth curve
              const cp1x = p1.x + (p2.x - p0.x) / 6;
              const cp1y = p1.y + (p2.y - p0.y) / 6;
              const cp2x = p2.x - (p3.x - p1.x) / 6;
              const cp2y = p2.y - (p3.y - p1.y) / 6;

              ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
            }
          } else {
            // Draw straight lines
            points.forEach((point, index) => {
              if (index === 0) {
                ctx.moveTo(point.x, point.y);
              } else {
                ctx.lineTo(point.x, point.y);
              }
            });
          }

          ctx.stroke();
          const xLabelStep = Math.max(1, Math.ceil(chart.data.length / 12));
          const pointLabelStep = Math.max(1, Math.ceil(points.length / 10));
          const showPointLabels = chart.data.length <= 24;
          const singleSeriesName = trimLabel(chart.title || "Series", 26);
          hoverColumnsRef.current = [];

          // Draw points
          const pointSize = (chart as Record<string, unknown>).pointSize as number || 5;
          points.forEach((point, index) => {
            ctx.fillStyle = colors[0];
            ctx.beginPath();
            ctx.arc(point.x, point.y, pointSize, 0, Math.PI * 2);
            ctx.fill();

            if (showPointLabels && (index % pointLabelStep === 0 || index === points.length - 1)) {
              // Draw value
              ctx.fillStyle = '#1a1a2e';
              ctx.font = "11px Inter, Tahoma, Geneva, Verdana, sans-serif";
              ctx.textAlign = 'center';
              ctx.fillText(point.value.toString(), point.x, point.y - pointSize - 5);
            }

            if (index % xLabelStep === 0 || index === points.length - 1) {
              // Draw X-axis label
              ctx.save();
              ctx.translate(point.x, cssHeight - padding.bottom + 15);
              ctx.rotate(-Math.PI / 5);
              ctx.textAlign = 'right';
              ctx.fillStyle = '#6b7280';
              ctx.font = "10px Inter, Tahoma, Geneva, Verdana, sans-serif";
              const item = chart.data[index];
              const label = toChartLabel(item[xField], `#${index + 1}`);
              ctx.fillText(trimLabel(label, 14), 0, 0);
              ctx.restore();
            }

            const item = chart.data[index];
            const pointLabel = toChartLabel(item[xField], `#${index + 1}`);
            hoverColumnsRef.current.push({
              x: point.x,
              xLabel: pointLabel,
              rows: [{ series: singleSeriesName, value: point.value, color: colors[0] }],
            });
          });
        }
      } else if (isPieChart) {
        const total = chart.data.reduce((sum: number, item: Record<string, unknown>) => {
          return sum + (Number(item[yField]) || 0);
        }, 0);

        let currentAngle = -Math.PI / 2;
        const centerX = cssWidth / 2;
        const centerY = cssHeight / 2 + 10;
        const radius = Math.min(chartWidth, chartHeight) / 2.5;

        chart.data.forEach((item: Record<string, unknown>, index: number) => {
          const value = Number(item[yField]) || 0;
          const sliceAngle = (value / total) * Math.PI * 2;

          // Draw slice
          ctx.fillStyle = colors[index % colors.length];
          ctx.beginPath();
          ctx.moveTo(centerX, centerY);
          ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
          ctx.closePath();
          ctx.fill();

          // Draw label
          const labelAngle = currentAngle + sliceAngle / 2;
          const labelX = centerX + Math.cos(labelAngle) * (radius * 0.7);
          const labelY = centerY + Math.sin(labelAngle) * (radius * 0.7);

          const percentage = ((value / total) * 100).toFixed(1);
          ctx.fillStyle = '#fff';
          ctx.font = "bold 12px Inter, Tahoma, Geneva, Verdana, sans-serif";
          ctx.textAlign = 'center';
          ctx.fillText(`${percentage}%`, labelX, labelY);

          currentAngle += sliceAngle;
        });

      } else {
        // Unsupported chart type
        ctx.fillStyle = '#6b7280';
        ctx.font = "14px Inter, Tahoma, Geneva, Verdana, sans-serif";
        ctx.textAlign = 'center';
        ctx.fillText(`Chart type "${chart.type}" not supported`, cssWidth / 2, cssHeight / 2);
      }

      // Draw Y-axis labels
      ctx.fillStyle = '#6b7280';
      ctx.font = "10px Inter, Tahoma, Geneva, Verdana, sans-serif";
      ctx.textAlign = 'right';
      for (let i = 0; i <= 5; i++) {
        const value = (maxValue / 5) * i;
        const y = cssHeight - padding.bottom - (value / maxValue) * chartHeight;
        ctx.fillText(Math.round(value).toString(), padding.left - 10, y + 3);
      }
      } catch (error) {
        console.error("Chart render error:", error);
        const fallbackWidth = Math.max(parent.clientWidth, 320);
        const fallbackHeight = chart.seriesField ? 420 : 360;
        canvas.style.width = `${fallbackWidth}px`;
        canvas.style.height = `${fallbackHeight}px`;
        canvas.width = fallbackWidth;
        canvas.height = fallbackHeight;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, fallbackWidth, fallbackHeight);
        ctx.fillStyle = "#6b7280";
        ctx.font = "14px Inter, Tahoma, Geneva, Verdana, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Chart gagal dirender", fallbackWidth / 2, fallbackHeight / 2);
      }
    };

    const rafId = requestAnimationFrame(drawChart);

    const onResize = () => drawChart();
    window.addEventListener('resize', onResize);

    const onMouseMove = (e: MouseEvent) => {
      if (!isTooltipChart) {
        setTooltip(null);
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const cols = hoverColumnsRef.current;
      if (!cols || cols.length === 0) {
        setTooltip(null);
        return;
      }

      let nearest = cols[0];
      let minDist = Math.abs(mx - nearest.x);
      for (let i = 1; i < cols.length; i++) {
        const d = Math.abs(mx - cols[i].x);
        if (d < minDist) {
          minDist = d;
          nearest = cols[i];
        }
      }

      if (minDist > 40) {
        setTooltip(null);
        return;
      }

      const tooltipWidth = 240;
      const tooltipHeight = 72 + nearest.rows.length * 22;
      const xPos = Math.max(8, Math.min(mx + 12, rect.width - tooltipWidth - 8));
      const yPos = Math.max(8, Math.min(my + 14, rect.height - tooltipHeight - 8));

      setTooltip({
        x: xPos,
        y: yPos,
        xLabel: nearest.xLabel,
        rows: nearest.rows.sort((a, b) => b.value - a.value),
      });
    };

    const onMouseLeave = () => setTooltip(null);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseleave", onMouseLeave);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseleave", onMouseLeave);
    };

  }, [chart, xField, yField, seriesField, legendSignature, isLineChart, isBarChart, isPieChart, isTooltipChart]);

  return (
    <div style={{ marginTop: 12, borderRadius: 12, overflow: 'hidden', background: '#262626', boxShadow: '0 6px 18px rgba(0,0,0,0.3)', border: "1px solid #3a3a3a", position: "relative" }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', display: 'block' }}
      />
      {tooltip && (
        <div
          style={{
            position: "absolute",
            left: tooltip.x,
            top: tooltip.y,
            minWidth: 180,
            maxWidth: 240,
            background: "rgba(25,25,25,0.94)",
            color: "#ece7db",
            borderRadius: 10,
            padding: "8px 10px",
            boxShadow: "0 10px 24px rgba(0,0,0,0.24)",
            fontSize: "0.76rem",
            lineHeight: 1.35,
            zIndex: 5,
            pointerEvents: "none",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>{tooltip.xLabel}</div>
          {tooltip.rows.map((row, idx) => (
            <div key={`${row.series}-${idx}`} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: row.color, flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{row.series}</span>
              <span style={{ fontWeight: 700 }}>{row.value.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
      {legendItems.length > 0 && (
        <div
          style={{
            borderTop: "1px solid #383838",
            padding: "10px 12px",
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            alignItems: "center",
            maxHeight: 96,
            overflowY: "auto",
            background: "#232323",
          }}
        >
          {legendItems.map((item, idx) => (
            <div
              key={`${item.label}-${idx}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                border: "1px solid #47413a",
                borderRadius: 999,
                background: "#2b2825",
                fontSize: "0.76rem",
                color: "#d7d1c3",
                lineHeight: 1.2,
                maxWidth: "100%",
              }}
              title={item.label}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: item.color,
                  flexShrink: 0,
                }}
              />
              <span style={{ whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── Helpers ─────────────────────────── */
function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function getInitial(email: string) {
  return email ? email[0].toUpperCase() : "U";
}

function getErrorMessage(err: unknown, fallback: string) {
  if (err instanceof Error) return err.message || fallback;
  if (typeof err === "string") return err || fallback;
  return fallback;
}

function toConversationTitle(text: string, fallback: string) {
  const trimmed = text.trim();
  if (!trimmed) return fallback;
  return trimmed.length > 50 ? `${trimmed.slice(0, 50)}…` : trimmed;
}

function getTimeGreeting(date: Date) {
  const hour = date.getHours();
  if (hour >= 4 && hour < 11) return "Pagi";
  if (hour >= 11 && hour < 15) return "Siang";
  if (hour >= 15 && hour < 18) return "Sore";
  return "Malam";
}

function normalizeHistoryMessages(raw: unknown): Message[] {
  if (Array.isArray(raw)) {
    return raw.map((item: Record<string, unknown>) => ({
      id: uid(),
      role: (item.type === "human" || item.role === "user") ? "user" : "assistant",
      content: String(item.content ?? item.text ?? ""),
      createdAt: item.created_at ? new Date(String(item.created_at)) : new Date(),
    }));
  }

  const parsed = raw as LangchainHistoryResponse | null;
  const history = Array.isArray(parsed?.history) ? parsed.history : [];
  const messages: Message[] = [];

  // Backend returns newest-first; reverse to show chronological order
  history.slice().reverse().forEach((item) => {
    const timestamp = item.timestamp ? new Date(item.timestamp) : new Date();
    if (item.question) {
      messages.push({
        id: uid(),
        role: "user",
        content: item.question,
        createdAt: timestamp,
      });
    }
    if (item.answer) {
      messages.push({
        id: uid(),
        role: "assistant",
        content: item.answer,
        createdAt: timestamp,
      });
    }
  });

  return messages;
}

const HISTORY_STORAGE_PREFIX = "chat_history:";

function buildHistoryStorageKey(email: string) {
  const safeEmail = email?.trim().toLowerCase() || "user";
  return `${HISTORY_STORAGE_PREFIX}${safeEmail}`;
}

function serializeHistory(conversations: Conversation[], activeId: string, stripHeavy = false) {
  const payload: StoredHistoryPayload = {
    activeId,
    conversations: conversations.map((conv) => ({
      ...conv,
      createdAt: conv.createdAt.toISOString(),
      messages: conv.messages.map((msg) => ({
        ...msg,
        createdAt: msg.createdAt.toISOString(),
        // Drop large, re-fetchable payloads when storage is tight
        ...(stripHeavy ? { evidence: undefined, chart: null, data: null } : {}),
      })),
    })),
  };
  return JSON.stringify(payload);
}

function isQuotaExceededError(err: unknown) {
  return err instanceof DOMException
    && (err.name === "QuotaExceededError" || err.name === "NS_ERROR_DOM_QUOTA_REACHED");
}

/** Persist history to localStorage, degrading gracefully when the quota is exceeded. */
function persistHistorySafely(storageKey: string, conversations: Conversation[], activeId: string) {
  try {
    localStorage.setItem(storageKey, serializeHistory(conversations, activeId));
    return;
  } catch (err) {
    if (!isQuotaExceededError(err)) return;
  }
  try {
    // Retry without chart/data/evidence — these are re-fetched from the API anyway
    localStorage.setItem(storageKey, serializeHistory(conversations, activeId, true));
    return;
  } catch (err) {
    if (!isQuotaExceededError(err)) return;
  }
  try {
    // Last resort: keep only the most recent conversations, stripped down
    const recent = conversations.slice(0, 10);
    localStorage.setItem(storageKey, serializeHistory(recent, activeId, true));
  } catch {
    console.warn("Tidak dapat menyimpan riwayat percakapan secara lokal — kuota penyimpanan penuh.");
  }
}

function hydrateHistory(raw: string | null) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredHistoryPayload;
    if (!parsed || !Array.isArray(parsed.conversations)) return null;
    const conversations: Conversation[] = parsed.conversations.map((conv) => ({
      id: typeof conv.id === "string" ? conv.id : uid(),
      title: typeof conv.title === "string" ? conv.title : "Percakapan baru",
      apiConversationId: typeof conv.apiConversationId === "string" ? conv.apiConversationId : undefined,
      createdAt: conv.createdAt ? new Date(conv.createdAt) : new Date(),
      messages: Array.isArray(conv.messages)
        ? conv.messages.map((msg) => ({
            id: typeof msg.id === "string" ? msg.id : uid(),
            role: msg.role === "assistant" ? "assistant" : "user",
            content: typeof msg.content === "string" ? msg.content : "",
            createdAt: msg.createdAt ? new Date(msg.createdAt) : new Date(),
            evidence: Array.isArray(msg.evidence) ? msg.evidence : undefined,
            suggestions: Array.isArray(msg.suggestions) ? msg.suggestions : undefined,
            chart: msg.chart ?? null,
            data: msg.data ?? null,
            clarification: msg.clarification ?? null,
          }))
        : [],
    }));

    const activeId = typeof parsed.activeId === "string" ? parsed.activeId : "";
    return { conversations, activeId };
  } catch {
    return null;
  }
}

function isPipeRow(line: string) {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return false;
  const pipeCount = (trimmed.match(/\|/g) || []).length;
  return pipeCount >= 2;
}

function isSeparatorRow(line: string) {
  const trimmed = line.trim();
  return /^[:\-\s|]+$/.test(trimmed) && trimmed.includes("-");
}

function toBulletPoints(text: string) {
  const parts = text
    .split(/(?<=[.!?])\s+|;\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length <= 1) {
    return `- ${text.trim()}`;
  }

  return parts.map((part) => `- ${part}`).join("\n");
}

function normalizeInsightLists(content: string) {
  let normalized = content;

  // Convert bullet symbol to markdown list bullet so ReactMarkdown renders proper lists.
  normalized = normalized.replace(/^[ \t]*•\s+/gm, "- ");

  // Convert one-line insight paragraph into bullet points.
  normalized = normalized.replace(
    /^(\s*(?:💡\s*)?(?:\*\*)?Insights?(?:\*\*)?\s*:\s*)(.+)$/gim,
    (_match, heading: string, body: string) => {
      const cleanedBody = body.trim();
      if (!cleanedBody || cleanedBody.startsWith("- ")) return `${heading}${cleanedBody}`;
      return `${heading}\n${toBulletPoints(cleanedBody)}`;
    }
  );

  return normalized;
}

function normalizeClarification(raw: unknown): ClarificationData | null {
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const stepsRaw = Array.isArray(obj.steps) ? obj.steps : [];
    const normalizedSteps = stepsRaw
      .map((step) => {
        const stepObj = step as Record<string, unknown>;
        const optionsRaw = Array.isArray(stepObj.options) ? stepObj.options : [];
        const options = optionsRaw
          .map((opt) => {
            const optObj = opt as Record<string, unknown>;
            const value = String(optObj.value ?? "").trim();
            const label = String(optObj.label ?? value).trim();
            const description = typeof optObj.description === "string" ? optObj.description : null;
            if (!value || !label) return null;
            return { value, label, description } as ClarificationOption;
          })
          .filter((x): x is ClarificationOption => x !== null);
        const id = String(stepObj.id ?? "").trim();
        const question = String(stepObj.question ?? "").trim();
        if (!id || !question || options.length === 0) return null;
        return { id, question, options } as ClarificationStep;
      })
      .filter((x): x is ClarificationStep => x !== null);

    const message = String(obj.message ?? "").trim();
    if (message && normalizedSteps.length > 0) {
      return { message, steps: normalizedSteps };
    }
  }

  return null;
}

function extractInsightSection(content: string) {
  const lines = content.split("\n");
  const headingRegex = /^\s*(?:💡\s*)?(?:\*\*)?Insights?(?:\*\*)?\s*:?\s*$/i;
  const bulletRegex = /^\s*(?:[-*]|\d+\.)\s+(.+)$/;

  let headingIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (headingRegex.test(lines[i])) {
      headingIndex = i;
      break;
    }
  }

  if (headingIndex === -1) return null;

  const points: string[] = [];
  let currentPoint = "";
  let pointer = headingIndex + 1;
  let started = false;

  while (pointer < lines.length) {
    const line = lines[pointer];
    const trimmed = line.trim();
    const bulletMatch = line.match(bulletRegex);

    if (bulletMatch) {
      if (currentPoint) points.push(currentPoint.trim());
      currentPoint = bulletMatch[1].trim();
      started = true;
      pointer += 1;
      continue;
    }

    if (/^\s{2,}\S/.test(line) && currentPoint) {
      currentPoint += ` ${trimmed}`;
      pointer += 1;
      continue;
    }

    if (trimmed === "") {
      if (currentPoint) {
        points.push(currentPoint.trim());
        currentPoint = "";
      }
      pointer += 1;
      if (started) break;
      continue;
    }

    if (started) break;
    return null;
  }

  if (currentPoint) points.push(currentPoint.trim());

  const cleanedPoints = points
    .map((point) => point.replace(/\*\*/g, "").trim())
    .filter((point) => point.length > 0 && point !== "-" && point !== "•");

  if (cleanedPoints.length === 0) return null;

  return {
    before: lines.slice(0, headingIndex).join("\n").trim(),
    points: cleanedPoints,
    after: lines.slice(pointer).join("\n").trim(),
  };
}

function parseInsightCard(point: string) {
  const clean = point.replace(/\*\*/g, "").trim();
  if (!clean || clean === "-" || clean === "•") return null;

  const colonMatch = clean.match(/^([^:]+):\s*(.+)$/);
  if (colonMatch) {
    return { value: colonMatch[1].trim(), label: colonMatch[2].trim() };
  }

  const metricMatch = clean.match(/^([+\-]?\$?\d[\d.,]*(?:\.\d+)?(?:[KMBT]|%|bn|jt|miliar|triliun)?)\s+(.+)$/i);
  if (metricMatch) {
    return { value: metricMatch[1].trim(), label: metricMatch[2].trim() };
  }

  return { value: clean, label: "" };
}

function isSeparatorCell(cell: string) {
  return /^:?-{3,}:?$/.test(cell.trim());
}

function rebuildCollapsedPipeTableLine(line: string) {
  const pipeCount = (line.match(/\|/g) || []).length;
  if (pipeCount < 8 || !line.includes("|---")) return null;

  const firstPipe = line.indexOf("|");
  const lastPipe = line.lastIndexOf("|");
  if (firstPipe < 0 || lastPipe <= firstPipe) return null;

  const prefix = line.slice(0, firstPipe).trim();
  const suffix = line.slice(lastPipe + 1).trim();
  const tableRaw = line.slice(firstPipe, lastPipe + 1);

  const tokens = tableRaw.split("|").map((t) => t.trim());
  while (tokens.length > 0 && tokens[0] === "") tokens.shift();
  while (tokens.length > 0 && tokens[tokens.length - 1] === "") tokens.pop();
  if (tokens.length < 6) return null;

  const separatorStart = tokens.findIndex(isSeparatorCell);
  if (separatorStart < 2) return null;

  let separatorEnd = separatorStart;
  while (separatorEnd < tokens.length && isSeparatorCell(tokens[separatorEnd])) {
    separatorEnd += 1;
  }

  const columnCount = separatorStart;
  if (columnCount < 2) return null;

  const headerCells = tokens.slice(0, columnCount);
  if (headerCells.every((cell) => cell.length === 0)) return null;

  const dataTokens = tokens.slice(separatorEnd);
  if (dataTokens.length < columnCount) return null;

  const rows: string[][] = [];
  for (let i = 0; i < dataTokens.length; i += columnCount) {
    const row = dataTokens.slice(i, i + columnCount);
    if (row.length < columnCount) break;
    rows.push(row);
  }
  if (rows.length === 0) return null;

  const tableLines = [
    `| ${headerCells.join(" | ")} |`,
    `| ${new Array(columnCount).fill("---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ];

  const parts = [];
  if (prefix) parts.push(prefix);
  parts.push(tableLines.join("\n"));
  if (suffix) parts.push(suffix);
  return parts.join("\n\n");
}

function normalizeCollapsedPipeTables(content: string) {
  const lines = content.split("\n");
  const out: string[] = [];

  for (const line of lines) {
    const rebuilt = rebuildCollapsedPipeTableLine(line);
    if (!rebuilt) {
      out.push(line);
      continue;
    }
    out.push(...rebuilt.split("\n"));
  }

  return out.join("\n");
}

function normalizeMarkdownTables(content: string) {
  const collapsedFixed = normalizeCollapsedPipeTables(content);
  const lines = collapsedFixed.split("\n");
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prev = i > 0 ? lines[i - 1] : "";
    const next = i < lines.length - 1 ? lines[i + 1] : "";

    out.push(line);

    const isTableStart =
      isPipeRow(line) &&
      isPipeRow(next) &&
      !isSeparatorRow(line) &&
      !isSeparatorRow(next) &&
      (!isPipeRow(prev) || prev.trim() === "");

    if (isTableStart) {
      const cells = line
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((cell) => cell.trim())
        .filter((cell) => cell.length > 0);

      if (cells.length >= 2) {
        out.push(`| ${cells.map(() => "---").join(" | ")} |`);
      }
    }
  }

  return out.join("\n");
}

/* ── Virtual Pivot Table ────────────────────────────────────────────
   Renders markdown tables with > VIRTUAL_TABLE_THRESHOLD rows using a
   virtual scroll window so only ~20 rows are in the DOM at a time.
   Without this, a 200-row × 60-col pivot = 12 000 DOM nodes → UI freeze.
──────────────────────────────────────────────────────────────────── */

interface ParsedTableData {
  headers: string[];
  alignments: ("left" | "right" | "center")[];
  rows: string[][];
}

function parseMdTableLines(lines: string[]): ParsedTableData | null {
  const tableLines = lines.filter(l => isPipeRow(l));
  if (tableLines.length < 3) return null;
  const sepIdx = tableLines.findIndex(l => isSeparatorRow(l));
  if (sepIdx < 1) return null;
  const parseCells = (line: string) =>
    line.replace(/^\||\|$/g, "").split("|").map(c => c.trim());
  const headers = parseCells(tableLines[0]);
  const alignments = parseCells(tableLines[sepIdx]).map(c => {
    if (c.startsWith(":") && c.endsWith(":")) return "center" as const;
    if (c.endsWith(":")) return "right" as const;
    return "left" as const;
  });
  const rows = tableLines.slice(sepIdx + 1).map(parseCells);
  return { headers, alignments, rows };
}

interface MdSegProse { kind: "prose"; text: string }
interface MdSegTable { kind: "table"; lines: string[] }
interface MdSegHtmlTable { kind: "html_table"; html: string }
type MdSegment = MdSegProse | MdSegTable | MdSegHtmlTable;

function splitMdSegments(content: string): MdSegment[] {
  const lines = content.split("\n");
  const out: MdSegment[] = [];
  let prose: string[] = [];
  let table: string[] = [];
  let htmlTable: string[] = [];
  let inTable = false;
  let inHtmlTable = false;
  const flushProse = () => { const t = prose.join("\n"); if (t.trim()) out.push({ kind: "prose", text: t }); prose = []; };
  const flushTable = () => { if (table.length) { out.push({ kind: "table", lines: [...table] }); table = []; } };
  const flushHtmlTable = () => { if (htmlTable.length) { out.push({ kind: "html_table", html: htmlTable.join("\n") }); htmlTable = []; } };
  for (const line of lines) {
    const trimmed = line.trim();
    if (!inHtmlTable && trimmed === "<table>") {
      flushProse();
      flushTable(); inTable = false;
      inHtmlTable = true;
      htmlTable.push(line);
    } else if (inHtmlTable) {
      htmlTable.push(line);
      if (trimmed === "</table>") { inHtmlTable = false; flushHtmlTable(); }
    } else if (isPipeRow(line)) {
      if (!inTable) { flushProse(); inTable = true; }
      table.push(line);
    } else {
      if (inTable) { flushTable(); inTable = false; }
      prose.push(line);
    }
  }
  if (inHtmlTable) flushHtmlTable();
  else if (inTable) flushTable();
  else flushProse();
  return out;
}

const VIRTUAL_TABLE_THRESHOLD = 30;
const VIRTUAL_ROW_H = 38;
const VIRTUAL_VIEWPORT_H = 520;

function VirtualPivotTable({ data }: { data: ParsedTableData }) {
  const [scrollTop, setScrollTop] = useState(0);
  const totalRows = data.rows.length;
  const buffer = Math.ceil(VIRTUAL_VIEWPORT_H / VIRTUAL_ROW_H) + 4;
  const startIdx = Math.max(0, Math.floor(scrollTop / VIRTUAL_ROW_H) - 2);
  const endIdx = Math.min(totalRows, startIdx + buffer);
  const padTop = startIdx * VIRTUAL_ROW_H;
  const padBot = Math.max(0, (totalRows - endIdx) * VIRTUAL_ROW_H);

  return (
    <div style={{ margin: "10px 0", border: "1px solid #3c3c3c", borderRadius: 10, background: "#252525", overflow: "hidden" }}>
      <div
        style={{ overflowX: "auto", overflowY: "auto", maxHeight: VIRTUAL_VIEWPORT_H }}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      >
        <table style={{ width: "max-content", minWidth: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <thead style={{ background: "#2e2b28", position: "sticky", top: 0, zIndex: 2 }}>
            <tr>
              {data.headers.map((h, i) => (
                <th key={i} style={{
                  borderBottom: "2px solid #3c3c3c", borderRight: "1px solid #3c3c3c",
                  padding: "8px 10px", fontWeight: 600, fontSize: "0.85rem",
                  color: "#ece7db", whiteSpace: "nowrap", background: "#2e2b28",
                  textAlign: data.alignments[i],
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {padTop > 0 && <tr style={{ height: padTop }}><td colSpan={data.headers.length} /></tr>}
            {data.rows.slice(startIdx, endIdx).map((row, ri) => (
              <tr key={startIdx + ri} style={{ height: VIRTUAL_ROW_H }}>
                {data.headers.map((_, ci) => (
                  <td key={ci} style={{
                    borderBottom: "1px solid #343434", borderRight: "1px solid #343434",
                    padding: "6px 10px", fontSize: "0.85rem", color: "#d8d2c4",
                    background: "#252525", whiteSpace: "nowrap", textAlign: data.alignments[ci],
                  }}>{row[ci] ?? ""}</td>
                ))}
              </tr>
            ))}
            {padBot > 0 && <tr style={{ height: padBot }}><td colSpan={data.headers.length} /></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ padding: "5px 12px", fontSize: "0.74rem", color: "#888", borderTop: "1px solid #343434", background: "#232323" }}>
        {totalRows} baris · {data.headers.length} kolom · scroll untuk melihat semua data
      </div>
    </div>
  );
}

/* ── Virtual HTML Pivot Table ───────────────────────────────────────
   Parses an HTML <table> with nested headers (rowspan/colspan) and
   renders it with virtual scrolling so large pivots don't freeze the UI.
──────────────────────────────────────────────────────────────────── */

interface HtmlPivotData {
  dimHeaders: string[];
  groupHeaders: { label: string; span: number }[];
  variantHeaders: string[];
  rows: string[][];
  colIsNumeric: boolean[];
}

function parseHtmlPivotTable(html: string): HtmlPivotData | null {
  if (typeof window === "undefined") return null;
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const thead = doc.querySelector("thead");
    const tbody = doc.querySelector("tbody");
    if (!thead) return null;
    const headerRows = thead.querySelectorAll("tr");
    if (headerRows.length < 2) return null;

    const dimHeaders: string[] = [];
    const groupHeaders: { label: string; span: number }[] = [];
    headerRows[0].querySelectorAll("th").forEach(th => {
      const rs = parseInt(th.getAttribute("rowspan") || "1");
      if (rs >= 2) {
        dimHeaders.push(th.textContent?.trim() || "");
      } else {
        const cs = parseInt(th.getAttribute("colspan") || "1");
        groupHeaders.push({ label: th.textContent?.trim() || "", span: cs });
      }
    });

    const variantHeaders: string[] = [];
    headerRows[1].querySelectorAll("th").forEach(th =>
      variantHeaders.push(th.textContent?.trim() || "")
    );

    const totalCols = dimHeaders.length + variantHeaders.length;
    const colIsNumeric = new Array(totalCols).fill(false);
    const rows: string[][] = [];
    tbody?.querySelectorAll("tr").forEach(tr => {
      const cells: string[] = [];
      tr.querySelectorAll("td").forEach((td, ci) => {
        cells.push(td.textContent?.trim() || "");
        if (!colIsNumeric[ci] && (td.getAttribute("style") || "").includes("right"))
          colIsNumeric[ci] = true;
      });
      rows.push(cells);
    });

    return { dimHeaders, groupHeaders, variantHeaders, rows, colIsNumeric };
  } catch {
    return null;
  }
}

function VirtualHtmlPivotTable({ html }: { html: string }) {
  const [scrollTop, setScrollTop] = useState(0);
  const data = React.useMemo(() => parseHtmlPivotTable(html), [html]);

  if (!data) return null;

  const totalRows = data.rows.length;
  const totalCols = data.dimHeaders.length + data.variantHeaders.length;
  const buffer = Math.ceil(VIRTUAL_VIEWPORT_H / VIRTUAL_ROW_H) + 4;
  const startIdx = Math.max(0, Math.floor(scrollTop / VIRTUAL_ROW_H) - 2);
  const endIdx = Math.min(totalRows, startIdx + buffer);
  const padTop = startIdx * VIRTUAL_ROW_H;
  const padBot = Math.max(0, (totalRows - endIdx) * VIRTUAL_ROW_H);

  const TH_STYLE: React.CSSProperties = {
    borderBottom: "1px solid #3c3c3c", borderRight: "1px solid #3c3c3c",
    padding: "8px 10px", fontWeight: 600, fontSize: "0.85rem",
    color: "#ece7db", whiteSpace: "nowrap", background: "#2e2b28",
  };

  return (
    <div style={{ margin: "10px 0", border: "1px solid #3c3c3c", borderRadius: 10, background: "#252525", overflow: "hidden" }}>
      <div
        style={{ overflowX: "auto", overflowY: "auto", maxHeight: VIRTUAL_VIEWPORT_H }}
        onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
      >
        <table style={{ width: "max-content", minWidth: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <thead style={{ background: "#2e2b28", position: "sticky", top: 0, zIndex: 2 }}>
            <tr>
              {data.dimHeaders.map((h, i) => (
                <th key={`d${i}`} rowSpan={2} style={TH_STYLE}>{h}</th>
              ))}
              {data.groupHeaders.map((g, i) => (
                <th key={`g${i}`} colSpan={g.span} style={{ ...TH_STYLE, textAlign: "center" }}>{g.label}</th>
              ))}
            </tr>
            <tr>
              {data.variantHeaders.map((v, i) => (
                <th key={`v${i}`} style={TH_STYLE}>{v || " "}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {padTop > 0 && <tr style={{ height: padTop }}><td colSpan={totalCols} /></tr>}
            {data.rows.slice(startIdx, endIdx).map((row, ri) => (
              <tr key={startIdx + ri} style={{ height: VIRTUAL_ROW_H }}>
                {row.map((cell, ci) => (
                  <td key={ci} style={{
                    borderBottom: "1px solid #343434", borderRight: "1px solid #343434",
                    padding: "6px 10px", fontSize: "0.85rem", color: "#d8d2c4",
                    background: "#252525", whiteSpace: "nowrap",
                    textAlign: data.colIsNumeric[ci] ? "right" : "left",
                  }}>{cell}</td>
                ))}
              </tr>
            ))}
            {padBot > 0 && <tr style={{ height: padBot }}><td colSpan={totalCols} /></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ padding: "5px 12px", fontSize: "0.74rem", color: "#888", borderTop: "1px solid #343434", background: "#232323" }}>
        {totalRows} baris · {totalCols} kolom · scroll untuk melihat semua data
      </div>
    </div>
  );
}

/* ── Shared markdown component map (defined once, not per-render) ── */
const MD_COMPONENTS: Components = {
    p: ({ children }) => (
      <p style={{ margin: "0 0 10px 0" }}>{children}</p>
    ),
    ul: ({ children }) => (
      <ul style={{ margin: "0 0 10px 20px", padding: 0 }}>{children}</ul>
    ),
    ol: ({ children }) => (
      <ol style={{ margin: "0 0 10px 20px", padding: 0 }}>{children}</ol>
    ),
    li: ({ children }) => (
      <li style={{ marginBottom: 4 }}>{children}</li>
    ),
    table: ({ children }) => (
      <div
        style={{
          margin: "10px 0",
          overflowX: "auto",
          border: "1px solid #3c3c3c",
          borderRadius: 10,
          background: "#252525",
        }}
      >
        <table
          style={{
            width: "max-content",
            minWidth: "100%",
            borderCollapse: "separate",
            borderSpacing: 0,
            tableLayout: "auto",
          }}
        >
          {children}
        </table>
      </div>
    ),
    thead: ({ children }) => (
      <thead style={{ background: "#2e2b28" }}>{children}</thead>
    ),
    tr: ({ children }) => (
      <tr style={{ borderBottom: "1px solid #3c3c3c" }}>{children}</tr>
    ),
    th: ({ children, colSpan, rowSpan, style }) => (
      <th
        colSpan={colSpan}
        rowSpan={rowSpan}
        style={{
          borderBottom: "1px solid #3c3c3c",
          borderRight: "1px solid #3c3c3c",
          padding: "8px 10px",
          textAlign: "left",
          fontWeight: 600,
          fontSize: "0.85rem",
          color: "#ece7db",
          whiteSpace: "nowrap",
          wordBreak: "normal",
          ...(style && typeof style === "object" ? style : {}),
        }}
      >
        {children}
      </th>
    ),
    td: ({ children, colSpan, rowSpan, style }) => (
      <td
        colSpan={colSpan}
        rowSpan={rowSpan}
        style={{
          borderBottom: "1px solid #343434",
          borderRight: "1px solid #343434",
          padding: "8px 10px",
          verticalAlign: "top",
          fontSize: "0.85rem",
          color: "#d8d2c4",
          background: "#252525",
          whiteSpace: "nowrap",
          wordBreak: "normal",
          ...(style && typeof style === "object" ? style : {}),
        }}
      >
        {children}
      </td>
    ),
    code: ({ children }) => (
      <code
        style={{
          background: "#2f2c29",
          color: "#f0eadc",
          borderRadius: 6,
          padding: "2px 6px",
          fontSize: "0.82rem",
          border: "1px solid #47413a",
        }}
      >
        {children}
      </code>
    ),
  };

function MarkdownMessage({ content }: { content: string }) {
  const normalizedContent = React.useMemo(
    () => normalizeMarkdownTables(normalizeInsightLists(content)),
    [content]
  );
  const segments = React.useMemo(() => splitMdSegments(normalizedContent), [normalizedContent]);
  const insight = React.useMemo(() => extractInsightSection(normalizedContent), [normalizedContent]);
  const insightCards = insight
    ? insight.points
        .map(parseInsightCard)
        .filter((card): card is { value: string; label: string } => card !== null && card.value.trim().length > 0)
    : [];
  const hasInsightCards = !!insight && insightCards.length > 0;

  const renderSegments = (segs: MdSegment[]) =>
    segs.map((seg, idx) => {
      if (seg.kind === "prose") {
        if (!seg.text.trim()) return null;
        return (
          <ReactMarkdown key={idx} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={MD_COMPONENTS}>
            {seg.text}
          </ReactMarkdown>
        );
      }
      // HTML pivot table (nested headers) — always use virtual scroll
      if (seg.kind === "html_table") {
        return <VirtualHtmlPivotTable key={idx} html={seg.html} />;
      }
      const tableData = parseMdTableLines(seg.lines);
      if (!tableData) {
        return (
          <ReactMarkdown key={idx} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={MD_COMPONENTS}>
            {seg.lines.join("\n")}
          </ReactMarkdown>
        );
      }
      if (tableData.rows.length > VIRTUAL_TABLE_THRESHOLD) {
        return <VirtualPivotTable key={idx} data={tableData} />;
      }
      return (
        <ReactMarkdown key={idx} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={MD_COMPONENTS}>
          {seg.lines.join("\n")}
        </ReactMarkdown>
      );
    });

  if (hasInsightCards && insight) {
    const beforeSegs = splitMdSegments(insight.before || "");
    const afterSegs = splitMdSegments(insight.after || "");
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {renderSegments(beforeSegs)}
        <div style={{ background: "#ffffff", border: "1px solid #ffb596", borderRadius: 14, padding: "14px 14px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ color: "#d66b3d", fontSize: "0.78rem", letterSpacing: "0.08em", fontWeight: 700, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6 }}>
            <span>✦</span><span>Insight</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
            {insightCards.map((card, idx) => (
              <div key={`${idx}-${card.value}`} style={{ borderRadius: 12, border: "1px solid #ffc4a8", background: "#FFEDE7", padding: "12px 14px" }}>
                <div style={{ color: "#cb6034", fontSize: "1.22rem", fontWeight: 700, lineHeight: 1.3 }}>{card.value}</div>
                {!!card.label && <div style={{ marginTop: 4, color: "#7e604e", fontSize: "0.86rem", lineHeight: 1.5 }}>{card.label}</div>}
              </div>
            ))}
          </div>
        </div>
        {renderSegments(afterSegs)}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {renderSegments(segments)}
    </div>
  );
}

/* ─────────────────────────── Main Page ─────────────────────────── */
export default function ChatPage() {
  const router = useRouter();
  const [token, setToken] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");
  const [userName, setUserName] = useState<string>("");
  const [sessionGreeting] = useState<string>(() => getTimeGreeting(new Date()));
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [streaming, setStreaming] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [historyReady, setHistoryReady] = useState(false);
  const [authReady, setAuthReady] = useState(false);

  /* ── Cache panel state ── */
  const [cacheStats, setCacheStats] = useState<Record<string, unknown> | null>(null);
  const [cacheLoading, setCacheLoading] = useState(false);
  const [cachePanelOpen, setCachePanelOpen] = useState(false);

  /* ── LangChain panel state ── */
  const [lcLoading, setLcLoading] = useState(false);
  const [lcPanelOpen, setLcPanelOpen] = useState(false);
  // GET /v1/chat/langchain — all conversation IDs with message counts
  const [lcAllConvs, setLcAllConvs] = useState<Record<string, unknown>[] | null>(null);
  const [lcAllConvsOpen, setLcAllConvsOpen] = useState(false);
  // GET /v1/chat/langchain/{id}/summary — summary for active conv
  const [lcSummary, setLcSummary] = useState<Record<string, unknown> | string | null>(null);
  // GET /v1/chat/langchain/{id}/messages — messages for active conv
  const [lcMessages, setLcMessages] = useState<Record<string, unknown>[] | null>(null);

  /* ── Streaming mode toggle ── */
  const [useStream] = useState(false);

  /* ── Clarification panel ── */
  const [activeClarification, setActiveClarification] = useState<ClarificationData | null>(null);

  /* ── Confirm modal (for DANGEROUS delete-all actions) ── */
  type ConfirmAction = "deleteAllLC" | "deleteAllHistory" | null;
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [confirmInput, setConfirmInput] = useState("");

  /* ── Delete-before-timestamp modal ── */
  const [deleteBeforeModal, setDeleteBeforeModal] = useState(false);
  const [deleteBeforeConvId, setDeleteBeforeConvId] = useState("");
  const [deleteBeforeTs, setDeleteBeforeTs] = useState("");
  const [deleteBeforeLoading, setDeleteBeforeLoading] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  /* ── File upload context ── */
  type ActiveFile = { fileId: string; filename: string; status: "uploading" | "ready" | "error" };
  const [activeFile, setActiveFile] = useState<ActiveFile | null>(null);
  const [fileUploadError, setFileUploadError] = useState<string | null>(null);

  /* ── Auth guard ── */
  useEffect(() => {
    let cancelled = false;

    const fetchCurrentUser = async (t: string, resolvedEmail: string) => {
      try {
        const res = await fetch(`${API_BASE}/auth/me`, {
          headers: { Authorization: `Bearer ${t}` },
        });
        if (!res.ok) return;
        const me = await res.json() as { username?: string | null; email?: string | null };
        const resolvedName = (me.username ?? "").trim();
        if (resolvedName) {
          setUserName(resolvedName);
          return;
        }
        const emailForFallback = (me.email ?? resolvedEmail).trim();
        const localPart = emailForFallback.split("@")[0]?.trim() ?? "";
        if (localPart) setUserName(localPart);
      } catch {
        // ignore; UI will use fallback
      }
    };

    const bootstrapHistory = async (t: string, resolvedEmail: string) => {
      try {
        const res = await fetch(`${API_BASE}/chat/langchain`, {
          headers: { Authorization: `Bearer ${t}` },
        });
        if (res.ok) {
          const data = (await res.json()) as LangchainConversationListResponse | LangchainConversationMeta[];
          const items = Array.isArray(data)
            ? data
            : Array.isArray((data as LangchainConversationListResponse)?.conversations)
              ? (data as LangchainConversationListResponse).conversations ?? []
              : [];
          if (items.length > 0) {
            const mapped = items.map((item) => {
              const conversationId = String(
                item.conversationId ?? item.id ?? item.session_id ?? item.sessionId ?? ""
              );
              const fallbackTitle = "Riwayat chat";
              return {
                id: conversationId || uid(),
                apiConversationId: conversationId || undefined,
                title: fallbackTitle,
                messages: [],
                createdAt: item.lastActivity
                  ? new Date(item.lastActivity)
                  : item.last_activity
                    ? new Date(item.last_activity)
                    : new Date(),
              } as Conversation;
            });
            setConversations(mapped);
            setActiveId(mapped[0].id);
            setHistoryReady(true);

            // Update titles from latest human message in langchain_conversation_history (non-blocking)
            mapped.forEach(async (conv) => {
              if (!conv.apiConversationId) return;
              try {
                const messagesRes = await fetch(
                  `${API_BASE}/chat/langchain/${encodeURIComponent(conv.apiConversationId)}/messages?limit=50`,
                  { headers: { Authorization: `Bearer ${t}` } }
                );
                if (!messagesRes.ok) return;
                const messagesData = await messagesRes.json() as LangchainMessagesResponse;
                const rawMessages = Array.isArray(messagesData?.messages) ? messagesData.messages : [];

                // Cari message human terbaru dari room chat (session_id)
                const latestHuman = rawMessages
                  .slice()
                  .reverse()
                  .find((m) => {
                    const tpe = String(m.type ?? m.role ?? "").toLowerCase();
                    return tpe === "human" || tpe === "user";
                  });

                const latestQuestion = String(latestHuman?.content ?? "").trim();
                if (!latestQuestion) return;

                const title = toConversationTitle(latestQuestion, conv.title);
                setConversations((prev) =>
                  prev.map((c) =>
                    c.id !== conv.id ? c : { ...c, title }
                  )
                );
              } catch {
                // ignore title update failures
              }
            });
            return;
          }
        }
      } catch {
        // fallback to local storage
      }

      const storageKey = buildHistoryStorageKey(resolvedEmail);
      const stored = hydrateHistory(localStorage.getItem(storageKey));
      if (stored?.conversations.length) {
        setConversations(stored.conversations);
        const hasActive = stored.conversations.some((c) => c.id === stored.activeId);
        setActiveId(hasActive ? stored.activeId : stored.conversations[0].id);
      } else {
        // start with a fresh conversation
        const first = newConversation();
        setConversations([first]);
        setActiveId(first.id);
      }
      setHistoryReady(true);
    };

    const initAuth = async () => {
      // Retry a few times to avoid redirect race right after login.
      let tokenFromCookie = "";
      for (let i = 0; i < 40; i++) {
        tokenFromCookie = getAccessTokenFromCookie() ?? "";
        if (tokenFromCookie) break;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }

      if (!tokenFromCookie) {
        if (!cancelled) {
          setAuthReady(true);
          setHistoryReady(true);
          const first = newConversation();
          setConversations([first]);
          setActiveId(first.id);
          setToast({ type: "error", message: "Sesi belum terbaca dari cookie. Silakan login ulang." });
        }
        return;
      }

      if (cancelled) return;
      setToken(tokenFromCookie);

      // decode email from JWT payload (base64)
      let resolvedEmail = "User";
      try {
        const payload = JSON.parse(atob(tokenFromCookie.split(".")[1]));
        resolvedEmail = payload?.sub ?? payload?.email ?? "User";
      } catch {
        resolvedEmail = "User";
      }
      if (cancelled) return;
      setUserEmail(resolvedEmail);

      fetchCurrentUser(tokenFromCookie, resolvedEmail);
      bootstrapHistory(tokenFromCookie, resolvedEmail);
      setAuthReady(true);
    };

    initAuth();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Persist history locally ── */
  useEffect(() => {
    if (!historyReady || !userEmail) return;
    const storageKey = buildHistoryStorageKey(userEmail);
    persistHistorySafely(storageKey, conversations, activeId);
  }, [conversations, activeId, historyReady, userEmail]);

  /* ── Scroll to bottom when messages change ── */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversations, activeId]);

  /* ── Reset file context when switching conversations ── */
  useEffect(() => {
    setActiveFile(null);
    setFileUploadError(null);
  }, [activeId]);


  /* ── Helpers ── */
  function newConversation(): Conversation {
    return {
      id: uid(),
      apiConversationId: uid(),
      title: "Percakapan baru",
      messages: [],
      createdAt: new Date(),
    };
  }

  const activeConv = conversations.find((c) => c.id === activeId);
  const heroUserName = userName.trim() || userEmail.split("@")[0]?.trim() || "User";

  function handleNewChat() {
    const c = newConversation();
    setConversations((prev) => [c, ...prev]);
    setActiveId(c.id);
  }

  /* ── Handle file upload for file-scoped chat ── */
  const handleFileUpload = useCallback(async (file: File) => {
    if (!token || !activeId) return;
    const currentApiConvId =
      conversations.find((c) => c.id === activeId)?.apiConversationId ?? activeId;

    setActiveFile({ fileId: "", filename: file.name, status: "uploading" });
    setFileUploadError(null);

    const formData = new FormData();
    formData.append("file", file);

    const url = `${API_BASE}/files/upload?autoIngest=true&conversationId=${encodeURIComponent(currentApiConvId)}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (data.ingestionResult?.status === "failed") {
        setActiveFile(null);
        setFileUploadError("Gagal memproses file: " + (data.ingestionResult.error ?? "Unknown error"));
        return;
      }
      setActiveFile({ fileId: data.fileId, filename: file.name, status: "ready" });
    } catch (err) {
      setActiveFile(null);
      setFileUploadError("Upload gagal: " + String(err));
    }
  }, [token, activeId, conversations]);

  /* ── Load history from API ── */
  const loadHistory = useCallback(async (conv: Conversation) => {
    if (!conv.apiConversationId || !token) return;
    try {
      const res = await fetch(
        `${API_BASE}/chat/history/${encodeURIComponent(conv.apiConversationId)}?limit=50`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) return; // silently ignore — history is optional
      const raw = await res.json();
      const historyMessages = normalizeHistoryMessages(raw);
      if (!historyMessages.length) return;
      setConversations((prev) =>
        prev.map((c) =>
          c.id !== conv.id ? c : { ...c, messages: historyMessages }
        )
      );
    } catch {
      // network failure — skip silently
    }
  }, [token]);

  /* ── Select a conversation (and lazily load its history) ── */
  const handleSelectConv = useCallback(async (conv: Conversation) => {
    setActiveId(conv.id);
    // Only fetch if the conversation has been saved to API but messages aren't loaded yet
    if (conv.apiConversationId && conv.messages.length === 0) {
      await loadHistory(conv);
    }
  }, [loadHistory]);

  /* ── Delete conversation — also removes from API if it has an apiConversationId ── */
  async function handleDeleteConv(id: string) {
    const conv = conversations.find((c) => c.id === id);

    // Call DELETE API if the conversation has been persisted
    if (conv?.apiConversationId && token) {
      try {
        const res = await fetch(
          `${API_BASE}/chat/history/${encodeURIComponent(conv.apiConversationId)}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          const reason = typeof body?.detail === "string" ? body.detail : `Error ${res.status}`;
          setToast({ type: "error", message: `Gagal menghapus riwayat: ${reason}` });
          return; // abort local deletion too so user knows it failed
        }
      } catch (err: unknown) {
        setToast({ type: "error", message: getErrorMessage(err, "Gagal menghubungi server.") });
        return;
      }
    }

    // Remove locally
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== id);
      if (activeId === id) {
        if (next.length > 0) setActiveId(next[0].id);
        else {
          const fresh = newConversation();
          setActiveId(fresh.id);
          return [fresh];
        }
      }
      return next;
    });
  }

  /* ── Cache: GET /v1/chat/cache/stats ── */
  async function handleFetchCacheStats() {
    setCacheLoading(true);
    try {
      const res = await fetch(`${API_BASE}/chat/cache/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const reason = typeof body?.detail === "string" ? body.detail : `Error ${res.status}`;
        setToast({ type: "error", message: `Gagal memuat cache stats: ${reason}` });
        return;
      }
      const data = await res.json();
      // API returns a string or object — normalise to object
      setCacheStats(typeof data === "string" ? { info: data } : data as Record<string, unknown>);
    } catch (err: unknown) {
      setToast({ type: "error", message: getErrorMessage(err, "Gagal menghubungi server.") });
    } finally {
      setCacheLoading(false);
    }
  }

  /* ── Cache: POST /v1/chat/cache/clear ── */
  async function handleClearCache() {
    setCacheLoading(true);
    try {
      const res = await fetch(`${API_BASE}/chat/cache/clear`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const reason = typeof body?.detail === "string" ? body.detail : `Error ${res.status}`;
        setToast({ type: "error", message: `Gagal menghapus cache: ${reason}` });
        return;
      }
      setToast({ type: "success", message: "Cache berhasil dibersihkan." });
      setCacheStats(null); // reset stats display
    } catch (err: unknown) {
      setToast({ type: "error", message: getErrorMessage(err, "Gagal menghubungi server.") });
    } finally {
      setCacheLoading(false);
    }
  }

  /* Toggle cache panel — auto-fetch stats on open */
  function handleToggleCachePanel() {
    const next = !cachePanelOpen;
    setCachePanelOpen(next);
    if (next && !cacheStats) handleFetchCacheStats();
  }

  /* ────────────────── LangChain handlers ────────────────── */

  /** GET /v1/chat/langchain — all conversation IDs with message counts */
  async function handleFetchLCConversations() {
    setLcLoading(true);
    try {
      const res = await fetch(`${API_BASE}/chat/langchain`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const reason = typeof body?.detail === "string" ? body.detail : `Error ${res.status}`;
        setToast({ type: "error", message: `Gagal memuat daftar percakapan: ${reason}` });
        return;
      }
      const data = await res.json();
      const list = Array.isArray(data)
        ? data as Record<string, unknown>[]
        : typeof data === "object" && data !== null
          ? [data as Record<string, unknown>]
          : [{ info: String(data) }];
      setLcAllConvs(list);
      setLcAllConvsOpen(true);
    } catch (err: unknown) {
      setToast({ type: "error", message: getErrorMessage(err, "Gagal menghubungi server.") });
    } finally {
      setLcLoading(false);
    }
  }

  /** GET /v1/chat/langchain/{id}/summary */
  async function handleFetchLCSummary(apiConvId: string) {
    setLcLoading(true);
    setLcSummary(null);
    try {
      const res = await fetch(
        `${API_BASE}/chat/langchain/${encodeURIComponent(apiConvId)}/summary`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const reason = typeof body?.detail === "string" ? body.detail : `Error ${res.status}`;
        setToast({ type: "error", message: `Gagal memuat summary: ${reason}` });
        return;
      }
      const data = await res.json();
      setLcSummary(
        typeof data === "string"
          ? data
          : data as Record<string, unknown>
      );
    } catch (err: unknown) {
      setToast({ type: "error", message: getErrorMessage(err, "Gagal menghubungi server.") });
    } finally {
      setLcLoading(false);
    }
  }

  /** GET /v1/chat/langchain/{id}/messages?limit=50 */
  async function handleFetchLCMessages(apiConvId: string) {
    setLcLoading(true);
    setLcMessages(null);
    try {
      const res = await fetch(
        `${API_BASE}/chat/langchain/${encodeURIComponent(apiConvId)}/messages?limit=50`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const reason = typeof body?.detail === "string" ? body.detail : `Error ${res.status}`;
        setToast({ type: "error", message: `Gagal memuat pesan LangChain: ${reason}` });
        return;
      }
      const data = await res.json();
      const list = Array.isArray(data) ? data as Record<string, unknown>[] : [];
      setLcMessages(list);
    } catch (err: unknown) {
      setToast({ type: "error", message: getErrorMessage(err, "Gagal menghubungi server.") });
    } finally {
      setLcLoading(false);
    }
  }

  /** DELETE /v1/chat/langchain/{id} — clear LangChain memory */
  async function handleClearLCMemory(apiConvId: string) {
    setLcLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/chat/langchain/${encodeURIComponent(apiConvId)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const reason = typeof body?.detail === "string" ? body.detail : `Error ${res.status}`;
        setToast({ type: "error", message: `Gagal menghapus memori: ${reason}` });
        return;
      }
      setToast({ type: "success", message: "Memori LangChain berhasil dihapus." });
      setLcSummary(null);
      setLcMessages(null);
    } catch (err: unknown) {
      setToast({ type: "error", message: getErrorMessage(err, "Gagal menghubungi server.") });
    } finally {
      setLcLoading(false);
    }
  }

  /** Toggle LC panel — reset sub-data when closing */
  function handleToggleLCPanel() {
    const next = !lcPanelOpen;
    setLcPanelOpen(next);
    if (!next) {
      setLcSummary(null);
      setLcMessages(null);
    }
  }

  /** DELETE /v1/chat/langchain?confirmation=DELETE_ALL — clears ALL LC memory */
  async function handleDeleteAllLC() {
    setLcLoading(true);
    try {
      const res = await fetch(`${API_BASE}/chat/langchain?confirmation=DELETE_ALL`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const reason = typeof body?.detail === "string" ? body.detail : `Error ${res.status}`;
        setToast({ type: "error", message: `Gagal menghapus semua memori LC: ${reason}` });
        return;
      }
      const data = await res.json();
      const msg = typeof data === "string" ? data : "Semua memori LangChain berhasil dihapus.";
      setToast({ type: "success", message: msg });
      setLcAllConvs(null);
      setLcSummary(null);
      setLcMessages(null);
      // Clear all local apiConversationIds since LC memory is gone
      setConversations(prev => prev.map(c => ({ ...c, apiConversationId: undefined })));
    } catch (err: unknown) {
      setToast({ type: "error", message: getErrorMessage(err, "Gagal menghubungi server.") });
    } finally {
      setLcLoading(false);
    }
  }

  /** DELETE /v1/chat/history?confirmation=DELETE_ALL — clears ALL conversation history */
  async function handleDeleteAllHistory() {
    setLcLoading(true);
    try {
      const res = await fetch(`${API_BASE}/chat/history?confirmation=DELETE_ALL`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const reason = typeof body?.detail === "string" ? body.detail : `Error ${res.status}`;
        setToast({ type: "error", message: `Gagal menghapus semua riwayat: ${reason}` });
        return;
      }
      const data = await res.json();
      const msg = typeof data === "string" ? data : "Semua riwayat percakapan berhasil dihapus.";
      setToast({ type: "success", message: msg });
      // Reset all local conversations
      const fresh = newConversation();
      setConversations([fresh]);
      setActiveId(fresh.id);
      if (userEmail) {
        const storageKey = buildHistoryStorageKey(userEmail);
        localStorage.removeItem(storageKey);
      }
    } catch (err: unknown) {
      setToast({ type: "error", message: getErrorMessage(err, "Gagal menghubungi server.") });
    } finally {
      setLcLoading(false);
    }
  }

  /** DELETE /v1/chat/history/{id}/before/{timestamp} */
  async function handleDeleteHistoryBefore() {
    if (!deleteBeforeConvId.trim() || !deleteBeforeTs.trim()) {
      setToast({ type: "error", message: "Isi Conversation ID dan timestamp terlebih dahulu." });
      return;
    }
    setDeleteBeforeLoading(true);
    try {
      const encodedConvId = encodeURIComponent(deleteBeforeConvId.trim());
      const encodedTs = encodeURIComponent(deleteBeforeTs.trim());
      const res = await fetch(
        `${API_BASE}/chat/history/${encodedConvId}/before/${encodedTs}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const reason = typeof body?.detail === "string" ? body.detail : `Error ${res.status}`;
        setToast({ type: "error", message: `Gagal menghapus riwayat: ${reason}` });
        return;
      }
      const data = await res.json();
      const msg = typeof data === "string" ? data : "Riwayat sebelum timestamp berhasil dihapus.";
      setToast({ type: "success", message: msg });
      setDeleteBeforeModal(false);
      setDeleteBeforeConvId("");
      setDeleteBeforeTs("");
    } catch (err: unknown) {
      setToast({ type: "error", message: getErrorMessage(err, "Gagal menghubungi server.") });
    } finally {
      setDeleteBeforeLoading(false);
    }
  }

  /** Confirm modal dispatcher */
  function handleConfirmAction() {
    if (confirmInput !== "DELETE_ALL") {
      setToast({ type: "error", message: 'Ketik "DELETE_ALL" untuk konfirmasi.' });
      return;
    }
    setConfirmAction(null);
    setConfirmInput("");
    if (confirmAction === "deleteAllLC") handleDeleteAllLC();
    else if (confirmAction === "deleteAllHistory") handleDeleteAllHistory();
  }

  function handleLogout() {
    // Clear access token cookie and redirect to signin
    clearAccessTokenCookie();
    router.push("/signin");
  }

  /* ── Send message ── */
  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;

    const userMsg: Message = {
      id: uid(), role: "user", content: trimmed, createdAt: new Date(),
    };

    // Ambil apiConversationId SEBELUM setConversations (state updater berjalan async)
    const currentApiConvId =
      conversations.find((c) => c.id === activeId)?.apiConversationId ?? uid();

    // Optimistic update — add user message
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== activeId) return c;
        const isFirst = c.messages.length === 0;
        return {
          ...c,
          title: isFirst ? trimmed.slice(0, 45) + (trimmed.length > 45 ? "…" : "") : c.title,
          messages: [...c.messages, userMsg],
        };
      })
    );
    setActiveClarification(null);
    setStreaming(true);

    // Add empty assistant placeholder
    const assistantId = uid();
    setConversations((prev) =>
      prev.map((c) =>
        c.id !== activeId ? c : {
          ...c,
          messages: [...c.messages, {
            id: assistantId, role: "assistant",
            content: "", createdAt: new Date(),
          }],
        }
      )
    );

    try {
      const reqBody: ChatApiRequest = {
        message: trimmed,
        useLangChainMemory: true,
        conversationId: currentApiConvId,
        responseMode: { includeChartSpec: true },
        context: activeFile?.status === "ready" ? { fileIds: [activeFile.fileId] } : undefined,
      };

      // ── SSE streaming mode via EventSource ──
      if (useStream) {
        const params = new URLSearchParams({
          message: trimmed,
          useLangChainMemory: "true",
          includeChartSpec: "true",
          token: token, // Include token for EventSource authentication
        });
        if (currentApiConvId) params.set("conversationId", currentApiConvId);
        const url = `${API_BASE}/chat/stream?${params.toString()}`;
        const es = new EventSource(url);
        let accumulated = "";

        es.onmessage = (event) => {
          try {
            const chunk = JSON.parse(event.data) as Record<string, unknown>;
            // types: 'start' | 'progress' | 'data' | 'end' | 'error'
            if (chunk.type === "data") {
              const payload = chunk.data as ChatApiResponse | undefined;
              const answer = payload?.answer ?? (chunk.answer as string | undefined) ?? "";
              const parsedClarification = normalizeClarification(
                payload?.clarification ?? payload?.clarification_data ?? payload?.description_clarification_section
              );
              accumulated = answer;
              setConversations((prev) =>
                prev.map((c) => {
                  if (c.id !== activeId) return c;
                  return {
                    ...c,
                    apiConversationId: (payload?.conversationId ?? c.apiConversationId),
                    messages: c.messages.map((m) =>
                      m.id !== assistantId ? m : {
                        ...m,
                        content: answer,
                        evidence: payload?.evidence ?? [],
                        suggestions: payload?.suggestions ?? [],
                        chart: payload?.chart ?? null,
                        data: payload?.data ?? null,
                        clarification: parsedClarification,
                      }
                    ),
                  };
                })
              );
              if (parsedClarification) setActiveClarification(parsedClarification);
            } else if (chunk.type === "progress") {
              // show progress stage as interim content
              const stage = String(chunk.stage ?? chunk.message ?? "");
              if (stage) {
                setConversations((prev) =>
                  prev.map((c) =>
                    c.id !== activeId ? c : {
                      ...c,
                      messages: c.messages.map((m) =>
                        m.id === assistantId ? { ...m, content: `⏳ ${stage}` } : m
                      ),
                    }
                  )
                );
              }
            } else if (chunk.type === "error") {
              const errMsg = String(chunk.message ?? chunk.error ?? "Terjadi kesalahan pada stream.");
              setConversations((prev) =>
                prev.map((c) =>
                  c.id !== activeId ? c : {
                    ...c,
                    messages: c.messages.map((m) =>
                      m.id === assistantId ? { ...m, content: `⚠ ${errMsg}` } : m
                    ),
                  }
                )
              );
              setToast({ type: "error", message: errMsg });
              es.close();
              setStreaming(false);
            } else if (chunk.type === "end" || chunk.done) {
              es.close();
              // If we never received a 'data' event, restore accumulated or leave as-is
              if (!accumulated) {
                setConversations((prev) =>
                  prev.map((c) =>
                    c.id !== activeId ? c : {
                      ...c,
                      messages: c.messages.map((m) =>
                        m.id === assistantId && m.content.startsWith("⏳")
                          ? { ...m, content: "✓ Selesai." }
                          : m
                      ),
                    }
                  )
                );
              }
              setStreaming(false);
            }
          } catch {
            // non-JSON chunk — ignore
          }
        };

        es.onerror = () => {
          es.close();
          setConversations((prev) =>
            prev.map((c) =>
              c.id !== activeId ? c : {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === assistantId && m.content === ""
                    ? { ...m, content: "⚠ Koneksi streaming terputus." }
                    : m
                ),
              }
            )
          );
          setToast({ type: "error", message: "Koneksi SSE terputus." });
          setStreaming(false);
        };

        return; // streaming takes over from here; finally will NOT call setStreaming(false)
      }

      // ── Standard JSON mode ──
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(reqBody),
      });

      // ── Error handling ──
      if (!res.ok) {
        let reason = `Error ${res.status}`;
        const body = await res.json().catch(() => null);
        if (res.status === 422) {
          const detail = body?.detail;
          if (Array.isArray(detail)) {
            // Tampilkan SEMUA info error dari FastAPI agar mudah debug
            reason = detail
              .map((item: unknown) => {
                const d = item as ApiErrorDetail;
                const loc = Array.isArray(d.loc) ? d.loc.join(" → ") : String(d.loc ?? "");
                return `[${loc}] ${d.msg ?? ""} (type: ${d.type ?? "-"})`;
              })
              .join("\n");
          } else if (typeof detail === "string") {
            reason = detail;
          } else {
            reason = JSON.stringify(body, null, 2);
          }
          // Log ke console agar bisa dilihat di DevTools
          console.error("422 Validation Error dari FastAPI:", JSON.stringify(body, null, 2));
          console.error("Request body yang dikirim:", JSON.stringify(reqBody, null, 2));
        } else {
          reason = typeof body?.detail === "string" ? body.detail : (JSON.stringify(body) ?? reason);
        }

        setConversations((prev) =>
          prev.map((c) =>
            c.id !== activeId ? c : {
              ...c,
              messages: c.messages.map((m) =>
                m.id === assistantId ? { ...m, content: `⚠ ${reason}` } : m
              ),
            }
          )
        );
        setToast({ type: "error", message: reason });
        return;
      }

      // ── Success 200 — parse JSON response ──
      const data: ChatApiResponse = await res.json();
      console.log("✅ Response dari backend:", JSON.stringify(data, null, 2));
      const parsedClarification = normalizeClarification(
        data.clarification ?? data.clarification_data ?? data.description_clarification_section
      );

      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== activeId) return c;
          return {
            ...c,
            // persist the API's conversationId for memory continuity
            apiConversationId: data.conversationId ?? c.apiConversationId,
            messages: c.messages.map((m) =>
              m.id !== assistantId ? m : {
                ...m,
                content: data.answer ?? "",
                evidence: data.evidence ?? [],
                suggestions: data.suggestions ?? [],
                chart: data.chart ?? null,
                data: data.data ?? null,
                clarification: parsedClarification,
              }
            ),
          };
        })
      );
      if (parsedClarification) setActiveClarification(parsedClarification);

    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "";
      const msg = errMsg === "Failed to fetch"
        ? "Tidak dapat menghubungi server. Pastikan backend berjalan di port 8001."
        : (errMsg || "Terjadi kesalahan jaringan.");
      setConversations((prev) =>
        prev.map((c) =>
          c.id !== activeId ? c : {
            ...c,
            messages: c.messages.map((m) =>
              m.id === assistantId ? { ...m, content: `⚠ ${msg}` } : m
            ),
          }
        )
      );
      setToast({ type: "error", message: msg });
    } finally {
      setStreaming(false);
    }
  }, [streaming, activeId, token, useStream, conversations]);

  /* ─────────────────────────── Render ─────────────────────────── */
  const hasMessages = (activeConv?.messages.length ?? 0) > 0;
  if (!authReady) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          width: "100vw",
          background: "#1a1a1a",
          color: "#d8d2c4",
          fontFamily: "'Inter', Tahoma, Geneva, Verdana, sans-serif",
        }}
      >
        Memuat sesi...
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", overflow: "hidden", fontFamily: "'Inter', Tahoma, Geneva, Verdana, sans-serif", background: "#1a1a1a" }}>

      {/* Toast */}
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* ══════════ SIDEBAR COMPONENT ══════════ */}
      <Sidebar
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        conversations={conversations}
        activeId={activeId}
        onSelectConv={handleSelectConv}
        onDeleteConv={handleDeleteConv}
        onNewChat={handleNewChat}
        userEmail={userEmail}
        onLogout={handleLogout}
      />

      {/* ══════════ MAIN CHAT AREA ══════════ */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>

        {/* Header Component */}
        <Header
          conversationTitle={activeConv?.title ?? "Chatbot"}
        />

        {/* ── All LangChain Conversations Modal ── */}
        {lcAllConvsOpen && (
          <div
            onClick={() => setLcAllConvsOpen(false)}
            style={{
              position: "fixed", inset: 0, zIndex: 8000,
              background: "rgba(0,0,0,0.45)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: "#1a1a2e", borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.1)",
                width: "min(520px, 92vw)", maxHeight: "75vh",
                display: "flex", flexDirection: "column",
                overflow: "hidden",
                boxShadow: "0 24px 48px rgba(0,0,0,0.4)",
              }}
            >
              {/* Modal header */}
              <div style={{
                padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
              }}>
                <span style={{ color: "#fff", fontWeight: 700, fontSize: "0.95rem" }}>🗂 Semua Percakapan LangChain</span>
                <button
                  onClick={() => setLcAllConvsOpen(false)}
                  style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: "1.2rem" }}
                >×</button>
              </div>

              {/* Modal body */}
              <div style={{ overflowY: "auto", padding: "14px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
                {!lcAllConvs || lcAllConvs.length === 0 ? (
                  <p style={{ color: "#8f8f8a", textAlign: "center", margin: "20px 0", fontSize: "0.875rem" }}>
                    Tidak ada percakapan ditemukan.
                  </p>
                ) : (
                  lcAllConvs.map((item, idx) => {
                    const convId = String(item.conversation_id ?? item.id ?? item.conversationId ?? `#${idx + 1}`);
                    const msgCount = item.message_count ?? item.count ?? item.messages ?? null;
                    const isActive = activeConv?.apiConversationId === convId;
                    return (
                      <div key={idx} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "10px 14px", borderRadius: 8,
                        background: isActive ? "rgba(254,108,17,0.12)" : "rgba(255,255,255,0.04)",
                        border: `1px solid ${isActive ? "rgba(254,108,17,0.35)" : "rgba(255,255,255,0.08)"}`,
                        gap: 10,
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{
                            margin: 0, color: isActive ? "#FE6C11" : "#d0d0d0",
                            fontSize: "0.8rem", fontWeight: isActive ? 600 : 400,
                            wordBreak: "break-all",
                          }}>{convId}</p>
                          {msgCount !== null && (
                            <p style={{ margin: "2px 0 0", color: "#8f8f8a", fontSize: "0.72rem" }}>
                              {String(msgCount)} pesan
                            </p>
                          )}
                          {isActive && (
                            <span style={{ fontSize: "0.68rem", color: "#FE6C11", fontWeight: 600 }}>● Aktif</span>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                          <button
                            onClick={() => { handleFetchLCSummary(convId); setLcAllConvsOpen(false); setLcPanelOpen(true); }}
                            style={{
                              padding: "4px 8px", borderRadius: 6,
                              background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.25)",
                              color: "#60a5fa", cursor: "pointer", fontSize: "0.7rem", fontFamily: "inherit",
                            }}
                          >Summary</button>
                          <button
                            onClick={async () => {
                              await handleClearLCMemory(convId);
                              handleFetchLCConversations();
                            }}
                            style={{
                              padding: "4px 8px", borderRadius: 6,
                              background: "rgba(255,68,0,0.12)", border: "1px solid rgba(255,68,0,0.3)",
                              color: "#ff6b4a", cursor: "pointer", fontSize: "0.7rem", fontFamily: "inherit",
                            }}
                          >Hapus</button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Modal footer */}
              <div style={{
                padding: "12px 20px",
                borderTop: "1px solid rgba(255,255,255,0.08)",
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap",
              }}>
                {/* Dangerous left-side actions */}
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={() => { setConfirmAction("deleteAllLC"); setConfirmInput(""); }}
                    disabled={lcLoading}
                    title="Hapus SEMUA memori LangChain"
                    style={{
                      padding: "7px 12px", borderRadius: 8,
                      background: "rgba(220,38,38,0.12)", border: "1px solid rgba(220,38,38,0.3)",
                      color: "#f87171", cursor: lcLoading ? "not-allowed" : "pointer",
                      fontSize: "0.78rem", fontFamily: "inherit", opacity: lcLoading ? 0.5 : 1,
                    }}
                  >⚠ Hapus Semua LC</button>
                  <button
                    onClick={() => { setConfirmAction("deleteAllHistory"); setConfirmInput(""); }}
                    disabled={lcLoading}
                    title="Hapus SEMUA riwayat percakapan"
                    style={{
                      padding: "7px 12px", borderRadius: 8,
                      background: "rgba(220,38,38,0.12)", border: "1px solid rgba(220,38,38,0.3)",
                      color: "#f87171", cursor: lcLoading ? "not-allowed" : "pointer",
                      fontSize: "0.78rem", fontFamily: "inherit", opacity: lcLoading ? 0.5 : 1,
                    }}
                  >⚠ Hapus Semua Riwayat</button>
                </div>
                {/* Right-side standard actions */}
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={handleFetchLCConversations}
                    disabled={lcLoading}
                    style={{
                      padding: "7px 14px", borderRadius: 8,
                      background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
                      color: "#c0c0c0", cursor: lcLoading ? "not-allowed" : "pointer",
                      fontSize: "0.8rem", fontFamily: "inherit", opacity: lcLoading ? 0.5 : 1,
                    }}
                  >🔄 Refresh</button>
                  <button
                    onClick={() => setLcAllConvsOpen(false)}
                    style={{
                      padding: "7px 14px", borderRadius: 8,
                      background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                      color: "#c0c0c0", cursor: "pointer", fontSize: "0.8rem", fontFamily: "inherit",
                    }}
                  >Tutup</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Confirm DELETE_ALL Modal ── */}
        {confirmAction !== null && (
          <div
            onClick={() => { setConfirmAction(null); setConfirmInput(""); }}
            style={{
              position: "fixed", inset: 0, zIndex: 9000,
              background: "rgba(0,0,0,0.6)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: "#1a1a2e", borderRadius: 14,
                border: "1px solid rgba(220,38,38,0.4)",
                width: "min(420px, 92vw)",
                padding: "28px 28px 24px",
                boxShadow: "0 24px 48px rgba(0,0,0,0.5)",
              }}
            >
              <div style={{ fontSize: "2rem", textAlign: "center", marginBottom: 10 }}>⚠️</div>
              <h2 style={{ margin: "0 0 8px", color: "#f87171", fontSize: "1rem", fontWeight: 700, textAlign: "center" }}>
                {confirmAction === "deleteAllLC"
                  ? "Hapus SEMUA Memori LangChain"
                  : "Hapus SEMUA Riwayat Percakapan"}
              </h2>
              <p style={{ margin: "0 0 18px", color: "#c0c0c0", fontSize: "0.85rem", textAlign: "center", lineHeight: 1.6 }}>
                Tindakan ini <strong style={{ color: "#f87171" }}>tidak dapat dibatalkan</strong> dan akan menghapus data seluruh pengguna.
                Ketik <code style={{ background: "rgba(255,255,255,0.08)", padding: "1px 6px", borderRadius: 4, color: "#fbbf24" }}>DELETE_ALL</code> untuk konfirmasi.
              </p>
              <input
                autoFocus
                value={confirmInput}
                onChange={e => setConfirmInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleConfirmAction(); if (e.key === "Escape") { setConfirmAction(null); setConfirmInput(""); } }}
                placeholder="DELETE_ALL"
                style={{
                  width: "100%", padding: "10px 12px", borderRadius: 8,
                  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)",
                  color: "#fff", fontSize: "0.9rem", fontFamily: "monospace",
                  outline: "none", boxSizing: "border-box", marginBottom: 16,
                }}
              />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  onClick={() => { setConfirmAction(null); setConfirmInput(""); }}
                  style={{
                    padding: "8px 18px", borderRadius: 8,
                    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                    color: "#c0c0c0", cursor: "pointer", fontSize: "0.85rem", fontFamily: "inherit",
                  }}
                >Batal</button>
                <button
                  onClick={handleConfirmAction}
                  disabled={confirmInput !== "DELETE_ALL"}
                  style={{
                    padding: "8px 18px", borderRadius: 8,
                    background: confirmInput === "DELETE_ALL" ? "#dc2626" : "rgba(220,38,38,0.2)",
                    border: "1px solid rgba(220,38,38,0.4)",
                    color: confirmInput === "DELETE_ALL" ? "#fff" : "#f87171",
                    cursor: confirmInput === "DELETE_ALL" ? "pointer" : "not-allowed",
                    fontSize: "0.85rem", fontFamily: "inherit", fontWeight: 600,
                    transition: "all .15s",
                  }}
                >Hapus Sekarang</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Delete History Before Timestamp Modal ── */}
        {deleteBeforeModal && (
          <div
            onClick={() => setDeleteBeforeModal(false)}
            style={{
              position: "fixed", inset: 0, zIndex: 9000,
              background: "rgba(0,0,0,0.55)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: "#1a1a2e", borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.1)",
                width: "min(440px, 92vw)",
                padding: "28px 28px 24px",
                boxShadow: "0 24px 48px rgba(0,0,0,0.45)",
              }}
            >
              <h2 style={{ margin: "0 0 6px", color: "#fff", fontSize: "1rem", fontWeight: 700 }}>
                🗓 Hapus Riwayat Sebelum Timestamp
              </h2>
              <p style={{ margin: "0 0 18px", color: "#8f8f8a", fontSize: "0.82rem", lineHeight: 1.5 }}>
                Menghapus pesan LangChain + AuditLog sebelum waktu yang ditentukan untuk satu percakapan.
              </p>
              <label style={{ display: "block", marginBottom: 14 }}>
                <span style={{ color: "#c0c0c0", fontSize: "0.8rem", display: "block", marginBottom: 5 }}>Conversation ID</span>
                <input
                  value={deleteBeforeConvId}
                  onChange={e => setDeleteBeforeConvId(e.target.value)}
                  placeholder="Masukkan conversation ID..."
                  style={{
                    width: "100%", padding: "9px 12px", borderRadius: 8, boxSizing: "border-box",
                    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)",
                    color: "#fff", fontSize: "0.85rem", fontFamily: "monospace", outline: "none",
                  }}
                />
              </label>
              <label style={{ display: "block", marginBottom: 20 }}>
                <span style={{ color: "#c0c0c0", fontSize: "0.8rem", display: "block", marginBottom: 5 }}>
                  Timestamp <span style={{ color: "#8f8f8a" }}>(ISO format, e.g. 2025-02-24T10:30:00)</span>
                </span>
                <input
                  type="datetime-local"
                  value={deleteBeforeTs}
                  onChange={e => setDeleteBeforeTs(e.target.value)}
                  style={{
                    width: "100%", padding: "9px 12px", borderRadius: 8, boxSizing: "border-box",
                    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)",
                    color: "#fff", fontSize: "0.85rem", fontFamily: "inherit", outline: "none",
                    colorScheme: "dark",
                  }}
                />
              </label>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  onClick={() => setDeleteBeforeModal(false)}
                  style={{
                    padding: "8px 18px", borderRadius: 8,
                    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                    color: "#c0c0c0", cursor: "pointer", fontSize: "0.85rem", fontFamily: "inherit",
                  }}
                >Batal</button>
                <button
                  onClick={handleDeleteHistoryBefore}
                  disabled={deleteBeforeLoading || !deleteBeforeConvId.trim() || !deleteBeforeTs.trim()}
                  style={{
                    padding: "8px 18px", borderRadius: 8,
                    background: "rgba(220,38,38,0.85)",
                    border: "1px solid rgba(220,38,38,0.5)",
                    color: "#fff", fontWeight: 600, fontSize: "0.85rem", fontFamily: "inherit",
                    cursor: deleteBeforeLoading || !deleteBeforeConvId.trim() || !deleteBeforeTs.trim() ? "not-allowed" : "pointer",
                    opacity: deleteBeforeLoading || !deleteBeforeConvId.trim() || !deleteBeforeTs.trim() ? 0.5 : 1,
                  }}
                >{deleteBeforeLoading ? "Menghapus…" : "Hapus"}</button>
              </div>
            </div>
          </div>
        )}

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px", display: "flex", flexDirection: "column", gap: 20, background: "linear-gradient(180deg, #1f1f1f 0%, #1a1a1a 100%)" }}>
          {!hasMessages && (
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                color: "#e5e1d8",
                gap: 18,
                padding: "24px",
              }}
            >
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 20,
                  background: "#252525",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 10px 22px rgba(0, 0, 0, 0.35)",
                  border: "1px solid #323232",
                }}
              >
                <img
                  src="/logo.png"
                  alt="Telkomsel"
                  style={{ width: 42, height: 42, objectFit: "contain" }}
                />
              </div>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: "1.25rem", fontWeight: 700, color: "#e9e4d9", margin: 0 }}>
                  {`Selamat ${sessionGreeting}, ${heroUserName}`}
                </p>
                <p style={{ fontSize: "0.95rem", color: "#a59f95", margin: "6px 0 0" }}>
                  Informasi apa yang Anda inginkan saat ini?
                </p>
              </div>
              <ChatInput
                onSend={sendMessage}
                disabled={streaming}
                placeholder="A whole new way to work."
                variant="hero"
                onFileUpload={handleFileUpload}
                activeFile={activeFile}
                onClearFile={() => { setActiveFile(null); setFileUploadError(null); }}
                fileUploadError={fileUploadError}
              />
            </div>
          )}

          {activeConv?.messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                display: "flex",
                flexDirection: msg.role === "user" ? "row-reverse" : "row",
                alignItems: "flex-end",
                gap: 12,
              }}
            >
              {/* Avatar */}
              <div style={{
                width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                background: msg.role === "user"
                  ? "linear-gradient(135deg, #FE6C11, #FF4400)"
                  : "linear-gradient(135deg, #1a1a2e, #16213e)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontSize: "0.85rem", fontWeight: 700,
              }}>
                {msg.role === "user" ? getInitial(userEmail) : "AI"}
              </div>

              {/* Bubble + extras wrapper */}
              <div style={{ maxWidth: "70%", display: "flex", flexDirection: "column", gap: 10 }}>
                {/* Main bubble */}
                <div style={{
                  padding: msg.role === "user" ? "12px 18px" : "14px 18px",
                  borderRadius: msg.role === "user" ? "20px 20px 4px 20px" : "20px 20px 20px 4px",
                  background: msg.role === "user"
                    ? "linear-gradient(135deg, #c97342 0%, #b76231 100%)"
                    : "#2a2a2a",
                  color: msg.role === "user" ? "#fff" : "#dfdbd1",
                  fontSize: "0.95rem",
                  lineHeight: 1.7,
                  boxShadow: msg.role === "user" 
                    ? "0 4px 12px rgba(254, 108, 17, 0.25)" 
                    : "0 2px 10px rgba(0, 0, 0, 0.35)",
                  whiteSpace: msg.role === "user" ? "pre-wrap" : "normal",
                  wordBreak: "break-word",
                  border: msg.role === "user" ? "none" : "1px solid #343434",
                }}>
                  {msg.content === "" && msg.role === "assistant" ? (
                    /* Typing indicator */
                    <span style={{ display: "flex", gap: 6, alignItems: "center", height: 22 }}>
                      {[0, 1, 2].map(i => (
                        <span key={i} style={{
                          width: 8, height: 8, borderRadius: "50%",
                          background: "#c97342",
                          animation: `bounce .8s ease-in-out ${i * .12}s infinite`,
                          display: "inline-block",
                        }} />
                      ))}
                      <style>{`@keyframes bounce{0%,80%,100%{transform:translateY(0) scale(1)}40%{transform:translateY(-8px) scale(1.1)}}`}</style>
                    </span>
                  ) : msg.role === "assistant" ? (
                    <MarkdownMessage content={msg.content} />
                  ) : (
                    msg.content
                  )}
                  <div style={{ fontSize: "0.75rem", opacity: msg.role === "user" ? 0.75 : 0.5, marginTop: 8, textAlign: msg.role === "user" ? "right" : "left" }}>
                    {formatTime(msg.createdAt)}
                  </div>
                </div>

                {/* Chart — display chart data (assistant only) */}
                {msg.role === "assistant" && msg.chart &&
                  typeof msg.chart === "object" &&
                  "type" in msg.chart &&
                  "title" in msg.chart &&
                  "data" in msg.chart && (
                  <Chart chart={msg.chart as unknown as ChartData} />
                )}

                {/* Suggestions — quick-reply pills (assistant only) */}
                {msg.role === "assistant" && msg.suggestions && msg.suggestions.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {msg.suggestions.map((s, idx) => (
                      <button
                        key={idx}
                        onClick={() => sendMessage(s)}
                        disabled={streaming}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 20,
                          border: "1.5px solid #5a4a3f",
                          background: "#2a2a2a",
                          color: "#d9d2c4",
                          fontSize: "0.78rem",
                          fontWeight: 500,
                          cursor: "pointer",
                          transition: "all .15s",
                          fontFamily: "inherit",
                          opacity: streaming ? 0.5 : 1,
                        }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLButtonElement).style.background = "#3a332d";
                          (e.currentTarget as HTMLButtonElement).style.color = "#f4efe5";
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLButtonElement).style.background = "#2a2a2a";
                          (e.currentTarget as HTMLButtonElement).style.color = "#d9d2c4";
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Clarification panel — floats above input when active */}
        {activeClarification && (
          <div style={{ padding: "0 32px 12px", flexShrink: 0 }}>
            <ClarificationPanel
              clarification={activeClarification}
              onSubmit={(text) => {
                setActiveClarification(null);
                sendMessage(text);
              }}
              onClose={() => setActiveClarification(null)}
              disabled={streaming}
            />
          </div>
        )}

        {/* Input area */}
        {hasMessages && (
          <div style={{
            padding: "16px 24px 24px",
            background: "linear-gradient(180deg, rgba(26,26,26,0.75) 0%, rgba(26,26,26,0.95) 100%)",
            borderTop: "1px solid #2f2f2f",
            flexShrink: 0,
            backdropFilter: "blur(8px)",
          }}>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <div style={{ width: "min(960px, 100%)" }}>
                <ChatInput
                  onSend={sendMessage}
                  disabled={streaming}
                  placeholder="Ketik pesan… (Enter kirim, Shift+Enter baris baru)"
                  variant="footer"
                  onFileUpload={handleFileUpload}
                  activeFile={activeFile}
                  onClearFile={() => { setActiveFile(null); setFileUploadError(null); }}
                  fileUploadError={fileUploadError}
                />
              </div>
            </div>
            <p style={{ fontSize: "0.75rem", color: "#8f8f8a", textAlign: "center", margin: "10px 0 0", fontStyle: "italic" }}>
              💡 AI dapat membuat kesalahan. Verifikasi informasi penting sebelum menggunakan.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
