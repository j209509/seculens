"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle, Shield, Loader2, Download, ArrowLeft, ChevronRight,
} from "lucide-react";
import { RiskBadge } from "@/components/risk-badge";
import { FindingDetailModal } from "@/components/scan/FindingDetailModal";
import { CertificateDownload } from "@/components/scan/CertificateDownload";

type Finding = {
  id: string;
  type: string;
  severity: string;
  target: string;
  impact: string;
  evidence?: string;
  recommendedAction?: string;
  description?: string;
  recommendation?: string;
};

type ScanDetail = {
  id: string;
  url: string;
  status: string;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt?: string;
  riskScore?: number;
  findings: Finding[];
};

const SEV_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

const SEV_LABEL: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Info",
};

function RiskMeter({ score }: { score: number }) {
  const color = score >= 80 ? "#dc2626" : score >= 60 ? "#ea580c" : score >= 40 ? "#d97706" : "#16a34a";
  const label = score >= 80 ? "Critical" : score >= 60 ? "High" : score >= 40 ? "Medium" : "Low";
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-28 h-28">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx="50" cy="50" r="42" fill="none" stroke="#f1f5f9" strokeWidth="10" />
          <circle
            cx="50" cy="50" r="42" fill="none" stroke={color} strokeWidth="10"
            strokeDasharray={`${(score / 100) * 264} 264`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold" style={{ color }}>{score}</span>
          <span className="text-xs text-slate-500">/100</span>
        </div>
      </div>
      <span className="text-sm font-semibold mt-1" style={{ color }}>{label}リスク</span>
    </div>
  );
}

