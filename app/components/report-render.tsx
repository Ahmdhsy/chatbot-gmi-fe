"use client";

/* Renderer for a generated report: narrative markdown, pivot tables (markdown
   or nested-header HTML, virtual-scrolled + Excel export), insight cards, and
   charts. Extracted from the chat page so /admin/reporting renders answers
   EXACTLY the same way — the backend emits one format, one renderer reads it. */

import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import dynamic from "next/dynamic";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

/* ─────────────────────────── Chart Component ─────────────────────────── */
export interface ChartData {
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
  [key: string]: unknown;
}

function toChartLabel(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value.trim() || fallback;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const preferred = ["label", "name", "month", "period", "region", "area", "metric", "category", "x", "id"];
    for (const key of preferred) {
      const c = obj[key];
      if (typeof c === "string" && c.trim()) return c.trim();
      if (typeof c === "number" || typeof c === "boolean") return String(c);
    }
    const first = Object.values(obj).find((v) => typeof v === "string" || typeof v === "number" || typeof v === "boolean");
    if (first !== undefined) return String(first);
  }
  return fallback || "N/A";
}

function inferYField(data: Array<Record<string, unknown>>) {
  if (!data || data.length === 0) return "value";
  const preferred = ["value_num", "value", "y", "nps", "score", "amount", "total"];
  const sample = data[0];
  for (const key of preferred) {
    if (typeof sample[key] === "number" || !Number.isNaN(Number(sample[key]))) return key;
  }
  return Object.keys(sample).find((k) => typeof sample[k] === "number") || "value";
}

function inferXField(data: Array<Record<string, unknown>>, yField: string) {
  if (!data || data.length === 0) return "label";
  const preferred = ["time_value", "label", "month", "period", "time", "date", "region", "area", "name", "category", "x"];
  const sample = data[0];
  for (const key of preferred) {
    if (key !== yField && key in sample) return key;
  }
  return Object.keys(sample).find((k) => k !== yField && typeof sample[k] !== "number") || "label";
}

function inferSeriesField(data: Array<Record<string, unknown>>, xField: string, yField: string) {
  if (!data || data.length === 0) return undefined;
  const preferred = ["metric_label", "series", "metric", "type", "legend", "group", "dataset", "line", "tipe"];
  const sample = data[0];
  const keys = Object.keys(sample);
  for (const key of [...preferred, ...keys]) {
    if (key === xField || key === yField) continue;
    if (!(key in sample)) continue;
    const uniq = new Set(data.map((row) => toChartLabel(row[key])));
    if (uniq.size > 1 && uniq.size <= 30 && uniq.size < data.length) return key;
  }
  return undefined;
}

