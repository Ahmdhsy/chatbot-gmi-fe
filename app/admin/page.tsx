"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";
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
import { useRouter } from "next/navigation";
import dayjs from "dayjs";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

interface InsightData {
  today: { conversations: number; total_tokens: number; active_users: number };
  this_week: { conversations: number; total_tokens: number; active_users: number };
  this_month: { conversations: number; total_tokens: number; active_users: number };
  daily_trend: { date: string; conversations: number; total_tokens: number }[];
  top_users: {
    user_id: string | null;
    username: string | null;
    email: string | null;
    total_tokens: number;
    conversations: number;
  }[];
  topics: { type: string; count: number }[];
  avg_quality_score: number;
  top_questions: { question: string; count: number }[];
}

const TOPIC_LABELS: Record<string, string> = {
  factual: "Faktual",
  analytical: "Analitis",
  conversational: "Percakapan",
  comparison: "Perbandingan",
  chart_request: "Grafik",
  general: "Umum",
  unknown: "Tidak Diketahui",
};

const TOPIC_COLORS = [
  "#FE6C11",
  "#FF883F",
  "#FFA66D",
  "#FFC39B",
  "#E05B0A",
  "#FFE0CB",
];

const fmt = (n: number) => n.toLocaleString("id-ID");

export default function AdminDashboard() {
  const router = useRouter();
  const [insights, setInsights] = useState<InsightData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadInsights = useCallback(async () => {
    try {
      const res = await apiFetch("/token-usage/insights");
      if (!res.ok) { setError(true); return; }
      setInsights(await res.json());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadInsights(); }, [loadInsights]);

  if (loading) {
    return (
      <div className="flex h-60 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-solid border-primary border-t-transparent" />
      </div>
    );
  }

  if (error || !insights) {
    return (
      <div className="rounded-lg bg-red-500/10 p-6 text-center text-sm font-medium text-red-500">
        Gagal memuat dashboard. Periksa koneksi dan coba lagi.
      </div>
    );
  }

  // Chart: daily trend (bar)
  const trendDates = insights.daily_trend.map((d) =>
    dayjs(d.date).format("DD MMM")
  );
  const trendTokens = insights.daily_trend.map((d) => d.total_tokens);
  const trendConvos = insights.daily_trend.map((d) => d.conversations);

  const trendOptions: ApexOptions = {
    colors: ["#FE6C11", "#FF9E66"],
    chart: {
      type: "bar",
      toolbar: { show: false },
      fontFamily: "inherit",
    },
    plotOptions: {
      bar: { borderRadius: 4, columnWidth: "45%", borderRadiusApplication: "end" },
    },
    dataLabels: { enabled: false },
    grid: {
      strokeDashArray: 5,
      yaxis: { lines: { show: true } },
      xaxis: { lines: { show: false } },
    },
    xaxis: {
      categories: trendDates,
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    legend: {
      position: "top",
      horizontalAlign: "left",
      fontFamily: "inherit",
      fontWeight: 500,
      fontSize: "13px",
    },
    tooltip: {
      y: [
        { formatter: (v: number) => fmt(v) + " token" },
        { formatter: (v: number) => v + " percakapan" },
      ],
    },
  };

  // Chart: topic donut
  const topicLabels = insights.topics.map(
    (t) => TOPIC_LABELS[t.type] ?? t.type
  );
  const topicCounts = insights.topics.map((t) => t.count);

  const donutOptions: ApexOptions = {
    chart: { type: "donut", fontFamily: "inherit" },
    colors: TOPIC_COLORS,
    labels: topicLabels,
    legend: {
      show: true,
      position: "bottom",
      fontFamily: "inherit",
      fontSize: "13px",
      itemMargin: { horizontal: 8, vertical: 4 },
    },
    plotOptions: {
      pie: {
        donut: {
          size: "75%",
          labels: {
            show: true,
            total: {
              show: true,
              showAlways: true,
              label: "Total",
              fontSize: "14px",
              fontWeight: "400",
            },
            value: {
              show: true,
              fontSize: "26px",
              fontWeight: "bold",
              formatter: (val: string) => fmt(Number(val)),
            },
          },
        },
      },
    },
    dataLabels: { enabled: false },
    responsive: [
      { breakpoint: 640, options: { chart: { width: "100%" } } },
    ],
  };

  const qualityColor =
    insights.avg_quality_score >= 4
      ? "text-[#219653]"
      : insights.avg_quality_score >= 3
      ? "text-[#FE6C11]"
      : "text-[#D34053]";

  return (
    <>
      <Breadcrumb pageName="Dashboard" />

      {/* Overview Cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <InsightCard
          label="Token Hari Ini"
          value={fmt(insights.today.total_tokens)}
          sub={`${fmt(insights.today.conversations)} percakapan`}
          accent
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-6 w-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
          }
        />
        <InsightCard
          label="Pengguna Aktif"
          value={fmt(insights.today.active_users)}
          sub="Pengguna aktif hari ini"
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-6 w-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
          }
        />
        <InsightCard
          label="Token Bulan Ini"
          value={fmt(insights.this_month.total_tokens)}
          sub={`${fmt(insights.this_month.conversations)} percakapan`}
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-6 w-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
          }
        />
        <InsightCard
          label="Rata-rata Kualitas"
          value={insights.avg_quality_score > 0 ? `${insights.avg_quality_score} / 5` : "-"}
          sub="Skor kualitas jawaban (30 hari)"
          valueClass={qualityColor}
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-6 w-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
            </svg>
          }
        />
      </div>

      {/* Charts Row */}
      <div className="mb-6 grid grid-cols-12 gap-4">
        {/* Token Trend */}
        <div className="col-span-12 xl:col-span-7 rounded-[10px] bg-white px-7.5 pb-6 pt-7.5 shadow-1 dark:bg-gray-dark dark:shadow-card">
          <h3 className="mb-1 text-xl font-bold text-dark dark:text-white">
            Tren Penggunaan Token
          </h3>
          <p className="mb-4 text-sm text-gray-500 dark:text-[#8f8f8a]">7 hari terakhir</p>
          {trendTokens.length > 0 ? (
            <Chart
              options={trendOptions}
              series={[
                { name: "Token", data: trendTokens },
                { name: "Percakapan", data: trendConvos },
              ]}
              type="bar"
              height={300}
            />
          ) : (
            <div className="flex h-[300px] items-center justify-center text-gray-500 dark:text-[#8f8f8a]">
              Belum ada data tren.
            </div>
          )}
        </div>

        {/* Topic Distribution */}
        <div className="col-span-12 xl:col-span-5 rounded-[10px] bg-white px-7.5 pb-6 pt-7.5 shadow-1 dark:bg-gray-dark dark:shadow-card">
          <h3 className="mb-1 text-xl font-bold text-dark dark:text-white">
            Topik Pertanyaan
          </h3>
          <p className="mb-4 text-sm text-gray-500 dark:text-[#8f8f8a]">30 hari terakhir</p>
          {topicCounts.length > 0 ? (
            <div className="flex justify-center">
              <Chart
                options={donutOptions}
                series={topicCounts}
                type="donut"
                height={320}
                width={320}
              />
            </div>
          ) : (
            <div className="flex h-[320px] items-center justify-center text-gray-500 dark:text-[#8f8f8a]">
              Belum ada data topik.
            </div>
          )}
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-12 gap-4">
        {/* Top Users */}
        <div className="col-span-12 xl:col-span-7 rounded-[10px] bg-white px-7.5 pb-6 pt-7.5 shadow-1 dark:bg-gray-dark dark:shadow-card">
          <h3 className="mb-1 text-xl font-bold text-dark dark:text-white">
            Top 5 Pengguna
          </h3>
          <p className="mb-4 text-sm text-gray-500 dark:text-[#8f8f8a]">Berdasarkan total token (30 hari)</p>
          <Table>
            <TableHeader>
              <TableRow className="border-none bg-[#F7F9FC] dark:bg-dark-2 [&>th]:py-3 [&>th]:text-sm [&>th]:text-dark [&>th]:dark:text-white">
                <TableHead className="pl-4">#</TableHead>
                <TableHead>Pengguna</TableHead>
                <TableHead className="text-right">Total Token</TableHead>
                <TableHead className="pr-4 text-right">Percakapan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {insights.top_users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-gray-500">
                    Belum ada data.
                  </TableCell>
                </TableRow>
              ) : (
                insights.top_users.map((u, idx) => (
                  <TableRow key={u.user_id ?? idx} className="border-[#eee] dark:border-dark-3">
                    <TableCell className="pl-4">
                      <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white ${idx === 0 ? "bg-[#FE6C11]" : idx === 1 ? "bg-[#FF883F]" : "bg-gray-400"}`}>
                        {idx + 1}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-dark dark:text-white">
                          {u.username || u.email || "Unknown"}
                        </span>
                        {u.email && u.username && (
                          <span className="text-xs text-gray-500 dark:text-[#8f8f8a]">{u.email}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-dark dark:text-white">
                      {fmt(u.total_tokens)}
                    </TableCell>
                    <TableCell className="pr-4 text-right text-dark dark:text-white">
                      {fmt(u.conversations)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Right Column: Top Questions + Quick Stats */}
        <div className="col-span-12 flex flex-col gap-4 xl:col-span-5">
          {/* Pertanyaan Terpopuler */}
          <div className="rounded-[10px] bg-white px-7.5 pb-6 pt-7.5 shadow-1 dark:bg-gray-dark dark:shadow-card">
            <h3 className="mb-1 text-xl font-bold text-dark dark:text-white">
              Pertanyaan Terpopuler
            </h3>
            <p className="mb-4 text-sm text-gray-500 dark:text-[#8f8f8a]">Paling sering ditanyakan (30 hari)</p>
            {insights.top_questions.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-500 dark:text-[#8f8f8a]">
                Belum ada data.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {insights.top_questions.map((q, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-3 rounded-lg bg-[#F7F9FC] p-3 dark:bg-dark-2"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#FE6C11] text-xs font-bold text-white">
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm text-dark dark:text-white">
                        {q.question}
                      </p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-[#8f8f8a]">
                        Ditanyakan {fmt(q.count)}x
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Stats: Minggu Ini & Bulan Ini */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-[10px] bg-white p-5 shadow-1 dark:bg-gray-dark dark:shadow-card">
              <p className="text-xs font-medium text-gray-500 dark:text-[#8f8f8a]">Minggu Ini</p>
              <p className="mt-1 text-xl font-bold text-dark dark:text-white">
                {fmt(insights.this_week.total_tokens)}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-[#8f8f8a]">
                {fmt(insights.this_week.conversations)} percakapan
              </p>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-[#8f8f8a]">
                {fmt(insights.this_week.active_users)} pengguna aktif
              </p>
            </div>
            <div className="rounded-[10px] bg-white p-5 shadow-1 dark:bg-gray-dark dark:shadow-card">
              <p className="text-xs font-medium text-gray-500 dark:text-[#8f8f8a]">Bulan Ini</p>
              <p className="mt-1 text-xl font-bold text-[#FE6C11]">
                {fmt(insights.this_month.total_tokens)}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-[#8f8f8a]">
                {fmt(insights.this_month.conversations)} percakapan
              </p>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-[#8f8f8a]">
                {fmt(insights.this_month.active_users)} pengguna aktif
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function InsightCard({
  label,
  value,
  sub,
  icon,
  accent,
  valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
  accent?: boolean;
  valueClass?: string;
}) {
  return (
    <div className="rounded-[10px] border border-stroke bg-white p-5 shadow-1 dark:border-dark-3 dark:bg-gray-dark dark:shadow-card">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-500 dark:text-[#8f8f8a]">{label}</p>
          <p
            className={`mt-1 text-2xl font-bold ${
              valueClass ?? (accent ? "text-[#FE6C11]" : "text-dark dark:text-white")
            }`}
          >
            {value}
          </p>
          {sub && (
            <p className="mt-1.5 text-xs text-gray-500 dark:text-[#8f8f8a]">{sub}</p>
          )}
        </div>
        {icon && (
          <div className="ml-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FE6C11]/10 text-[#FE6C11]">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