export default function ResultDetailPage() {
  const params = useParams();
  const id = (params?.id as string) ?? "";

  const [scan, setScan] = useState<ScanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/scans/${id}`);
        if (!res.ok) {
          if (res.status === 404) throw new Error("スキャンが見つかりませんでした");
          if (res.status === 403) throw new Error("このスキャンを閲覧する権限がありません");
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as ScanDetail;
        if (!cancelled) setScan(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "取得に失敗しました");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

  function handleExportJson() {
    if (!scan) return;
    const payload = {
      id: scan.id,
      url: scan.url,
      status: scan.status,
      riskScore: scan.riskScore ?? 0,
      startedAt: scan.startedAt ?? null,
      completedAt: scan.completedAt ?? null,
      findings: scan.findings,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scan-${scan.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error || !scan) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[400px] text-slate-400">
        <Shield className="w-12 h-12 mb-3 opacity-30" />
        <p className="text-sm font-medium text-slate-600">{error ?? "スキャン結果が見つかりませんでした"}</p>
        <Link href="/results" className="mt-4 text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" /> 結果一覧に戻る
        </Link>
      </div>
    );
  }

  const findings = scan.findings ?? [];
  const riskScore = scan.riskScore ?? 0;

  const counts = findings.reduce<Record<string, number>>((acc, f) => {
    const sev = (f.severity || "info").toLowerCase();
    acc[sev] = (acc[sev] ?? 0) + 1;
    return acc;
  }, {});

  const filtered = activeFilter === "all"
    ? findings
    : findings.filter((f) => f.severity?.toLowerCase() === activeFilter);

  const grouped: Record<string, Finding[]> = {};
  for (const f of filtered) {
    const sev = (f.severity || "info").toLowerCase();
    (grouped[sev] ??= []).push(f);
  }
  const sevKeys = Object.keys(grouped).sort(
    (a, b) => (SEV_ORDER[a] ?? 99) - (SEV_ORDER[b] ?? 99)
  );

  const filters = [
    { key: "all", label: "すべて", count: findings.length },
    { key: "critical", label: "Critical", count: counts.critical ?? 0 },
    { key: "high", label: "High", count: counts.high ?? 0 },
    { key: "medium", label: "Medium", count: counts.medium ?? 0 },
    { key: "low", label: "Low", count: counts.low ?? 0 },
    { key: "info", label: "Info", count: counts.info ?? 0 },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <Link
            href="/results"
            className="text-xs text-slate-500 hover:text-blue-600 inline-flex items-center gap-1 mb-2"
          >
            <ArrowLeft className="w-3 h-3" /> 結果一覧
            <ChevronRight className="w-3 h-3" />
            <span className="text-slate-700">詳細</span>
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">詳細結果レポート</h1>
          <p className="text-sm text-slate-500 mt-1 truncate">
            <span className="font-medium text-blue-600">{scan.url}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={handleExportJson}
          >
            <Download className="w-3.5 h-3.5" /> JSONエクスポート
          </Button>
        </div>
      </div>

      {/* 公式証明書ダウンロード */}
      {scan.status === "completed" && (
        <CertificateDownload scanId={scan.id} />
      )}

      {/* Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6 flex flex-col items-center">
            <RiskMeter score={riskScore} />
            <Separator className="my-4 w-full" />
            <div className="w-full space-y-2">
              {(["critical", "high", "medium", "low", "info"] as const).map((sev) => (
                <div key={sev} className="flex items-center gap-2">
                  <RiskBadge level={sev} />
                  <span className="text-sm text-slate-600 flex-1">{SEV_LABEL[sev]}</span>
                  <span className="text-sm font-semibold text-slate-800">
                    {counts[sev] ?? 0}件
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">スキャン概要</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "対象URL", value: scan.url },
              { label: "スキャンID", value: scan.id },
              {
                label: "スキャン開始",
                value: scan.startedAt
                  ? new Date(scan.startedAt).toLocaleString("ja-JP")
                  : scan.createdAt
                  ? new Date(scan.createdAt).toLocaleString("ja-JP")
                  : "—",
              },
              {
                label: "スキャン完了",
                value: scan.completedAt
                  ? new Date(scan.completedAt).toLocaleString("ja-JP")
                  : "—",
              },
              {
                label: "ステータス",
                value:
                  scan.status === "completed"
                    ? "完了"
                    : scan.status === "failed"
                    ? "失敗"
                    : scan.status,
              },
              { label: "総検出件数", value: `${findings.length}件` },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-start gap-3">
                <span className="text-xs font-medium text-slate-400 w-28 flex-shrink-0">{label}</span>
                <span className="text-sm text-slate-800 break-all">{value}</span>
              </div>
            ))}

            {findings.length > 0 && (counts.critical ?? 0) + (counts.high ?? 0) > 0 && (
              <>
                <Separator className="my-2" />
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                  <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5 mb-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> 総合評価
                  </p>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    {(counts.critical ?? 0) > 0
                      ? `重大度の高い脆弱性（Critical: ${counts.critical}件）が検出されています。早急な対応が必要です。`
                      : `Highレベルの脆弱性（${counts.high}件）が検出されています。優先的に対処してください。`}
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Findings */}
      <div>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-base font-semibold text-slate-900">検出された脆弱性</h2>
          <div className="flex gap-1.5 flex-wrap">
            {filters.map((f) =>
              f.count > 0 || f.key === "all" ? (
                <button
                  key={f.key}
                  onClick={() => setActiveFilter(f.key)}
                  className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                    activeFilter === f.key
                      ? "bg-slate-900 text-white"
                      : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {f.label}
                  {f.count > 0 && <span className="ml-1 opacity-70">({f.count})</span>}
                </button>
              ) : null
            )}
          </div>
        </div>

        {filtered.length === 0 ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="py-12 flex flex-col items-center text-slate-400">
              <Shield className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">このリスクレベルの脆弱性は検出されませんでした</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {sevKeys.map((sev) => (
              <div key={sev}>
                <div className="flex items-center gap-2 mb-2">
                  <RiskBadge level={sev as "critical" | "high" | "medium" | "low" | "info"} />
                  <h3 className="text-sm font-semibold text-slate-700">
                    {SEV_LABEL[sev] ?? sev}
                  </h3>
                  <span className="text-xs text-slate-400">{grouped[sev].length}件</span>
                </div>
                <div className="space-y-2">
                  {grouped[sev].map((finding) => (
                    <button
                      key={finding.id}
                      onClick={() => setSelectedFinding(finding)}
                      className="w-full text-left rounded-lg border border-slate-200 bg-white p-3 hover:border-blue-400 hover:bg-blue-50/30 transition-colors flex items-center gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {finding.type}
                        </p>
                        {finding.target && (
                          <p className="text-xs text-slate-400 mt-0.5 font-mono truncate">
                            {finding.target}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedFinding && (
        <FindingDetailModal
          finding={{
            id: selectedFinding.id,
            type: selectedFinding.type,
            severity: selectedFinding.severity,
            target: selectedFinding.target ?? "",
            impact: selectedFinding.impact ?? "",
          }}
          onClose={() => setSelectedFinding(null)}
        />
      )}
    </div>
  );
}
