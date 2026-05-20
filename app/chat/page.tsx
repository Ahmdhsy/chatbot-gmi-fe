"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  FormEvent,
  KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8001/v1";

/* ─────────────────────────── Types ─────────────────────────── */
interface ClarificationOption {
  value: string;
  label: string;
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
    } else {
      // Last step — build follow-up and submit
      const parts = clarification.steps.map((s, idx) => {
        const sel = idx === currentStep ? value : newSelections[s.id];
        const opt = s.options.find((o) => o.value === sel);
        return opt ? `${opt.label} (${opt.value})` : sel ?? "";
      });
      onSubmit(`Pilihan saya: ${parts.filter(Boolean).join(", ")}`);
    }
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
    <div style={{
      background: "#ffffff",
      borderRadius: 14,
      border: "1px solid rgba(254,108,17,0.18)",
      overflow: "hidden",
      boxShadow: "0 -2px 16px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.06)",
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 18px 12px",
        borderBottom: "1px solid rgba(0,0,0,0.07)",
        background: "linear-gradient(135deg, #fff8f5 0%, #ffffff 100%)",
        gap: 12,
      }}>
        <span style={{
          fontSize: "0.9rem",
          fontWeight: 600,
          color: "#1a1a2e",
          flex: 1,
          lineHeight: 1.4,
        }}>
          {step.question}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {totalSteps > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button
                onClick={() => canGoPrev && setCurrentStep((s) => s - 1)}
                disabled={!canGoPrev}
                style={{
                  background: "none", border: "none", cursor: canGoPrev ? "pointer" : "default",
                  color: canGoPrev ? "#FE6C11" : "#ccc", fontSize: "1.1rem", padding: "2px 4px",
                  lineHeight: 1,
                }}
              >‹</button>
              <span style={{ fontSize: "0.78rem", color: "#888", minWidth: 40, textAlign: "center" }}>
                {currentStep + 1} of {totalSteps}
              </span>
              <button
                onClick={() => canGoNext && setCurrentStep((s) => s + 1)}
                disabled={!canGoNext}
                style={{
                  background: "none", border: "none", cursor: canGoNext ? "pointer" : "default",
                  color: canGoNext ? "#FE6C11" : "#ccc", fontSize: "1.1rem", padding: "2px 4px",
                  lineHeight: 1,
                }}
              >›</button>
            </div>
          )}
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "#bbb", fontSize: "1.2rem", padding: "2px 4px",
              lineHeight: 1, display: "flex", alignItems: "center",
            }}
          >×</button>
        </div>
      </div>

      {/* Options list (scrollable, max ~4 visible) */}
      <div style={{ maxHeight: 224, overflowY: "auto" }}>
        {step.options.map((opt, idx) => {
          const isHovered = hoveredOption === opt.value;
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
                background: isHovered ? "#fff8f5" : "transparent",
                border: "none",
                borderBottom: "1px solid rgba(0,0,0,0.05)",
                cursor: disabled ? "not-allowed" : "pointer",
                textAlign: "left",
                fontFamily: "inherit",
                transition: "background .12s",
              }}
            >
              <span style={{
                width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                background: isHovered ? "#FE6C11" : "rgba(0,0,0,0.06)",
                color: isHovered ? "#fff" : "#888",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "0.75rem", fontWeight: 700,
                transition: "all .12s",
              }}>
                {idx + 1}
              </span>
              <span style={{
                flex: 1, fontSize: "0.88rem",
                color: isHovered ? "#1a1a2e" : "#374151",
                fontWeight: isHovered ? 500 : 400,
                lineHeight: 1.4,
              }}>
                {opt.label}
              </span>
              <span style={{
                color: "#FE6C11",
                opacity: isHovered ? 1 : 0,
                fontSize: "1rem",
                transition: "opacity .12s",
              }}>→</span>
            </button>
          );
        })}
      </div>

      {/* Footer: custom text + Skip */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 18px",
        borderTop: "1px solid rgba(0,0,0,0.06)",
        background: "#fafbfc",
      }}>
        <span style={{ color: "#bbb", fontSize: "1rem", flexShrink: 0 }}>✏</span>
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
            color: "#374151",
            fontSize: "0.85rem",
            fontFamily: "inherit",
          }}
        />
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: 8,
            color: "#888",
            cursor: "pointer",
            fontSize: "0.8rem",
            fontFamily: "inherit",
            padding: "5px 14px",
            transition: "all .12s",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,0,0,0.05)";
            (e.currentTarget as HTMLButtonElement).style.color = "#374151";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = "none";
            (e.currentTarget as HTMLButtonElement).style.color = "#888";
          }}
        >Skip</button>
      </div>
    </div>
  );
}

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
      ctx.font = 'bold 16px Poppins, sans-serif';
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
            ctx.font = '11px Poppins, sans-serif';
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
            ctx.font = '10px Poppins, sans-serif';
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
                ctx.font = '10px Poppins, sans-serif';
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
            ctx.font = '10px Poppins, sans-serif';
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
              ctx.font = '11px Poppins, sans-serif';
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
              ctx.font = '10px Poppins, sans-serif';
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
          ctx.font = 'bold 12px Poppins, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`${percentage}%`, labelX, labelY);

          currentAngle += sliceAngle;
        });

      } else {
        // Unsupported chart type
        ctx.fillStyle = '#6b7280';
        ctx.font = '14px Poppins, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`Chart type "${chart.type}" not supported`, cssWidth / 2, cssHeight / 2);
      }

      // Draw Y-axis labels
      ctx.fillStyle = '#6b7280';
      ctx.font = '10px Poppins, sans-serif';
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
        ctx.font = "14px Poppins, sans-serif";
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
    <div style={{ marginTop: 12, borderRadius: 12, overflow: 'hidden', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', position: "relative" }}>
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
            background: "rgba(17,24,39,0.92)",
            color: "#fff",
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
            borderTop: "1px solid #eef2f7",
            padding: "10px 12px",
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            alignItems: "center",
            maxHeight: 96,
            overflowY: "auto",
            background: "#fcfdff",
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
                border: "1px solid #e5e7eb",
                borderRadius: 999,
                background: "#ffffff",
                fontSize: "0.76rem",
                color: "#334155",
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

function MarkdownMessage({ content }: { content: string }) {
  const normalizedContent = normalizeMarkdownTables(normalizeInsightLists(content));
  const insight = extractInsightSection(normalizedContent);
  const insightCards = insight
    ? insight.points
      .map(parseInsightCard)
      .filter((card): card is { value: string; label: string } => card !== null && card.value.trim().length > 0)
    : [];
  const hasInsightCards = !!insight && insightCards.length > 0;

  const markdownComponents: Components = {
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
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          background: "#ffffff",
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
      <thead style={{ background: "#f8fafc" }}>{children}</thead>
    ),
    tr: ({ children }) => (
      <tr style={{ borderBottom: "1px solid #e5e7eb" }}>{children}</tr>
    ),
    th: ({ children }) => (
      <th
        style={{
          borderBottom: "1px solid #e5e7eb",
          borderRight: "1px solid #e5e7eb",
          padding: "8px 10px",
          textAlign: "left",
          fontWeight: 600,
          fontSize: "0.85rem",
          whiteSpace: "nowrap",
          wordBreak: "normal",
        }}
      >
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td
        style={{
          borderBottom: "1px solid #eef2f7",
          borderRight: "1px solid #eef2f7",
          padding: "8px 10px",
          verticalAlign: "top",
          fontSize: "0.85rem",
          background: "#ffffff",
          whiteSpace: "nowrap",
          wordBreak: "normal",
        }}
      >
        {children}
      </td>
    ),
    code: ({ children }) => (
      <code
        style={{
          background: "#f3f4f6",
          borderRadius: 6,
          padding: "2px 6px",
          fontSize: "0.82rem",
        }}
      >
        {children}
      </code>
    ),
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {!hasInsightCards && (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {normalizedContent}
        </ReactMarkdown>
      )}

      {hasInsightCards && insight && (
        <>
          {!!insight.before && (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {insight.before}
            </ReactMarkdown>
          )}

          <div
            style={{
              background: "#ffffff",
              border: "1px solid #ffb596",
              borderRadius: 14,
              padding: "14px 14px 12px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div
              style={{
                color: "#d66b3d",
                fontSize: "0.78rem",
                letterSpacing: "0.08em",
                fontWeight: 700,
                textTransform: "uppercase",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span>✦</span>
              <span>Insight</span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 10,
              }}
            >
              {insightCards.map((card, idx) => {
                return (
                  <div
                    key={`${idx}-${card.value}`}
                    style={{
                      borderRadius: 12,
                      border: "1px solid #ffc4a8",
                      background: "#FFEDE7",
                      padding: "12px 14px",
                    }}
                  >
                    <div style={{ color: "#cb6034", fontSize: "1.22rem", fontWeight: 700, lineHeight: 1.3 }}>
                      {card.value}
                    </div>
                    {!!card.label && (
                      <div style={{ marginTop: 4, color: "#7e604e", fontSize: "0.86rem", lineHeight: 1.5 }}>
                        {card.label}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {!!insight.after && (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {insight.after}
            </ReactMarkdown>
          )}
        </>
      )}
    </div>
  );
}

/* ─────────────────────────── Main Page ─────────────────────────── */
export default function ChatPage() {
  const router = useRouter();
  const [token, setToken] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [toast, setToast] = useState<ToastState | null>(null);

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /* ── Auth guard ── */
  useEffect(() => {
    const t = localStorage.getItem("access_token") ?? "";
    if (!t) {
      router.replace("/signin");
      return;
    }
    setToken(t);
    // decode email from JWT payload (base64)
    try {
      const payload = JSON.parse(atob(t.split(".")[1]));
      setUserEmail(payload?.sub ?? payload?.email ?? "User");
    } catch { setUserEmail("User"); }

    // start with a fresh conversation
    const first = newConversation();
    setConversations([first]);
    setActiveId(first.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Scroll to bottom when messages change ── */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversations, activeId]);

  /* ── Auto-resize textarea ── */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [input]);

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

  function handleNewChat() {
    const c = newConversation();
    setConversations((prev) => [c, ...prev]);
    setActiveId(c.id);
    setInput("");
  }

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
      // API returns an array of { role, content, ... } or a plain string
      if (!Array.isArray(raw)) return;
      const historyMessages: Message[] = raw.map((item: Record<string, unknown>) => ({
        id: uid(),
        role: (item.type === "human" || item.role === "user") ? "user" : "assistant",
        content: String(item.content ?? item.text ?? ""),
        createdAt: item.created_at ? new Date(String(item.created_at)) : new Date(),
      }));
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
    setInput("");
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
      } catch (err: any) {
        setToast({ type: "error", message: err?.message ?? "Gagal menghubungi server." });
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
    } catch (err: any) {
      setToast({ type: "error", message: err?.message ?? "Gagal menghubungi server." });
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
    } catch (err: any) {
      setToast({ type: "error", message: err?.message ?? "Gagal menghubungi server." });
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
    } catch (err: any) {
      setToast({ type: "error", message: err?.message ?? "Gagal menghubungi server." });
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
    } catch (err: any) {
      setToast({ type: "error", message: err?.message ?? "Gagal menghubungi server." });
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
    } catch (err: any) {
      setToast({ type: "error", message: err?.message ?? "Gagal menghubungi server." });
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
    } catch (err: any) {
      setToast({ type: "error", message: err?.message ?? "Gagal menghubungi server." });
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
    } catch (err: any) {
      setToast({ type: "error", message: err?.message ?? "Gagal menghubungi server." });
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
    } catch (err: any) {
      setToast({ type: "error", message: err?.message ?? "Gagal menghubungi server." });
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
    } catch (err: any) {
      setToast({ type: "error", message: err?.message ?? "Gagal menghubungi server." });
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
    localStorage.removeItem("access_token");
    router.push("/signin");
  }

  /* ── Send message ── */
  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || streaming) return;

    const userMsg: Message = {
      id: uid(), role: "user", content: text, createdAt: new Date(),
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
          title: isFirst ? text.slice(0, 45) + (text.length > 45 ? "…" : "") : c.title,
          messages: [...c.messages, userMsg],
        };
      })
    );
    setInput("");
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
        message: text,
        useLangChainMemory: true,
        conversationId: currentApiConvId,
        responseMode: { includeChartSpec: true },
      };

      // ── SSE streaming mode via EventSource ──
      if (useStream) {
        const params = new URLSearchParams({
          message: text,
          useLangChainMemory: "true",
          includeChartSpec: "true",
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
                        clarification: payload?.clarification ?? null,
                      }
                    ),
                  };
                })
              );
              if (payload?.clarification) setActiveClarification(payload.clarification);
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
              .map((d: any) => {
                const loc = Array.isArray(d.loc) ? d.loc.join(" → ") : String(d.loc ?? "");
                return `[${loc}] ${d.msg} (type: ${d.type ?? "-"})`;
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
                clarification: data.clarification ?? null,
              }
            ),
          };
        })
      );
      if (data.clarification) setActiveClarification(data.clarification);

    } catch (err: any) {
      const msg = err?.message === "Failed to fetch"
        ? "Tidak dapat menghubungi server. Pastikan backend berjalan di port 8001."
        : (err?.message ?? "Terjadi kesalahan jaringan.");
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
  }, [input, streaming, activeId, token, useStream, conversations]);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  /* ─────────────────────────── Render ─────────────────────────── */
  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", overflow: "hidden", fontFamily: "Poppins, sans-serif", background: "#fafbfc" }}>

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
                  <p style={{ color: "#888", textAlign: "center", margin: "20px 0", fontSize: "0.875rem" }}>
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
                            <p style={{ margin: "2px 0 0", color: "#888", fontSize: "0.72rem" }}>
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
              <p style={{ margin: "0 0 18px", color: "#888", fontSize: "0.82rem", lineHeight: 1.5 }}>
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
                  Timestamp <span style={{ color: "#888" }}>(ISO format, e.g. 2025-02-24T10:30:00)</span>
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
        <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px", display: "flex", flexDirection: "column", gap: 20, background: "linear-gradient(180deg, #fafbfc 0%, #f0f4f8 100%)" }}>
          {activeConv?.messages.length === 0 && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#999", gap: 18, marginTop: "8vh" }}>
              <div style={{ fontSize: "4rem", opacity: 0.7 }}>🚀</div>
              <p style={{ fontSize: "1.15rem", fontWeight: 700, color: "#1a1a2e", margin: 0 }}>Mulai Percakapan Anda</p>
              <p style={{ fontSize: "0.9rem", color: "#666", margin: 0, textAlign: "center", maxWidth: "300px", lineHeight: 1.6 }}>
                Tanyakan apa pun kepada AI assistant kami untuk mendapatkan informasi dan insights yang Anda butuhkan.
              </p>
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
                    ? "linear-gradient(135deg, #FE6C11 0%, #FF4400 100%)"
                    : "#ffffff",
                  color: msg.role === "user" ? "#fff" : "#1a1a2e",
                  fontSize: "0.95rem",
                  lineHeight: 1.7,
                  boxShadow: msg.role === "user" 
                    ? "0 4px 12px rgba(254, 108, 17, 0.25)" 
                    : "0 2px 8px rgba(0, 0, 0, 0.06)",
                  whiteSpace: msg.role === "user" ? "pre-wrap" : "normal",
                  wordBreak: "break-word",
                  border: msg.role === "user" ? "none" : "1px solid rgba(0,0,0,0.05)",
                }}>
                  {msg.content === "" && msg.role === "assistant" ? (
                    /* Typing indicator */
                    <span style={{ display: "flex", gap: 6, alignItems: "center", height: 22 }}>
                      {[0, 1, 2].map(i => (
                        <span key={i} style={{
                          width: 8, height: 8, borderRadius: "50%",
                          background: "#FE6C11",
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
                          border: "1.5px solid #FE6C11",
                          background: "#fff8f5",
                          color: "#FE6C11",
                          fontSize: "0.78rem",
                          fontWeight: 500,
                          cursor: "pointer",
                          transition: "all .15s",
                          fontFamily: "inherit",
                          opacity: streaming ? 0.5 : 1,
                        }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLButtonElement).style.background = "#FE6C11";
                          (e.currentTarget as HTMLButtonElement).style.color = "#fff";
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLButtonElement).style.background = "#fff8f5";
                          (e.currentTarget as HTMLButtonElement).style.color = "#FE6C11";
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
        <div style={{
          padding: "16px 32px 24px",
          background: "linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.8) 100%)",
          borderTop: "1px solid rgba(254,108,17,0.1)",
          flexShrink: 0,
          backdropFilter: "blur(8px)",
        }}>
          <form
            onSubmit={(e: FormEvent) => { e.preventDefault(); sendMessage(); }}
            style={{
              display: "flex", alignItems: "flex-end", gap: 12,
              background: "linear-gradient(135deg, #ffffff 0%, #fafbfc 100%)",
              borderRadius: 18,
              padding: "12px 12px 12px 18px",
              border: "1.5px solid rgba(254,108,17,0.2)",
              transition: "all .2s ease",
              boxShadow: "0 4px 16px rgba(254, 108, 17, 0.08)",
            }}
            onFocus={() => {}}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLFormElement).style.borderColor = "rgba(254,108,17,0.4)";
              (e.currentTarget as HTMLFormElement).style.boxShadow = "0 6px 20px rgba(254, 108, 17, 0.12)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLFormElement).style.borderColor = "rgba(254,108,17,0.2)";
              (e.currentTarget as HTMLFormElement).style.boxShadow = "0 4px 16px rgba(254, 108, 17, 0.08)";
            }}
          >
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ketik pesan… (Enter kirim, Shift+Enter baris baru)"
              disabled={streaming}
              style={{
                flex: 1,
                resize: "none",
                border: "none",
                background: "transparent",
                outline: "none",
                fontSize: "0.95rem",
                lineHeight: 1.6,
                color: "#1a1a2e",
                fontFamily: "inherit",
                maxHeight: 160,
                overflowY: "auto",
                opacity: streaming ? 0.6 : 1,
                transition: "opacity .2s",
              }}
            />
            <button
              type="submit"
              disabled={!input.trim() || streaming}
              style={{
                flexShrink: 0,
                width: 44, height: 44,
                borderRadius: 14,
                background: input.trim() && !streaming
                  ? "linear-gradient(135deg, #FE6C11 0%, #FF4400 100%)"
                  : "rgba(0,0,0,0.08)",
                border: "none",
                cursor: input.trim() && !streaming ? "pointer" : "default",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all .2s ease",
                color: input.trim() && !streaming ? "#fff" : "#bbb",
                fontSize: "1.2rem",
                boxShadow: input.trim() && !streaming ? "0 4px 12px rgba(254, 108, 17, 0.3)" : "none",
              }}
              onMouseEnter={(e) => {
                if (input.trim() && !streaming) {
                  (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)";
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 6px 16px rgba(254, 108, 17, 0.4)";
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
                (e.currentTarget as HTMLButtonElement).style.boxShadow = input.trim() && !streaming ? "0 4px 12px rgba(254, 108, 17, 0.3)" : "none";
              }}
            >
              {streaming ? "⏳" : "➤"}
            </button>
          </form>
          <p style={{ fontSize: "0.75rem", color: "#9ca3af", textAlign: "center", margin: "10px 0 0", fontStyle: "italic" }}>
            💡 AI dapat membuat kesalahan. Verifikasi informasi penting sebelum menggunakan.
          </p>
        </div>
      </div>
    </div>
  );
}
