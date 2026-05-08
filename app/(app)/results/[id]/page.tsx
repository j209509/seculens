"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle, CheckCircle, ExternalLink, Shield, ChevronDown, ChevronRight,
  FileText, Wrench, Loader2, Star,
} from "lucide-react";
import { RiskBadge } from "@/components/risk-badge";
import type { RiskLevel } from "@/lib/mock-data";
import { MOCK_SCAN_HISTORY } from "@/lib/mock-data";
import {
  findingToScsRequirements,
  severityToScsImpact,
  ALL_SCS_REQUIREMENTS,
} from "@/lib/scs-mapping";

interface Finding {
  id: string;
  type: string;
  severity: string;
  impact?: string;
  recommendation?: string;
  target?: string;
  description?: string;
  reportDrafts?: { title: string; content: string }[];
}

interface ScanDetail {
  id: string;
  url: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  riskScore?: number;
  findings: Finding[];
}

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

function FindingCard({ finding }: { finding: Finding }) {
  const [open, setOpen] = useState(false);
  const sev = (finding.severity?.toLowerCase() ?? "info") as RiskLevel;

  const borderColor =
    sev === "critical" ? "border-red-400" :
    sev === "high" ? "border-orange-400" :
    sev === "medium" ? "border-amber-400" :
    sev === "low" ? "border-green-400" : "border-blue-400";

  return (
    <div className={`rounded-lg border-l-4 ${borderColor} bg-white shadow-sm overflow-hidden`}>
      <button
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <RiskBadge level={sev} />
        <span className="flex-1 font-semibold text-sm text-slate-900">{finding.type}</span>
        {finding.target && (
          <span className="text-xs text-slate-400 mr-2 font-mono truncate max-w-[160px]">{finding.target}</span>
        )}
        {open ? <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />}
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-slate-100">
          <Tabs defaultValue="overview" className="mt-3">
            <TabsList className="h-8">
              <TabsTrigger value="overview" className="text-xs h-7">
                <FileText className="w-3 h-3 mr-1" />概要
              </TabsTrigger>
              <TabsTrigger value="impact" className="text-xs h-7">
                <AlertTriangle className="w-3 h-3 mr-1" />影響度
              </TabsTrigger>
              <TabsTrigger value="fix" className="text-xs h-7">
                <Wrench className="w-3 h-3 mr-1" />対策方法
              </TabsTrigger>
              <TabsTrigger value="scs" className="text-xs h-7">
                <Star className="w-3 h-3 mr-1" />SCS要件
              </TabsTrigger>
              {finding.reportDrafts && finding.reportDrafts.length > 0 && (
                <TabsTrigger value="report" className="text-xs h-7">
                  <FileText className="w-3 h-3 mr-1" />レポート
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="overview" className="mt-3">
              <p className="text-sm text-slate-700 leading-relaxed">
                {finding.description || finding.impact || "詳細情報がありません"}
              </p>
              {finding.target && (
                <div className="mt-3 flex gap-2 flex-wrap">
                  <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2.5 py-1 font-mono">
                    {finding.target}
                  </span>
                </div>
              )}
            </TabsContent>

            <TabsContent value="impact" className="mt-3 space-y-3">
              <div className="rounded-lg bg-orange-50 border border-orange-100 p-3">
                <p className="text-xs font-semibold text-orange-700 mb-1 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> 想定される影響
                </p>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {finding.impact || "影響情報がありません"}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-slate-50 p-3 text-center">
                  <p className="text-xs text-slate-500">リスクレベル</p>
                  <div className="mt-1.5 flex justify-center">
                    <RiskBadge level={sev} />
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3 text-center">
                  <p className="text-xs text-slate-500">対象</p>
                  <p className="text-xs font-medium text-slate-900 mt-1 font-mono break-all">
                    {finding.target || "—"}
                  </p>
                </div>
              </div>
              <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-3 flex items-center gap-2">
                <Star className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                <span className="text-xs text-indigo-700 font-medium">
                  SCS対応優先度: {severityToScsImpact(finding.severity)}
                </span>
              </div>
            </TabsContent>

            <TabsContent value="fix" className="mt-3">
              <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3">
                <p className="text-xs font-semibold text-emerald-700 mb-2 flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5" /> 推奨される対策
                </p>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {finding.recommendation || "対策情報がありません"}
                </p>
              </div>
            </TabsContent>

            <TabsContent value="scs" className="mt-3 space-y-3">
              {(() => {
                const reqIds = findingToScsRequirements(finding.type);
                const defaultId = "s3-prot-01";
                const resolvedIds = reqIds.length > 0 ? reqIds : [defaultId];
                const reqs = resolvedIds
                  .map((rid) => ALL_SCS_REQUIREMENTS.find((r) => r.id === rid))
                  .filter(Boolean) as typeof ALL_SCS_REQUIREMENTS;

                return (
                  <>
                    <p className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
                      <Star className="w-3.5 h-3.5 text-yellow-500" />
                      この脆弱性が関連するSCS要件
                    </p>
                    {reqs.length > 0 ? (
                      <div className="space-y-2">
                        {reqs.map((req) => (
                          <div
                            key={req.id}
                            className="flex items-start gap-2.5 rounded-lg border border-slate-100 bg-slate-50 p-3"
                          >
                            <span
                              className={`inline-flex flex-shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold leading-tight ${
                                req.star === 3
                                  ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                                  : "bg-blue-100 text-blue-700 border border-blue-200"
                              }`}
                            >
                              ★{req.star}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="text-[10px] text-slate-400 font-mono">{req.id}</div>
                              <div className="text-xs font-semibold text-slate-700 mt-0.5">{req.title}</div>
                              <div className="text-[11px] text-slate-500 mt-0.5">{req.category}</div>
                            </div>
                            {req.coverage && req.coverage !== "none" && (
                              <span className="inline-flex flex-shrink-0 items-center rounded-full bg-slate-200 px-1.5 py-0.5 text-[9px] font-medium text-slate-600">
                                {req.coverage}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">関連するSCS要件が見つかりませんでした</p>
                    )}
                    {reqIds.length === 0 && (
                      <p className="text-[10px] text-slate-400 mt-1">
                        ※ 直接マッピングなし。基本要件（{defaultId}）を表示しています。
                      </p>
                    )}
                  </>
                );
              })()}
            </TabsContent>

            {finding.reportDrafts && finding.reportDrafts.length > 0 && (
              <TabsContent value="report" className="mt-3 space-y-3">
                {finding.reportDrafts.map((draft, idx) => (
                  <div key={idx} className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                    <p className="text-xs font-semibold text-slate-700 mb-2">{draft.title}</p>
                    <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{draft.content}</p>
                  </div>
                ))}
              </TabsContent>
            )}
          </Tabs>
        </div>
      )}
    </div>
  );
}

export default function ResultDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [scan, setScan] = useState<ScanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState("all");

  useEffect(() => {
    async function fetchScan() {
      try {
        const res = await fetch(`/api/scans/${id}`);
        if (!res.ok) throw new Error("not found");
        const data = await res.json();
        setScan(data);
      } catch {
        // Fallback to mock data
        const mock = MOCK_SCAN_HISTORY.find((s) => s.id === id);
        if (mock) {
          setScan({
            id: mock.id,
            url: mock.url,
            status: mock.status,
            startedAt: mock.startedAt,
            completedAt: mock.completedAt,
            riskScore: mock.riskScore,
            findings: mock.vulnerabilities.map((v) => ({
              id: v.id,
              type: v.nameJa,
              severity: v.riskLevel,
              impact: v.impact,
              recommendation: v.recommendation,
              target: v.affectedUrl,
              description: v.description,
            })),
          });
        } else {
          setScan(null);
        }
      } finally {
        setLoading(false);
      }
    }
    fetchScan();
  }, [id]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!scan) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[400px] text-slate-400">
        <Shield className="w-12 h-12 mb-3 opacity-30" />
        <p className="text-sm">スキャン結果が見つかりませんでした</p>
      </div>
    );
  }

  const findings = scan.findings ?? [];
  const riskScore = scan.riskScore ?? 0;

  const countBySev = (sev: string) => findings.filter((f) => f.severity?.toLowerCase() === sev).length;
  const critical = countBySev("critical");
  const high = countBySev("high");
  const medium = countBySev("medium");
  const low = countBySev("low");

  const filteredFindings = activeFilter === "all"
    ? findings
    : findings.filter((f) => f.severity?.toLowerCase() === activeFilter);

  const filters = [
    { key: "all", label: "すべて", count: findings.length },
    { key: "critical", label: "Critical", count: critical },
    { key: "high", label: "High", count: high },
    { key: "medium", label: "Medium", count: medium },
    { key: "low", label: "Low", count: low },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">詳細結果レポート</h1>
          <p className="text-sm text-slate-500 mt-1">
            <span className="font-medium text-blue-600">{scan.url}</span> のスキャン結果
          </p>
        </div>
        <button className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline font-medium">
          <ExternalLink className="w-3.5 h-3.5" />
          PDFエクスポート
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6 flex flex-col items-center">
            <RiskMeter score={riskScore} />
            <Separator className="my-4 w-full" />
            <div className="w-full space-y-2">
              {[
                { label: "Critical", count: critical, color: "bg-red-500" },
                { label: "High", count: high, color: "bg-orange-500" },
                { label: "Medium", count: medium, color: "bg-amber-500" },
                { label: "Low", count: low, color: "bg-green-500" },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${item.color}`} />
                  <span className="text-sm text-slate-600 flex-1">{item.label}</span>
                  <span className="text-sm font-semibold text-slate-800">{item.count}件</span>
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
              { label: "スキャン開始", value: new Date(scan.startedAt).toLocaleString("ja-JP") },
              { label: "スキャン完了", value: scan.completedAt ? new Date(scan.completedAt).toLocaleString("ja-JP") : "—" },
              { label: "ステータス", value: scan.status === "completed" ? "完了" : scan.status === "failed" ? "失敗" : scan.status },
              { label: "総脆弱性数", value: `${findings.length}件` },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center gap-3">
                <span className="text-xs font-medium text-slate-400 w-28 flex-shrink-0">{label}</span>
                <span className="text-sm text-slate-800">{value}</span>
              </div>
            ))}

            {findings.length > 0 && (
              <>
                <Separator className="my-2" />
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                  <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5 mb-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> AIによる総合評価
                  </p>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    {critical > 0
                      ? `このサイトでは重大度の高い脆弱性が検出されています。特にCriticalレベルの脆弱性（${critical}件）は早急な対応が必要です。`
                      : high > 0
                      ? `Highレベルの脆弱性（${high}件）が検出されています。優先的に対処することを推奨します。`
                      : `中程度以下のリスクの脆弱性（${findings.length}件）が検出されています。計画的に対処してください。`
                    }
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Findings */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-900">検出された脆弱性</h2>
          <div className="flex gap-1.5">
            {filters.map((f) => (
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
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {filteredFindings.length > 0 ? (
            filteredFindings.map((finding) => <FindingCard key={finding.id} finding={finding} />)
          ) : (
            <div className="text-center py-12 text-slate-400">
              <Shield className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">このリスクレベルの脆弱性は検出されませんでした</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