export function Chart({ chart }: { chart: ChartData }) {
  const yField = chart.yField || inferYField(chart.data);
  const xField = chart.xField || inferXField(chart.data, yField);
  const seriesField = chart.seriesField || inferSeriesField(chart.data, xField, yField);
  const chartType = String(chart.type || "bar").toLowerCase();
  const isPie = chartType.includes("pie");
  const isLine = chartType.includes("line");

  const COLORS = chart.colorScheme || [
    "#5B8FF9", "#5AD8A6", "#F6BD16", "#E86452",
    "#6DC8EC", "#945FB9", "#FF9845", "#5D7092",
  ];

  // Unique X values in source order
  const uniqueX = Array.from(
    new Set(chart.data.map((row, i) => toChartLabel(row[xField], `#${i + 1}`)))
  );

  // Build ApexCharts series
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let series: any[];
  if (isPie) {
    series = chart.data.map((row) => Number(row[yField]) || 0);
  } else if (seriesField) {
    const grouped: Record<string, Record<string, number | null>> = {};
    chart.data.forEach((row) => {
      const s = toChartLabel(row[seriesField!], "Series");
      const x = toChartLabel(row[xField], "");
      if (!grouped[s]) grouped[s] = {};
      grouped[s][x] = Number(row[yField]) || 0;
    });
    series = Object.entries(grouped).map(([name, vals]) => ({
      name,
      data: uniqueX.map((x) => vals[x] ?? null),
    }));
  } else {
    series = [{
      name: chart.title || "Data",
      data: chart.data.map((row) => Number(row[yField]) || 0),
    }];
  }

  const options = {
    chart: {
      type: (isPie ? "donut" : isLine ? "line" : "bar") as "donut" | "line" | "bar",
      background: "transparent",
      toolbar: { show: true },
      animations: { enabled: true, speed: 350 },
      fontFamily: "Inter, Tahoma, sans-serif",
    },
    title: {
      text: chart.title,
      align: "center" as const,
      style: { fontSize: "14px", fontWeight: "600", color: "#e5e7eb" },
      margin: 12,
    },
    colors: COLORS,
    theme: { mode: "dark" as const },
    tooltip: {
      theme: "dark",
      shared: true,
      intersect: false,
      y: {
        formatter: (val: number) =>
          val == null ? "–" : val.toLocaleString("id-ID", { maximumFractionDigits: 2 }),
      },
    },
    legend: {
      position: "bottom" as const,
      horizontalAlign: "center" as const,
      labels: { colors: "#9ca3af" },
      itemMargin: { horizontal: 8, vertical: 4 },
    },
    xaxis: isPie ? {} : {
      categories: uniqueX,
      labels: {
        rotate: -35,
        style: { colors: "#9ca3af", fontSize: "11px" },
        formatter: (val: string) => val?.length > 16 ? val.slice(0, 16) + "…" : val,
      },
      axisBorder: { color: "#374151" },
      axisTicks: { color: "#374151" },
    },
    yaxis: isPie ? {} : {
      labels: {
        style: { colors: "#9ca3af", fontSize: "11px" },
        formatter: (val: number) =>
          val.toLocaleString("id-ID", { maximumFractionDigits: 1 }),
      },
    },
    plotOptions: {
      bar: { borderRadius: 4, columnWidth: "60%" },
      pie: { donut: { size: "55%", labels: { show: true, total: { show: true, color: "#9ca3af" } } } },
    },
    stroke: isLine
      ? { curve: (chart.smooth !== false ? "smooth" : "straight") as "smooth" | "straight", width: Number(chart.lineWidth) || 2.5 }
      : { show: false },
    markers: isLine ? { size: 4, hover: { size: 6 } } : {},
    grid: {
      borderColor: "#374151",
      strokeDashArray: 4,
      xaxis: { lines: { show: false } },
    },
    dataLabels: { enabled: false },
  };

  if (!chart.data || chart.data.length === 0) {
    return (
      <div style={{ marginTop: 12, borderRadius: 12, background: "#1f2937", border: "1px solid #374151", padding: "24px", textAlign: "center" as const, color: "#6b7280" }}>
        Tidak ada data untuk ditampilkan
      </div>
    );
  }

  return (
    <div style={{
      marginTop: 12,
      borderRadius: 12,
      overflow: "hidden",
      background: "#1a2232",
      boxShadow: "0 6px 24px rgba(0,0,0,0.4)",
      border: "1px solid #2d3748",
      padding: "4px 0 0",
    }}>
      <ReactApexChart
        options={options}
        series={series}
        type={isPie ? "donut" : isLine ? "line" : "bar"}
        height={isPie ? 380 : seriesField ? 440 : 360}
        width="100%"
      />
    </div>
  );
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

/* ── Export table to Excel ──
   Real .xlsx via SheetJS (no Excel format-mismatch warning). Accepts an HTML
   fragment with one or more <table> (plus optional <p> captions); tables are
   stacked in one sheet, rowspan/colspan become merged cells. Dynamically
   imported so the chat bundle doesn't carry SheetJS until first export. */
async function exportTableToExcel(tableHtml: string, filename = "report") {
  const XLSX = await import("xlsx");
  const container = document.createElement("div");
  container.innerHTML = tableHtml;
  let ws: import("xlsx").WorkSheet | null = null;
  for (const el of Array.from(container.children)) {
    if (el.tagName === "TABLE") {
      if (!ws) {
        ws = XLSX.utils.table_to_sheet(el);
      } else {
        XLSX.utils.sheet_add_aoa(ws, [[""]], { origin: -1 });
        XLSX.utils.sheet_add_dom(ws, el as HTMLElement, { origin: -1 });
      }
    } else {
      const text = el.textContent?.trim();
      if (!text) continue;
      if (!ws) ws = XLSX.utils.aoa_to_sheet([[text]]);
      else XLSX.utils.sheet_add_aoa(ws, [[""], [text]], { origin: -1 });
    }
  }
  if (!ws) return;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Report");
  XLSX.writeFile(wb, `${filename}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function mdTableToHtml(data: ParsedTableData): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const head = data.headers.map((h) => `<th>${esc(h)}</th>`).join("");
  const body = data.rows
    .map((r) => `<tr>${data.headers.map((_, i) => `<td>${esc(r[i] ?? "")}</td>`).join("")}</tr>`)
    .join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

const EXPORT_BTN_STYLE: React.CSSProperties = {
  background: "transparent", border: "1px solid #4a4a4a", color: "#c9c3b6",
  borderRadius: 6, padding: "3px 10px", fontSize: "0.72rem", cursor: "pointer",
  whiteSpace: "nowrap", flexShrink: 0,
};

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
      <div style={{ padding: "5px 12px", fontSize: "0.74rem", color: "#888", borderTop: "1px solid #343434", background: "#232323", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span>{totalRows} baris · {data.headers.length} kolom · scroll untuk melihat semua data</span>
        <button style={EXPORT_BTN_STYLE} onClick={() => exportTableToExcel(mdTableToHtml(data))}>
          ⬇ Export Excel
        </button>
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
      <div style={{ padding: "5px 12px", fontSize: "0.74rem", color: "#888", borderTop: "1px solid #343434", background: "#232323", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span>{totalRows} baris · {totalCols} kolom · scroll untuk melihat semua data</span>
        <button style={EXPORT_BTN_STYLE} onClick={() => exportTableToExcel(html)}>
          ⬇ Export Excel
        </button>
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

export function MarkdownMessage({ content }: { content: string }) {
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

  // Combined export: stack every table in this answer into one sheet, each
  // preceded by the nearest heading line above it (e.g. "NATIONWIDE — per FM ...").
  const combinedExportHtml = React.useMemo(() => {
    const escText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const parts: string[] = [];
    let lastProse = "";
    for (const seg of segments) {
      if (seg.kind === "prose") { lastProse = seg.text; continue; }
      let tableHtml = "";
      if (seg.kind === "html_table") {
        tableHtml = seg.html;
      } else {
        const d = parseMdTableLines(seg.lines);
        if (d) tableHtml = mdTableToHtml(d);
      }
      if (!tableHtml) continue;
      const caption = (lastProse.trim().split("\n").pop() || "")
        .replace(/[#*_`]/g, "")
        .trim();
      lastProse = "";
      parts.push((caption ? `<p><b>${escText(caption)}</b></p>` : "") + tableHtml);
    }
    return parts.length >= 2 ? parts.join("<br/>") : "";
  }, [segments]);

  const exportAllBtn = combinedExportHtml ? (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <button
        style={EXPORT_BTN_STYLE}
        onClick={() => exportTableToExcel(combinedExportHtml, "report-gabungan")}
      >
        ⬇ Export semua tabel ke Excel
      </button>
    </div>
  ) : null;

  const renderSegments = (segs: MdSegment[]) =>
    segs.map((seg, idx) => {
      if (seg.kind === "prose") {
        if (!seg.text.trim()) return null;
        return (
          <ReactMarkdown key={idx} remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
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
          <ReactMarkdown key={idx} remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
            {seg.lines.join("\n")}
          </ReactMarkdown>
        );
      }
      if (tableData.rows.length > VIRTUAL_TABLE_THRESHOLD) {
        return <VirtualPivotTable key={idx} data={tableData} />;
      }
      return (
        <ReactMarkdown key={idx} remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
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
        {exportAllBtn}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {renderSegments(segments)}
      {exportAllBtn}
    </div>
  );
}
