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

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8001/v1";

/* ─────────────────────────── Types ─────────────────────────── */
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
  evidence?: Record<string, unknown>[];
  suggestions?: string[];
  chart?: Record<string, unknown> | null;
  data?: Record<string, unknown> | null;
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
}

type ToastType = "success" | "error" | "info";
interface ToastState { type: ToastType; message: string }

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
  colorScheme?: string[];
  smooth?: boolean;
  lineWidth?: number;
  pointSize?: number;
  [key: string]: unknown; // Allow additional properties
}

function Chart({ chart }: { chart: ChartData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!chart || !chart.data || chart.data.length === 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const padding = 60;
    const chartWidth = canvas.width - padding * 2;
    const chartHeight = canvas.height - padding * 2;

    // Get colors
    const colors = chart.colorScheme || ['#5B8FF9', '#5AD8A6', '#F6BD16', '#E86452', '#6DC8EC'];

    // Draw title
    ctx.fillStyle = '#1a1a2e';
    ctx.font = 'bold 16px Poppins, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(chart.title, canvas.width / 2, 25);

    // Calculate max value for scaling
    const yField = chart.yField || 'value';
    const xField = chart.xField || 'label';
    const maxValue = Math.max(...chart.data.map((d: Record<string, unknown>) => Number(d[yField]) || 0)) * 1.1;

    // Draw Y-axis
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, canvas.height - padding);
    ctx.stroke();

    // Draw X-axis
    ctx.beginPath();
    ctx.moveTo(padding, canvas.height - padding);
    ctx.lineTo(canvas.width - padding, canvas.height - padding);
    ctx.stroke();

    // Draw chart based on type
    if (chart.type === 'bar') {
      const barWidth = chartWidth / chart.data.length * 0.6;
      const gap = chartWidth / chart.data.length;

      chart.data.forEach((item: Record<string, unknown>, index: number) => {
        const value = Number(item[yField]) || 0;
        const barHeight = (value / maxValue) * chartHeight;
        const x = padding + gap * index + (gap - barWidth) / 2;
        const y = canvas.height - padding - barHeight;

        // Draw bar
        ctx.fillStyle = colors[index % colors.length];
        ctx.fillRect(x, y, barWidth, barHeight);

        // Draw value on top
        ctx.fillStyle = '#1a1a2e';
        ctx.font = '11px Poppins, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(value.toString(), x + barWidth / 2, y - 5);

        // Draw X-axis label
        ctx.save();
        ctx.translate(x + barWidth / 2, canvas.height - padding + 15);
        ctx.rotate(-Math.PI / 4);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#6b7280';
        ctx.font = '10px Poppins, sans-serif';
        const label = String(item[xField] || index);
        ctx.fillText(label.length > 10 ? label.substring(0, 10) + '...' : label, 0, 0);
        ctx.restore();
      });
    } else if (chart.type === 'line') {
      const gap = chartWidth / (chart.data.length - 1 || 1);

      // Get all points coordinates
      const points = chart.data.map((item: Record<string, unknown>, index: number) => {
        const value = Number(item[yField]) || 0;
        return {
          x: padding + gap * index,
          y: canvas.height - padding - (value / maxValue) * chartHeight,
          value
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

      // Draw points
      const pointSize = (chart as Record<string, unknown>).pointSize as number || 5;
      points.forEach((point, index) => {
        ctx.fillStyle = colors[0];
        ctx.beginPath();
        ctx.arc(point.x, point.y, pointSize, 0, Math.PI * 2);
        ctx.fill();

        // Draw value
        ctx.fillStyle = '#1a1a2e';
        ctx.font = '11px Poppins, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(point.value.toString(), point.x, point.y - pointSize - 5);

        // Draw X-axis label
        ctx.save();
        ctx.translate(point.x, canvas.height - padding + 15);
        ctx.rotate(-Math.PI / 4);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#6b7280';
        ctx.font = '10px Poppins, sans-serif';
        const item = chart.data[index];
        const label = String(item[xField] || index);
        ctx.fillText(label.length > 10 ? label.substring(0, 10) + '...' : label, 0, 0);
        ctx.restore();
      });

      // Draw points
      chart.data.forEach((item: Record<string, unknown>, index: number) => {
        const value = Number(item[yField]) || 0;
        const x = padding + gap * index;
        const y = canvas.height - padding - (value / maxValue) * chartHeight;

        ctx.fillStyle = colors[0];
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();

        // Draw value
        ctx.fillStyle = '#1a1a2e';
        ctx.font = '11px Poppins, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(value.toString(), x, y - 10);

        // Draw X-axis label
        ctx.save();
        ctx.translate(x, canvas.height - padding + 15);
        ctx.rotate(-Math.PI / 4);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#6b7280';
        ctx.font = '10px Poppins, sans-serif';
        const label = String(item[xField] || index);
        ctx.fillText(label.length > 10 ? label.substring(0, 10) + '...' : label, 0, 0);
        ctx.restore();
      });
    } else if (chart.type === 'pie') {
      const total = chart.data.reduce((sum: number, item: Record<string, unknown>) => {
        return sum + (Number(item[yField]) || 0);
      }, 0);

      let currentAngle = -Math.PI / 2;
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2 + 10;
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

      // Draw legend
      const legendX = padding;
      let legendY = padding;

      chart.data.forEach((item: Record<string, unknown>, index: number) => {
        const label = String(item[xField] || index);

        // Color box
        ctx.fillStyle = colors[index % colors.length];
        ctx.fillRect(legendX, legendY, 15, 15);

        // Label
        ctx.fillStyle = '#1a1a2e';
        ctx.font = '11px Poppins, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(label, legendX + 20, legendY + 12);

        legendY += 22;
      });
    } else {
      // Unsupported chart type
      ctx.fillStyle = '#6b7280';
      ctx.font = '14px Poppins, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`Chart type "${chart.type}" not supported`, canvas.width / 2, canvas.height / 2);
    }

    // Draw Y-axis labels
    ctx.fillStyle = '#6b7280';
    ctx.font = '10px Poppins, sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
      const value = (maxValue / 5) * i;
      const y = canvas.height - padding - (value / maxValue) * chartHeight;
      ctx.fillText(Math.round(value).toString(), padding - 10, y + 3);
    }

  }, [chart]);

  return (
    <div style={{ marginTop: 12, borderRadius: 12, overflow: 'hidden', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
      <canvas
        ref={canvasRef}
        width={600}
        height={350}
        style={{ width: '100%', height: 'auto', display: 'block' }}
      />
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
  const [useStream, setUseStream] = useState(false);

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
                      }
                    ),
                  };
                })
              );
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
              }
            ),
          };
        })
      );

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
    <div style={{ display: "flex", height: "100vh", width: "100vw", overflow: "hidden", fontFamily: "Poppins, sans-serif", background: "#f5f6fa" }}>

      {/* Toast */}
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* ══════════ SIDEBAR ══════════ */}
      <aside
        style={{
          width: sidebarOpen ? 260 : 0,
          minWidth: sidebarOpen ? 260 : 0,
          transition: "width .25s ease, min-width .25s ease",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          background: "#1a1a2e",
          borderRight: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {/* Sidebar header */}
        <div style={{ padding: "20px 16px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ color: "#ffffff", fontWeight: 700, fontSize: "1rem", whiteSpace: "nowrap" }}>💬 AI Chatbot</span>
        </div>

        {/* New chat button */}
        <div style={{ padding: "0 12px 12px" }}>
          <button
            onClick={handleNewChat}
            style={{
              width: "100%", padding: "10px 14px",
              background: "linear-gradient(90deg, #FE6C11, #FF4400)",
              color: "#fff", border: "none", borderRadius: 10,
              cursor: "pointer", fontWeight: 600, fontSize: "0.875rem",
              display: "flex", alignItems: "center", gap: 8,
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ fontSize: "1.1rem" }}>＋</span> Chat Baru
          </button>
        </div>

        {/* Conversation list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 8px" }}>
          {conversations.map((c) => (
            <div
              key={c.id}
              onClick={() => handleSelectConv(c)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "10px 10px",
                borderRadius: 8,
                cursor: "pointer",
                marginBottom: 4,
                background: c.id === activeId ? "rgba(255,255,255,0.1)" : "transparent",
                transition: "background .15s",
              }}
              onMouseEnter={e => { if (c.id !== activeId) (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.05)" }}
              onMouseLeave={e => { if (c.id !== activeId) (e.currentTarget as HTMLDivElement).style.background = "transparent" }}
            >
              <span style={{ fontSize: "1rem" }}>🗨️</span>
              <span style={{
                flex: 1, color: "#e0e0e0", fontSize: "0.8rem",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>{c.title}</span>
              <button
                onClick={e => { e.stopPropagation(); handleDeleteConv(c.id); }}
                style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: "0.85rem", padding: 2, lineHeight: 1 }}
                title="Hapus"
              >✕</button>
            </div>
          ))}
        </div>

        {/* User info + logout */}
        <div style={{ padding: "12px 14px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>

          {/* ── LangChain Memory panel ── */}
          <div style={{ marginBottom: 8 }}>
            <button
              onClick={handleToggleLCPanel}
              style={{
                width: "100%", padding: "8px 10px",
                background: lcPanelOpen ? "rgba(37,99,235,0.15)" : "rgba(255,255,255,0.06)",
                color: lcPanelOpen ? "#60a5fa" : "#c0c0c0",
                border: `1px solid ${lcPanelOpen ? "rgba(96,165,250,0.4)" : "rgba(255,255,255,0.1)"}`,
                borderRadius: 8, cursor: "pointer", fontSize: "0.8rem",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                fontFamily: "inherit", transition: "all .15s",
              }}
            >
              <span>🧠 LangChain Memory</span>
              <span style={{ fontSize: "0.7rem", opacity: 0.7 }}>{lcPanelOpen ? "▲" : "▼"}</span>
            </button>

            {lcPanelOpen && (
              <div style={{
                marginTop: 6,
                background: "rgba(0,0,0,0.25)",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.08)",
                padding: "10px 12px",
                fontSize: "0.75rem",
                color: "#c0c0c0",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}>
                {/* Active conversation tools */}
                {activeConv?.apiConversationId ? (
                  <>
                    <p style={{ margin: 0, color: "#888", fontSize: "0.7rem" }}>
                      ID: <span style={{ color: "#60a5fa", wordBreak: "break-all" }}>{activeConv.apiConversationId}</span>
                    </p>

                    {/* Action buttons row */}
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      <button
                        onClick={() => handleFetchLCSummary(activeConv.apiConversationId!)}
                        disabled={lcLoading}
                        style={{
                          flex: 1, minWidth: 60, padding: "5px 4px", borderRadius: 6,
                          background: "rgba(255,255,255,0.08)",
                          border: "1px solid rgba(255,255,255,0.12)",
                          color: "#c0c0c0", cursor: lcLoading ? "not-allowed" : "pointer",
                          fontSize: "0.7rem", fontFamily: "inherit",
                          opacity: lcLoading ? 0.5 : 1,
                        }}
                      >📋 Summary</button>
                      <button
                        onClick={() => handleFetchLCMessages(activeConv.apiConversationId!)}
                        disabled={lcLoading}
                        style={{
                          flex: 1, minWidth: 60, padding: "5px 4px", borderRadius: 6,
                          background: "rgba(255,255,255,0.08)",
                          border: "1px solid rgba(255,255,255,0.12)",
                          color: "#c0c0c0", cursor: lcLoading ? "not-allowed" : "pointer",
                          fontSize: "0.7rem", fontFamily: "inherit",
                          opacity: lcLoading ? 0.5 : 1,
                        }}
                      >💬 Pesan</button>
                      <button
                        onClick={() => handleClearLCMemory(activeConv.apiConversationId!)}
                        disabled={lcLoading}
                        style={{
                          flex: 1, minWidth: 60, padding: "5px 4px", borderRadius: 6,
                          background: "rgba(255,68,0,0.15)",
                          border: "1px solid rgba(255,68,0,0.35)",
                          color: "#ff6b4a", cursor: lcLoading ? "not-allowed" : "pointer",
                          fontSize: "0.7rem", fontFamily: "inherit",
                          opacity: lcLoading ? 0.5 : 1,
                        }}
                      >🗑 Hapus</button>
                    </div>

                    {lcLoading && (
                      <p style={{ margin: 0, textAlign: "center", color: "#888" }}>Memuat…</p>
                    )}

                    {/* Summary result */}
                    {!lcLoading && lcSummary !== null && (
                      <div style={{
                        background: "rgba(255,255,255,0.04)", borderRadius: 6,
                        border: "1px solid rgba(255,255,255,0.08)",
                        padding: "8px 10px", maxHeight: 160, overflowY: "auto",
                      }}>
                        <p style={{ margin: "0 0 4px", fontWeight: 600, color: "#60a5fa", fontSize: "0.7rem" }}>📋 Summary</p>
                        {typeof lcSummary === "string" ? (
                          <p style={{ margin: 0, lineHeight: 1.5, color: "#d0d0d0" }}>{lcSummary}</p>
                        ) : (
                          Object.entries(lcSummary as Record<string, unknown>).map(([k, v]) => (
                            <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 6, marginBottom: 2 }}>
                              <span style={{ color: "#888" }}>{k}</span>
                              <span style={{ color: "#e0e0e0", textAlign: "right", wordBreak: "break-all" }}>
                                {typeof v === "object" ? JSON.stringify(v) : String(v)}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {/* LC messages result */}
                    {!lcLoading && lcMessages !== null && (
                      <div style={{
                        background: "rgba(255,255,255,0.04)", borderRadius: 6,
                        border: "1px solid rgba(255,255,255,0.08)",
                        padding: "8px 10px", maxHeight: 200, overflowY: "auto",
                        display: "flex", flexDirection: "column", gap: 6,
                      }}>
                        <p style={{ margin: "0 0 4px", fontWeight: 600, color: "#60a5fa", fontSize: "0.7rem" }}>
                          💬 Pesan ({lcMessages.length})
                        </p>
                        {lcMessages.length === 0 ? (
                          <p style={{ margin: 0, color: "#888" }}>Tidak ada pesan.</p>
                        ) : (
                          lcMessages.map((m, i) => {
                            const role = String(m.type ?? m.role ?? "");
                            const content = String(m.content ?? m.text ?? "");
                            const isHuman = role === "human" || role === "user";
                            return (
                              <div key={i} style={{
                                padding: "5px 8px", borderRadius: 6,
                                background: isHuman ? "rgba(254,108,17,0.12)" : "rgba(255,255,255,0.06)",
                                borderLeft: `2px solid ${isHuman ? "#FE6C11" : "#60a5fa"}`,
                              }}>
                                <span style={{ color: isHuman ? "#FE6C11" : "#60a5fa", fontWeight: 600, fontSize: "0.68rem" }}>
                                  {isHuman ? "User" : "AI"}
                                </span>
                                <p style={{ margin: "2px 0 0", color: "#d0d0d0", lineHeight: 1.4, fontSize: "0.7rem", wordBreak: "break-word" }}>
                                  {content}
                                </p>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <p style={{ margin: 0, color: "#666", fontSize: "0.72rem", textAlign: "center" }}>
                    Kirim pesan dulu untuk mengaktifkan memori percakapan.
                  </p>
                )}

                {/* Divider + All conversations button */}
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 8 }}>
                  <button
                    onClick={handleFetchLCConversations}
                    disabled={lcLoading}
                    style={{
                      width: "100%", padding: "6px 4px", borderRadius: 6,
                      background: "rgba(96,165,250,0.1)",
                      border: "1px solid rgba(96,165,250,0.25)",
                      color: "#60a5fa", cursor: lcLoading ? "not-allowed" : "pointer",
                      fontSize: "0.72rem", fontFamily: "inherit",
                      opacity: lcLoading ? 0.5 : 1,
                    }}
                  >🗂 Semua Percakapan LC</button>
                </div>
              </div>
            )}
          </div>

          {/* ── Cache panel ── */}
          <div style={{ marginBottom: 10 }}>
            <button
              onClick={handleToggleCachePanel}
              style={{
                width: "100%", padding: "8px 10px",
                background: cachePanelOpen ? "rgba(254,108,17,0.15)" : "rgba(255,255,255,0.06)",
                color: cachePanelOpen ? "#FE6C11" : "#c0c0c0",
                border: `1px solid ${cachePanelOpen ? "rgba(254,108,17,0.4)" : "rgba(255,255,255,0.1)"}`,
                borderRadius: 8, cursor: "pointer", fontSize: "0.8rem",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                fontFamily: "inherit", transition: "all .15s",
              }}
            >
              <span>⚡ Cache</span>
              <span style={{ fontSize: "0.7rem", opacity: 0.7 }}>{cachePanelOpen ? "▲" : "▼"}</span>
            </button>

            {cachePanelOpen && (
              <div style={{
                marginTop: 8,
                background: "rgba(0,0,0,0.25)",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.08)",
                padding: "10px 12px",
                fontSize: "0.75rem",
                color: "#c0c0c0",
              }}>
                {/* Stats display */}
                {cacheLoading ? (
                  <p style={{ margin: 0, textAlign: "center", color: "#888" }}>Memuat…</p>
                ) : cacheStats ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
                    {Object.entries(cacheStats).map(([key, val]) => (
                      <div key={key} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ color: "#888", whiteSpace: "nowrap" }}>{key}</span>
                        <span style={{ color: "#e0e0e0", fontWeight: 600, textAlign: "right", wordBreak: "break-all" }}>
                          {typeof val === "object" ? JSON.stringify(val) : String(val)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ margin: "0 0 10px", color: "#888", textAlign: "center" }}>Belum ada data.</p>
                )}

                {/* Action buttons */}
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={handleFetchCacheStats}
                    disabled={cacheLoading}
                    style={{
                      flex: 1, padding: "6px 4px", borderRadius: 6,
                      background: "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      color: "#c0c0c0", cursor: cacheLoading ? "not-allowed" : "pointer",
                      fontSize: "0.72rem", fontFamily: "inherit",
                      opacity: cacheLoading ? 0.5 : 1,
                    }}
                  >🔄 Refresh</button>
                  <button
                    onClick={handleClearCache}
                    disabled={cacheLoading}
                    style={{
                      flex: 1, padding: "6px 4px", borderRadius: 6,
                      background: "rgba(255,68,0,0.15)",
                      border: "1px solid rgba(255,68,0,0.35)",
                      color: "#ff6b4a", cursor: cacheLoading ? "not-allowed" : "pointer",
                      fontSize: "0.72rem", fontFamily: "inherit",
                      opacity: cacheLoading ? 0.5 : 1,
                    }}
                  >🗑 Clear</button>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              background: "linear-gradient(135deg, #FE6C11, #FF4400)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontWeight: 700, fontSize: "0.875rem", flexShrink: 0,
            }}>{getInitial(userEmail)}</div>
            <span style={{ color: "#c0c0c0", fontSize: "0.8rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{userEmail}</span>
          </div>
          <button
            onClick={handleLogout}
            style={{
              width: "100%", padding: "8px", borderRadius: 8,
              background: "rgba(255,255,255,0.06)",
              color: "#c0c0c0", border: "1px solid rgba(255,255,255,0.1)",
              cursor: "pointer", fontSize: "0.8rem",
            }}
          >🚪 Logout</button>
        </div>
      </aside>

      {/* ══════════ MAIN CHAT AREA ══════════ */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>

        {/* Top bar */}
        <header style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "14px 20px",
          background: "#ffffff",
          borderBottom: "1px solid #ebebeb",
          flexShrink: 0,
        }}>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.3rem", color: "#555", padding: 4 }}
            title="Toggle sidebar"
          >☰</button>
          <h1 style={{ margin: 0, fontSize: "1rem", fontWeight: 600, color: "#1a1a2e", flex: 1 }}>
            {activeConv?.title ?? "Chatbot"}
          </h1>
          {/* Stream mode toggle */}
          <button
            onClick={() => setUseStream(v => !v)}
            title={useStream ? "Mode: SSE Streaming (klik untuk JSON)" : "Mode: JSON (klik untuk Streaming)"}
            style={{
              background: useStream ? "rgba(37,99,235,0.08)" : "none",
              border: `1px solid ${useStream ? "#3b82f6" : "#e5e7eb"}`,
              borderRadius: 8, padding: "5px 10px",
              cursor: "pointer", fontSize: "0.78rem",
              color: useStream ? "#3b82f6" : "#4D5959",
              display: "flex", alignItems: "center", gap: 5,
              fontFamily: "inherit", transition: "all .15s",
            }}
          >{useStream ? "⚡ Stream" : "📦 JSON"}</button>

          {/* Delete before timestamp */}
          <button
            onClick={() => {
              setDeleteBeforeConvId(activeConv?.apiConversationId ?? "");
              setDeleteBeforeTs(new Date().toISOString().slice(0, 16));
              setDeleteBeforeModal(true);
            }}
            title="Hapus riwayat sebelum timestamp"
            style={{
              background: "none", border: "1px solid #fca5a5",
              borderRadius: 8, padding: "5px 10px",
              cursor: "pointer", fontSize: "0.78rem", color: "#ef4444",
              display: "flex", alignItems: "center", gap: 5,
              fontFamily: "inherit",
            }}
          >🗓 Hapus Sebelum</button>

          {/* LangChain — all conversations button */}
          <button
            onClick={handleFetchLCConversations}
            disabled={lcLoading}
            title="Lihat semua percakapan LangChain"
            style={{
              background: "none", border: "1px solid #e5e7eb",
              borderRadius: 8, padding: "5px 10px",
              cursor: lcLoading ? "not-allowed" : "pointer",
              fontSize: "0.78rem", color: "#4D5959",
              display: "flex", alignItems: "center", gap: 6,
              opacity: lcLoading ? 0.5 : 1,
              fontFamily: "inherit",
            }}
          >🗂 LC Conversations</button>
        </header>

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
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
          {activeConv?.messages.length === 0 && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#999", gap: 16, marginTop: "10vh" }}>
              <div style={{ fontSize: "3rem" }}>🤖</div>
              <p style={{ fontSize: "1.05rem", fontWeight: 600, color: "#444", margin: 0 }}>Selamat datang di AI Chatbot!</p>
              <p style={{ fontSize: "0.875rem", color: "#999", margin: 0 }}>Ketik pesan di bawah untuk mulai percakapan.</p>
            </div>
          )}

          {activeConv?.messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                display: "flex",
                flexDirection: msg.role === "user" ? "row-reverse" : "row",
                alignItems: "flex-end",
                gap: 10,
              }}
            >
              {/* Avatar */}
              <div style={{
                width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                background: msg.role === "user"
                  ? "linear-gradient(135deg, #FE6C11, #FF4400)"
                  : "linear-gradient(135deg, #1a1a2e, #16213e)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontSize: "0.85rem", fontWeight: 700,
              }}>
                {msg.role === "user" ? getInitial(userEmail) : "AI"}
              </div>

              {/* Bubble + extras wrapper */}
              <div style={{ maxWidth: "65%", display: "flex", flexDirection: "column", gap: 8 }}>
                {/* Main bubble */}
                <div style={{
                  padding: "12px 16px",
                  borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                  background: msg.role === "user"
                    ? "linear-gradient(135deg, #FE6C11, #FF4400)"
                    : "#ffffff",
                  color: msg.role === "user" ? "#fff" : "#1a1a2e",
                  fontSize: "0.9rem",
                  lineHeight: 1.6,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}>
                  {msg.content === "" && msg.role === "assistant" ? (
                    /* Typing indicator */
                    <span style={{ display: "flex", gap: 4, alignItems: "center", height: 20 }}>
                      {[0, 1, 2].map(i => (
                        <span key={i} style={{
                          width: 7, height: 7, borderRadius: "50%",
                          background: "#9ca3af",
                          animation: `bounce .9s ease-in-out ${i * .15}s infinite`,
                          display: "inline-block",
                        }} />
                      ))}
                      <style>{`@keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}`}</style>
                    </span>
                  ) : msg.content}
                  <div style={{ fontSize: "0.7rem", opacity: 0.55, marginTop: 6, textAlign: msg.role === "user" ? "right" : "left" }}>
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

                {/* Evidence — collapsible (assistant only) */}
                {msg.role === "assistant" && msg.evidence && msg.evidence.length > 0 && (
                  <details style={{
                    background: "#f8f9fb",
                    border: "1px solid #e5e7eb",
                    borderRadius: 10,
                    padding: "8px 12px",
                    fontSize: "0.8rem",
                    color: "#4D5959",
                  }}>
                    <summary style={{
                      cursor: "pointer",
                      fontWeight: 600,
                      listStyle: "none",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      userSelect: "none",
                    }}>
                      <span style={{ fontSize: "0.85rem" }}>📎</span>
                      Lihat Sumber ({msg.evidence.length})
                    </summary>
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                      {msg.evidence.map((ev, idx) => (
                        <div key={idx} style={{
                          background: "#ffffff",
                          border: "1px solid #e5e7eb",
                          borderRadius: 8,
                          padding: "8px 10px",
                          fontSize: "0.78rem",
                          lineHeight: 1.5,
                        }}>
                          {!!ev.title && (
                            <div style={{ fontWeight: 600, color: "#043133", marginBottom: 2 }}>
                              {String(ev.title)}
                            </div>
                          )}
                          {!!ev.content && (
                            <div style={{ color: "#4D5959" }}>{String(ev.content)}</div>
                          )}
                          {!!ev.source && (
                            <div style={{ color: "#838383", marginTop: 4, fontStyle: "italic" }}>
                              Sumber: {String(ev.source)}
                            </div>
                          )}
                          {!ev.title && !ev.content && !ev.source && (
                            <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                              {JSON.stringify(ev, null, 2)}
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                  </details>
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

        {/* Input area */}
        <div style={{
          padding: "12px 20px 20px",
          background: "#ffffff",
          borderTop: "1px solid #ebebeb",
          flexShrink: 0,
        }}>
          <form
            onSubmit={(e: FormEvent) => { e.preventDefault(); sendMessage(); }}
            style={{
              display: "flex", alignItems: "flex-end", gap: 10,
              background: "#f5f6fa",
              borderRadius: 16,
              padding: "8px 8px 8px 16px",
              border: "1.5px solid #e5e7eb",
              transition: "border-color .2s",
            }}
            onFocus={() => {}} // handled on textarea
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
                fontSize: "0.9rem",
                lineHeight: 1.5,
                color: "#1a1a2e",
                fontFamily: "inherit",
                maxHeight: 160,
                overflowY: "auto",
              }}
            />
            <button
              type="submit"
              disabled={!input.trim() || streaming}
              style={{
                flexShrink: 0,
                width: 40, height: 40,
                borderRadius: 12,
                background: input.trim() && !streaming
                  ? "linear-gradient(135deg, #FE6C11, #FF4400)"
                  : "#e5e7eb",
                border: "none",
                cursor: input.trim() && !streaming ? "pointer" : "default",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "background .2s",
                color: input.trim() && !streaming ? "#fff" : "#aaa",
                fontSize: "1.1rem",
              }}
            >
              {streaming ? "⏳" : "➤"}
            </button>
          </form>
          <p style={{ fontSize: "0.72rem", color: "#9ca3af", textAlign: "center", margin: "8px 0 0" }}>
            AI dapat membuat kesalahan. Verifikasi informasi penting.
          </p>
        </div>
      </div>
    </div>
  );
}