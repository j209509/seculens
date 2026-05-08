"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Search, CheckCircle, XCircle, Download, GitCompare, ChevronUp, ChevronDown, Loader2,
} from "lucide-react";
import { MOCK_SCAN_HISTORY } from "@/lib/mock-data";
import { RiskScoreBadge } from "@/components/risk-badge";
import type { ScanResult } from "@/lib/mock-data";

function formatDate(s: string) {
  return new Date(s).toLocaleString("ja-JP", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function VulnSummary({ scan }: { scan: ScanResult }) {
  return (
    <div className="flex gap-1 flex-wrap">
      {scan.critical > 0 && <Badge className="bg-red-600 text-white text-xs px-1.5 py-0 h-5">C:{scan.critical}</Badge>}
      {scan.high > 0 && <Badge className="bg-orange-500 text-white text-xs px-1.5 py-0 h-5">H:{scan.high}</Badge>}
      {scan.medium > 0 && <Badge className="bg-amber-500 text-white text-xs px-1.5 py-0 h-5">M:{scan.medium}</Badge>}
      {scan.low > 0 && <Badge className="bg-green-600 text-white text-xs px-1.5 py-0 h-5">L:{scan.low}</Badge>}
      {scan.totalVulnerabilities === 0 && <span className="text-xs text-slate-400">検出なし</span>}
    </div>
  );
}

function ComparePanel({ scans }: { scans: ScanResult[] }) {
  if (scans.length !== 2) return null;
  const [a, b] = scans;
  const diff = b.riskScore - a.riskScore;

  return (
    <Card className="border-0 shadow-sm bg-blue-50 border-blue-200">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-blue-900 flex items-center gap-2">
          <GitCompare className="w-4 h-4" />
          スキャン結果の比較
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-6">
          {[a, b].map((scan, i) => (
            <div key={scan.id}>
              <p className="text-xs font-semibold text-blue-700 mb-2">{i === 0 ? "スキャン A" : "スキャン B"}</p>
              <p className="text-sm font-medium text-slate-800 truncate">{scan.url}</p>
              <p className="text-xs text-slate-500">{formatDate(scan.startedAt)}</p>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-slate-600">リスクスコア:</span>
                <RiskScoreBadge score={scan.riskScore} />
              </div>
              <div className="mt-2">
                <VulnSummary scan={scan} />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-blue-200">
          <p className="text-sm text-slate-700">
            スコア差:{" "}
            <span className={`font-bold ${diff > 0 ? "text-red-600" : diff < 0 ? "text-emerald-600" : "text-slate-600"}`}>
              {diff > 0 ? "+" : ""}{diff}
            </span>
            {" "}/ 脆弱性差:{" "}
            <span className={`font-bold ${b.totalVulnerabilities - a.totalVulnerabilities > 0 ? "text-red-600" : "text-emerald-600"}`}>
              {b.totalVulnerabilities - a.totalVulnerabilities > 0 ? "+" : ""}
              {b.totalVulnerabilities - a.totalVulnerabilities}件
            </span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

type SortField = "startedAt" | "riskScore" | "totalVulnerabilities";
type SortDir = "asc" | "desc";

function normalizeScan(raw: Record<string, unknown>): ScanResult {
  const findings = (raw.findings as unknown[] | undefined) ?? [];
  const critical = findings.filter((f) => (f as Record<string, string>).severity?.toLowerCase() === "critical").length;
  const high = findings.filter((f) => (f as Record<string, string>).severity?.toLowerCase() === "high").length;
  const medium = findings.filter((f) => (f as Record<string, string>).severity?.toLowerCase() === "medium").length;
  const low = findings.filter((f) => (f as Record<string, string>).severity?.toLowerCase() === "low").length;

  return {
    id: String(raw.id ?? raw.scanId ?? ""),
    url: String(raw.url ?? ""),
    company: String(raw.company ?? ""),
    status: (raw.status as "completed" | "running" | "failed") ?? "completed",
    startedAt: String(raw.startedAt ?? raw.createdAt ?? new Date().toISOString()),
    completedAt: String(raw.completedAt ?? raw.updatedAt ?? new Date().toISOString()),
    totalVulnerabilities: typeof raw.totalVulnerabilities === "number" ? raw.totalVulnerabilities : findings.length,
    critical: typeof raw.critical === "number" ? raw.critical : critical,
    high: typeof raw.high === "number" ? raw.high : high,
    medium: typeof raw.medium === "number" ? raw.medium : medium,
    low: typeof raw.low === "number" ? raw.low : low,
    info: typeof raw.info === "number" ? raw.info : 0,
    riskScore: typeof raw.riskScore === "number" ? raw.riskScore : 0,
    vulnerabilities: [],
  };
}

export default function HistoryPage() {
  const router = useRouter();
  const [scans, setScans] = useState<ScanResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [sortField, setSortField] = useState<SortField>("startedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    async function fetchScans() {
      try {
        const res = await fetch("/api/scans");
        if (!res.ok) throw new Error("fetch failed");
        const data = await res.json();
        const list: ScanResult[] = Array.isArray(data)
          ? data.map((item: Record<string, unknown>) => normalizeScan(item))
          : Array.isArray(data.scans)
          ? data.scans.map((item: Record<string, unknown>) => normalizeScan(item))
          : [];
        setScans(list.length > 0 ? list : MOCK_SCAN_HISTORY);
      } catch {
        setScans(MOCK_SCAN_HISTORY);
      } finally {
        setLoading(false);
      }
    }
    fetchScans();
  }, []);

  const filtered = useMemo(() => {
    let list = scans.filter((s) => {
      const matchSearch =
        !search ||
        s.url.toLowerCase().includes(search.toLowerCase()) ||
        (s.company ?? "").toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || s.status === statusFilter;
      const matchRisk =
        riskFilter === "all" ||
        (riskFilter === "critical" && s.critical > 0) ||
        (riskFilter === "high" && s.high > 0) ||
        (riskFilter === "medium" && s.medium > 0) ||
        (riskFilter === "low" && s.low > 0 && s.high === 0 && s.critical === 0) ||
        (riskFilter === "clean" && s.totalVulnerabilities === 0);
      return matchSearch && matchStatus && matchRisk;
    });

    list = [...list].sort((a, b) => {
      let av: number, bv: number;
      if (sortField === "startedAt") {
        av = new Date(a.startedAt).getTime();
        bv = new Date(b.startedAt).getTime();
      } else {
        av = a[sortField] as number;
        bv = b[sortField] as number;
      }
      return sortDir === "asc" ? av - bv : bv - av;
    });

    return list;
  }, [scans, search, statusFilter, riskFilter, sortField, sortDir]);

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  }

  function toggleSelect(id: string) {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length < 2 ? [...prev, id] : [prev[1], id]
    );
  }

  const compareScans = scans.filter((s) => selected.includes(s.id));

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ChevronDown className="w-3 h-3 opacity-30" />;
    return sortDir === "asc"
      ? <ChevronUp className="w-3 h-3 text-blue-600" />
      : <ChevronDown className="w-3 h-3 text-blue-600" />;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">診断履歴</h1>
          <p className="text-sm text-slate-500 mt-1">過去のスキャン結果一覧</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs">
          <Download className="w-3.5 h-3.5" />
          CSVエクスポート
        </Button>
      </div>

      {selected.length === 2 && <ComparePanel scans={compareScans} />}

      <Card className="border-0 shadow-sm">
        <CardContent className="pt-5">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="URLまたは企業名で検索..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
              <SelectTrigger className="w-36 h-9 text-sm">
                <SelectValue placeholder="ステータス" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべて</SelectItem>
                <SelectItem value="completed">完了</SelectItem>
                <SelectItem value="failed">失敗</SelectItem>
              </SelectContent>
            </Select>
            <Select value={riskFilter} onValueChange={(v) => setRiskFilter(v ?? "all")}>
              <SelectTrigger className="w-36 h-9 text-sm">
                <SelectValue placeholder="リスクレベル" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべて</SelectItem>
                <SelectItem value="critical">Critical含む</SelectItem>
                <SelectItem value="high">High含む</SelectItem>
                <SelectItem value="medium">Medium含む</SelectItem>
                <SelectItem value="low">Lowのみ</SelectItem>
                <SelectItem value="clean">問題なし</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {selected.length > 0 && (
            <p className="text-xs text-blue-600 mt-2">
              {selected.length}件選択中（最大2件を比較できます）
              <button onClick={() => setSelected([])} className="ml-2 underline">選択解除</button>
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600 mr-2" />
              <span className="text-sm text-slate-500">読み込み中...</span>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-100">
                  <TableHead className="w-10 pl-4">
                    <span className="text-xs text-slate-400">比較</span>
                  </TableHead>
                  <TableHead className="text-xs pl-3">対象URL / 企業名</TableHead>
                  <TableHead className="text-xs cursor-pointer select-none" onClick={() => toggleSort("startedAt")}>
                    <span className="flex items-center gap-1">実行日時 <SortIcon field="startedAt" /></span>
                  </TableHead>
                  <TableHead className="text-xs">ステータス</TableHead>
                  <TableHead className="text-xs cursor-pointer select-none" onClick={() => toggleSort("totalVulnerabilities")}>
                    <span className="flex items-center gap-1">検出数 <SortIcon field="totalVulnerabilities" /></span>
                  </TableHead>
                  <TableHead className="text-xs cursor-pointer select-none" onClick={() => toggleSort("riskScore")}>
                    <span className="flex items-center gap-1">リスクスコア <SortIcon field="riskScore" /></span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-slate-400 text-sm">
                      検索条件に一致するスキャン結果がありません
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((scan) => (
                    <TableRow
                      key={scan.id}
                      className={`border-slate-100 hover:bg-slate-50 cursor-pointer ${selected.includes(scan.id) ? "bg-blue-50" : ""}`}
                      onClick={() => {
                        if (scan.status === "completed") router.push(`/results/${scan.id}`);
                      }}
                    >
                      <TableCell className="pl-4" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.includes(scan.id)}
                          onChange={() => toggleSelect(scan.id)}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600"
                          disabled={scan.status === "failed"}
                        />
                      </TableCell>
                      <TableCell className="pl-3">
                        <div>
                          <p className="text-sm font-medium text-blue-600 truncate max-w-[240px]">{scan.url}</p>
                          {scan.company && <p className="text-xs text-slate-400">{scan.company}</p>}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-slate-500 whitespace-nowrap">
                        {formatDate(scan.startedAt)}
                      </TableCell>
                      <TableCell>
                        {scan.status === "completed" ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                            <CheckCircle className="w-3.5 h-3.5" /> 完了
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-red-500 font-medium">
                            <XCircle className="w-3.5 h-3.5" /> 失敗
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <VulnSummary scan={scan} />
                      </TableCell>
                      <TableCell>
                        {scan.status === "completed" ? (
                          <RiskScoreBadge score={scan.riskScore} />
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
          <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
            <p className="text-xs text-slate-400">{filtered.length}件中 {filtered.length}件を表示</p>
            <p className="text-xs text-slate-400">全 {scans.length} 件</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
