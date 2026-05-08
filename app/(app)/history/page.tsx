"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Search, CheckCircle, XCircle, Clock, ChevronUp, ChevronDown, Loader2,
  AlertTriangle, History as HistoryIcon, ChevronLeft, ChevronRight, Eye,
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

type SortField = "createdAt" | "riskScore" | "findings";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 10;

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

function StatusPill({ status }: { status: string }) {
  if (status === "completed") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
        <CheckCircle className="w-3.5 h-3.5" /> 完了
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-red-500 font-medium">
        <XCircle className="w-3.5 h-3.5" /> 失敗
      </span>
    );
  }
  if (status === "running") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-blue-500 font-medium">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> 実行中
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-slate-400 font-medium">
      <Clock className="w-3.5 h-3.5" /> 待機中
    </span>
  );
}

export default function HistoryPage() {
  const router = useRouter();
  const [scans, setScans] = useState<LiveScan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/scans");
        if (!res.ok) {
          if (res.status === 401) {
            throw new Error("ログインが必要です");
          }
          throw new Error(`HTTP ${res.status}`);
        }
        const data: LiveScan[] = await res.json();
        if (!cancelled) setScans(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "取得に失敗しました");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    let list = scans.filter((s) => {
      const matchSearch =
        !search || s.url.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || s.status === statusFilter;
      const ts = new Date(s.createdAt).getTime();
      const matchFrom = !dateFrom || ts >= new Date(dateFrom).getTime();
      const matchTo =
        !dateTo || ts <= new Date(dateTo).getTime() + 24 * 60 * 60 * 1000;
      return matchSearch && matchStatus && matchFrom && matchTo;
    });

    list = [...list].sort((a, b) => {
      let av: number;
      let bv: number;
      if (sortField === "createdAt") {
        av = new Date(a.createdAt).getTime();
        bv = new Date(b.createdAt).getTime();
      } else if (sortField === "riskScore") {
        av = a.riskScore;
        bv = b.riskScore;
      } else {
        av = a._count?.findings ?? a.findings.length;
        bv = b._count?.findings ?? b.findings.length;
      }
      return sortDir === "asc" ? av - bv : bv - av;
    });

    return list;
  }, [scans, search, statusFilter, dateFrom, dateTo, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
    setPage(1);
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ChevronDown className="w-3 h-3 opacity-30" />;
    return sortDir === "asc"
      ? <ChevronUp className="w-3 h-3 text-blue-600" />
      : <ChevronDown className="w-3 h-3 text-blue-600" />;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">診断履歴</h1>
        <p className="text-sm text-slate-500 mt-1">過去のスキャン結果一覧</p>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-xs text-red-700">
            <span className="font-bold">取得エラー：</span>{error}
          </p>
        </div>
      )}

      <Card className="border-0 shadow-sm">
        <CardContent className="pt-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative lg:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="URLで検索..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-9 h-9 text-sm"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v ?? "all"); setPage(1); }}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="ステータス" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべて</SelectItem>
                <SelectItem value="queued">待機中</SelectItem>
                <SelectItem value="running">実行中</SelectItem>
                <SelectItem value="completed">完了</SelectItem>
                <SelectItem value="failed">失敗</SelectItem>
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="h-9 text-xs"
                title="開始日"
              />
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="h-9 text-xs"
                title="終了日"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600 mr-2" />
              <span className="text-sm text-slate-500">読み込み中...</span>
            </div>
          ) : scans.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <HistoryIcon className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm font-medium text-slate-600">スキャン履歴がありません</p>
              <p className="text-xs text-slate-400 mt-1">スキャンを実行するとここに結果が表示されます</p>
              <Link
                href="/scan"
                className="mt-4 inline-flex items-center gap-2 bg-blue-600 text-white text-xs font-bold px-5 py-2.5 rounded-xl hover:bg-blue-700 transition-colors"
              >
                <Search className="w-3.5 h-3.5" /> 最初のスキャンを実行
              </Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-100">
                  <TableHead className="text-xs pl-6 cursor-pointer select-none" onClick={() => toggleSort("createdAt")}>
                    <span className="flex items-center gap-1">スキャン日時 <SortIcon field="createdAt" /></span>
                  </TableHead>
                  <TableHead className="text-xs">URL</TableHead>
                  <TableHead className="text-xs">ステータス</TableHead>
                  <TableHead className="text-xs cursor-pointer select-none" onClick={() => toggleSort("findings")}>
                    <span className="flex items-center gap-1">検出件数 <SortIcon field="findings" /></span>
                  </TableHead>
                  <TableHead className="text-xs cursor-pointer select-none" onClick={() => toggleSort("riskScore")}>
                    <span className="flex items-center gap-1">リスクスコア <SortIcon field="riskScore" /></span>
                  </TableHead>
                  <TableHead className="text-xs pr-6 text-right">詳細</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-slate-400 text-sm">
                      検索条件に一致するスキャンがありません
                    </TableCell>
                  </TableRow>
                ) : (
                  pageRows.map((scan) => {
                    const sev = severityCounts(scan);
                    const total = scan._count?.findings ?? scan.findings.length;
                    return (
                      <TableRow
                        key={scan.id}
                        className="border-slate-100 hover:bg-slate-50 cursor-pointer"
                        onClick={() => {
                          if (scan.status === "completed") router.push(`/results/${scan.id}`);
                        }}
                      >
                        <TableCell className="pl-6 text-sm text-slate-600 whitespace-nowrap">
                          {formatDate(scan.createdAt)}
                        </TableCell>
                        <TableCell>
                          <p className="text-sm font-medium text-blue-600 truncate max-w-[280px]">
                            {scan.url}
                          </p>
                        </TableCell>
                        <TableCell><StatusPill status={scan.status} /></TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {sev.critical > 0 && <Badge className="bg-red-600 text-white text-xs px-1.5 py-0 h-5">C:{sev.critical}</Badge>}
                            {sev.high > 0 && <Badge className="bg-orange-500 text-white text-xs px-1.5 py-0 h-5">H:{sev.high}</Badge>}
                            {sev.medium > 0 && <Badge className="bg-amber-500 text-white text-xs px-1.5 py-0 h-5">M:{sev.medium}</Badge>}
                            {sev.low > 0 && <Badge className="bg-green-600 text-white text-xs px-1.5 py-0 h-5">L:{sev.low}</Badge>}
                            {total === 0 && <span className="text-xs text-slate-400">検出なし</span>}
                          </div>
                        </TableCell>
                        <TableCell>
                          {scan.status === "completed"
                            ? <RiskScoreBadge score={scan.riskScore} />
                            : <span className="text-xs text-slate-400">—</span>}
                        </TableCell>
                        <TableCell className="pr-6 text-right" onClick={(e) => e.stopPropagation()}>
                          {scan.status === "completed" ? (
                            <Link href={`/results/${scan.id}`}>
                              <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                                <Eye className="w-3 h-3" /> 詳細
                              </Button>
                            </Link>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}

          {scans.length > 0 && (
            <div className="px-6 py-3 border-t border-slate-100 flex items-center justify-between">
              <p className="text-xs text-slate-400">
                全 {filtered.length} 件中 {(currentPage - 1) * PAGE_SIZE + 1}〜
                {Math.min(currentPage * PAGE_SIZE, filtered.length)} 件
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline" size="sm" className="h-7 w-7 p-0"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
                <span className="text-xs text-slate-500">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline" size="sm" className="h-7 w-7 p-0"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
