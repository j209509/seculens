"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Search, AlertTriangle, FileText, Calendar, Eye,
} from "lucide-react";
import { RiskScoreBadge } from "@/components/risk-badge";

type LiveScan = {
  id: string;
  url: string;
  status: string;
  riskScore: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  findings: { id: string; severity: string; type: string }[];
  _count?: { findings: number };
};

function formatDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleString("ja-JP", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function severityCounts(scan: LiveScan) {
  const c = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of scan.findings ?? []) {
    const sev = (f.severity || "info").toLowerCase();
    if (sev in c) c[sev as keyof typeof c]++;
  }
  return c;
}

export default function ResultsListPage() {
  const [scans, setScans] = useState<LiveScan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/scans");
        if (!res.ok) {
          if (res.status === 401) throw new Error("ログインが必要です");
          throw new Error(`HTTP ${res.status}`);
        }
        const data: LiveScan[] = await res.json();
        if (!cancelled) {
          setScans(
            (Array.isArray(data) ? data : []).filter(
              (s) => s.status === "completed"
            )
          );
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "取得に失敗しました");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">結果一覧</h1>
        <p className="text-sm text-slate-500 mt-1">完了したスキャンの結果カード一覧</p>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-xs text-red-700">
            <span className="font-bold">取得エラー：</span>{error}
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600 mr-2" />
          <span className="text-sm text-slate-500">読み込み中...</span>
        </div>
      ) : scans.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-16 flex flex-col items-center text-slate-400">
            <FileText className="w-10 h-10 mb-2 opacity-30" />
            <p className="text-sm font-medium text-slate-600">完了したスキャン結果がありません</p>
            <p className="text-xs text-slate-400 mt-1">スキャンを実行すると結果がここに表示されます</p>
            <Link
              href="/scan"
              className="mt-4 inline-flex items-center gap-2 bg-blue-600 text-white text-xs font-bold px-5 py-2.5 rounded-xl hover:bg-blue-700 transition-colors"
            >
              <Search className="w-3.5 h-3.5" /> スキャンを実行
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {scans.map((scan) => {
            const sev = severityCounts(scan);
            const total = scan._count?.findings ?? scan.findings.length;
            return (
              <Link key={scan.id} href={`/results/${scan.id}`}>
                <Card className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer h-full">
                  <CardContent className="pt-5 pb-5">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-blue-600 truncate">{scan.url}</p>
                        <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(scan.completedAt ?? scan.createdAt)}
                        </p>
                      </div>
                      <RiskScoreBadge score={scan.riskScore} />
                    </div>

                    <div className="grid grid-cols-5 gap-1 mb-3">
                      {[
                        { label: "C", count: sev.critical, cls: "bg-red-50 text-red-700 border-red-200" },
                        { label: "H", count: sev.high, cls: "bg-orange-50 text-orange-700 border-orange-200" },
                        { label: "M", count: sev.medium, cls: "bg-amber-50 text-amber-700 border-amber-200" },
                        { label: "L", count: sev.low, cls: "bg-green-50 text-green-700 border-green-200" },
                        { label: "I", count: sev.info, cls: "bg-slate-50 text-slate-600 border-slate-200" },
                      ].map((kpi) => (
                        <div key={kpi.label} className={`rounded-lg border px-2 py-1.5 text-center ${kpi.cls}`}>
                          <p className="text-[10px] font-semibold">{kpi.label}</p>
                          <p className="text-sm font-bold">{kpi.count}</p>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                      <Badge variant="outline" className="text-xs">
                        検出 {total} 件
                      </Badge>
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600">
                        <Eye className="w-3 h-3" /> 詳細を見る
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
