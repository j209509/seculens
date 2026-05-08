"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import {
  Shield, AlertTriangle, Search, TrendingUp, CheckCircle, XCircle,
  Clock, Award, FlaskConical, Database, RefreshCw,
} from "lucide-react";
import { DASHBOARD_KPI, MOCK_SCAN_HISTORY, RISK_DISTRIBUTION, SCAN_TREND } from "@/lib/mock-data";
import { RiskScoreBadge } from "@/components/risk-badge";
import Link from "next/link";

// ─── 本番APIから取得するスキャンの型 ──────────────────────────────────────
type LiveScan = {
  id: string;
  url: string;
  status: string;
  riskScore: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  findings: { id: string; severity: string; type: string }[];
  _count: { findings: number };
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** 本番スキャン一覧から KPI を計算 */
function calcLiveKpi(scans: LiveScan[]) {
  const totalScans = scans.length;
  const totalVulnerabilities = scans.reduce((s, sc) => s + (sc._count?.findings ?? 0), 0);
  const criticalRisk = scans.reduce((s, sc) => s + sc.findings.filter(f => f.severity === "critical").length, 0);
  const highRisk     = scans.reduce((s, sc) => s + sc.findings.filter(f => f.severity === "high").length, 0);
  const resolvedThisMonth = scans.filter(sc => sc.status === "completed").length;
  return { totalScans, totalVulnerabilities, criticalRisk, highRisk, resolvedThisMonth };
}

/** 本番データからリスク分布を計算 */
function calcLiveRiskDist(scans: LiveScan[]) {
  const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  scans.forEach(sc => sc.findings.forEach(f => { counts[f.severity] = (counts[f.severity] ?? 0) + 1; }));
  return [
    { name: "Critical", value: counts.critical, color: "#dc2626" },
    { name: "High",     value: counts.high,     color: "#ea580c" },
    { name: "Medium",   value: counts.medium,   color: "#d97706" },
    { name: "Low",      value: counts.low,      color: "#16a34a" },
    { name: "Info",     value: counts.info,     color: "#94a3b8" },
  ].filter(d => d.value > 0);
}

export default function DashboardPage() {
  const [demoMode, setDemoMode] = useState(true);
  const [liveScans, setLiveScans] = useState<LiveScan[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);

  const fetchLive = useCallback(async () => {
    setLiveLoading(true);
    setLiveError(null);
    try {
      const res = await fetch("/api/scans");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: LiveScan[] = await res.json();
      setLiveScans(data);
    } catch (e) {
      setLiveError(e instanceof Error ? e.message : "取得失敗");
    } finally {
      setLiveLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!demoMode) fetchLive();
  }, [demoMode, fetchLive]);

  // ─── データソースを選択 ─────────────────────────────────────────────────
  const kpi          = demoMode ? DASHBOARD_KPI       : calcLiveKpi(liveScans);
  const scanRows     = demoMode ? MOCK_SCAN_HISTORY.slice(0, 5) : liveScans.slice(0, 5).map(sc => ({
    id:                  sc.id,
    url:                 sc.url,
    company:             "",
    status:              sc.status as "completed" | "running" | "failed",
    startedAt:           sc.startedAt ?? sc.createdAt,
    completedAt:         sc.completedAt ?? "",
    totalVulnerabilities: sc._count?.findings ?? 0,
    critical: sc.findings.filter(f => f.severity === "critical").length,
    high:     sc.findings.filter(f => f.severity === "high").length,
    medium:   sc.findings.filter(f => f.severity === "medium").length,
    low:      sc.findings.filter(f => f.severity === "low").length,
    info:     sc.findings.filter(f => f.severity === "info").length,
    riskScore: sc.riskScore,
    vulnerabilities: [],
  }));
  const riskDist = demoMode ? RISK_DISTRIBUTION : calcLiveRiskDist(liveScans);
  const trendData = demoMode ? SCAN_TREND : [];

  return (
    <div className="p-6 space-y-6">

      {/* ─── ヘッダー + モード切り替え ──────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">ダッシュボード</h1>
          <p className="text-sm text-slate-500 mt-1">
            {demoMode ? "デモデータを表示中" : "本番データを表示中（実際のスキャン結果）"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* モード切り替えトグル */}
          <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1 gap-1">
            <button
              onClick={() => setDemoMode(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                demoMode
                  ? "bg-white shadow-sm text-amber-600 border border-amber-200"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <FlaskConical className="w-3.5 h-3.5" />
              デモ
            </button>
            <button
              onClick={() => setDemoMode(false)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                !demoMode
                  ? "bg-white shadow-sm text-blue-600 border border-blue-200"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              本番
            </button>
          </div>

          {/* 本番モード時: リフレッシュボタン */}
          {!demoMode && (
            <button
              onClick={fetchLive}
              disabled={liveLoading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${liveLoading ? "animate-spin" : ""}`} />
              更新
            </button>
          )}
        </div>
      </div>

      {/* デモバナー */}
      {demoMode && (
        <div className="flex items-center gap-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
          <FlaskConical className="w-4 h-4 text-amber-500 shrink-0" />
          <p className="text-xs text-amber-700">
            <span className="font-bold">デモモード：</span>
            サンプルデータを表示しています。実際のスキャン結果を確認するには「本番」に切り替えてください。
          </p>
          <button
            onClick={() => setDemoMode(false)}
            className="ml-auto text-xs font-semibold text-amber-700 underline hover:text-amber-900 whitespace-nowrap"
          >
            本番に切替 →
          </button>
        </div>
      )}

      {/* 本番エラーバナー */}
      {!demoMode && liveError && (
        <div className="flex items-center gap-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-xs text-red-700"><span className="font-bold">データ取得エラー：</span>{liveError}</p>
          <button onClick={fetchLive} className="ml-auto text-xs font-semibold text-red-700 underline hover:text-red-900">再試行</button>
        </div>
      )}

      {/* 本番ローディング */}
      {!demoMode && liveLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mr-3" />
          <span className="text-sm text-slate-500">本番データを読み込み中...</span>
        </div>
      )}

      {/* 本番: データなし */}
      {!demoMode && !liveLoading && !liveError && liveScans.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
          <Search className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-600 mb-1">スキャン履歴がありません</p>
          <p className="text-xs text-slate-400 mb-4">スキャンを実行するとここに結果が表示されます</p>
          <Link href="/scan" className="inline-flex items-center gap-2 bg-blue-600 text-white text-xs font-bold px-5 py-2.5 rounded-xl hover:bg-blue-700 transition-colors">
            <Search className="w-3.5 h-3.5" />最初のスキャンを実行
          </Link>
        </div>
      )}

      {/* ─── KPIカード ──────────────────────────────────────────────────── */}
      {(demoMode || (!liveLoading && liveScans.length > 0)) && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-0 shadow-sm">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">スキャン数</p>
                    <p className="text-3xl font-bold text-slate-900 mt-1">{kpi.totalScans}</p>
                    {demoMode && <p className="text-xs text-emerald-600 font-medium mt-1">↑ 先月比 +24%</p>}
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                    <Search className="w-5 h-5 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">検出した脆弱性</p>
                    <p className="text-3xl font-bold text-slate-900 mt-1">{kpi.totalVulnerabilities}</p>
                    <p className="text-xs text-slate-500 font-medium mt-1">累計</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Highリスク以上</p>
                    <p className="text-3xl font-bold text-red-600 mt-1">{kpi.criticalRisk + kpi.highRisk}</p>
                    <p className="text-xs text-red-500 font-medium mt-1">要対応</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                    <Shield className="w-5 h-5 text-red-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">完了スキャン</p>
                    <p className="text-3xl font-bold text-emerald-600 mt-1">{kpi.resolvedThisMonth}</p>
                    <p className="text-xs text-emerald-600 font-medium mt-1">{demoMode ? "今月修正完了" : "completed"}</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-emerald-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* SCS Compliance Banner */}
          <div className="rounded-xl bg-gradient-to-r from-slate-800 to-blue-900 px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-md">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center">
                <Award className="w-6 h-6 text-yellow-300" />
              </div>
              <div>
                <div className="text-base font-bold text-white leading-snug">経産省 SCS評価制度 対応</div>
                <div className="text-xs text-slate-300 mt-0.5">★3 脆弱性診断要件に完全対応 | OWASP Top10全カテゴリ準拠</div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-emerald-500/20 border border-emerald-400/40 px-2.5 py-1 text-xs font-semibold text-emerald-300">★3対応</span>
              <span className="inline-flex items-center rounded-full bg-blue-500/20 border border-blue-400/40 px-2.5 py-1 text-xs font-semibold text-blue-300">★4対応</span>
              <span className="inline-flex items-center rounded-full bg-slate-500/30 border border-slate-400/40 px-2.5 py-1 text-xs font-semibold text-slate-300">OWASP Top10</span>
              <Link href="/compliance" className="ml-1 text-xs text-blue-300 hover:text-white font-medium whitespace-nowrap transition-colors">詳細を見る →</Link>
            </div>
          </div>

          {/* グラフ */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base font-semibold">スキャン数 / 脆弱性検出数の推移</CardTitle>
              </CardHeader>
              <CardContent>
                {demoMode ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={trendData} barGap={4}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ borderRadius: 8, border: "none", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="scans" name="スキャン数" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="vulnerabilities" name="脆弱性数" fill="#f97316" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[220px] text-sm text-slate-400">
                    本番モードでの月次推移グラフは今後実装予定です
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base font-semibold">リスクレベル分布</CardTitle>
              </CardHeader>
              <CardContent>
                {riskDist.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={160}>
                      <PieChart>
                        <Pie data={riskDist} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                          {riskDist.map((entry, index) => (
                            <Cell key={index} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: 8, border: "none", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2 mt-2">
                      {riskDist.map((item) => (
                        <div key={item.name} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                            <span className="text-slate-600">{item.name}</span>
                          </div>
                          <span className="font-semibold text-slate-800">{item.value}件</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center h-[160px] text-sm text-slate-400">データなし</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* 最近のスキャン */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base font-semibold">最近のスキャン結果</CardTitle>
              <Link href="/history" className="text-xs text-blue-600 hover:underline font-medium">すべて表示 →</Link>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-100">
                    <TableHead className="text-xs pl-6">対象URL</TableHead>
                    <TableHead className="text-xs">実行日時</TableHead>
                    <TableHead className="text-xs">ステータス</TableHead>
                    <TableHead className="text-xs">脆弱性数</TableHead>
                    <TableHead className="text-xs">リスクスコア</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scanRows.map((scan) => (
                    <TableRow key={scan.id} className="border-slate-100 hover:bg-slate-50">
                      <TableCell className="pl-6">
                        <div>
                          <Link href={`/history`} className="text-sm font-medium text-blue-600 hover:underline truncate block max-w-[220px]">
                            {scan.url}
                          </Link>
                          {scan.company && <div className="text-xs text-slate-400">{scan.company}</div>}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-slate-500">{formatDate(scan.startedAt)}</TableCell>
                      <TableCell>
                        {scan.status === "completed" ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium"><CheckCircle className="w-3.5 h-3.5" /> 完了</span>
                        ) : scan.status === "failed" ? (
                          <span className="inline-flex items-center gap-1 text-xs text-red-500 font-medium"><XCircle className="w-3.5 h-3.5" /> 失敗</span>
                        ) : scan.status === "running" ? (
                          <span className="inline-flex items-center gap-1 text-xs text-blue-500 font-medium"><Clock className="w-3.5 h-3.5" /> 実行中</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-slate-400 font-medium"><Clock className="w-3.5 h-3.5" /> 待機中</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {scan.critical > 0 && <Badge className="bg-red-600 text-white text-xs px-1.5 py-0 h-5">C:{scan.critical}</Badge>}
                          {scan.high > 0 && <Badge className="bg-orange-500 text-white text-xs px-1.5 py-0 h-5">H:{scan.high}</Badge>}
                          {scan.medium > 0 && <Badge className="bg-amber-500 text-white text-xs px-1.5 py-0 h-5">M:{scan.medium}</Badge>}
                          {scan.low > 0 && <Badge className="bg-green-600 text-white text-xs px-1.5 py-0 h-5">L:{scan.low}</Badge>}
                          {scan.totalVulnerabilities === 0 && <span className="text-xs text-slate-400">検出なし</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        {scan.status === "completed" ? <RiskScoreBadge score={scan.riskScore} /> : <span className="text-xs text-slate-400">—</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
