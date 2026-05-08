"use client";

import React, { useEffect, useState } from "react";
import {
  Shield,
  CheckCircle,
  AlertCircle,
  Star,
  FileText,
  ExternalLink,
  ChevronRight,
  Building2,
  Award,
  BarChart2,
  Info,
  ChevronDown,
  ChevronUp,
  XCircle,
  BookOpen,
  Download,
  Copy,
  Check,
  AlertTriangle,
  Globe,
  Loader2,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
// Badge available if needed
import { Button } from "@/components/ui/button";
import { Progress, ProgressTrack, ProgressIndicator } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";

import {
  SCS_STAR3_REQUIREMENTS,
  ALL_SCS_REQUIREMENTS,
  SCS_CATEGORY_LABELS,
  calcScsCoverage,
  type ScsCategory,
  type SequliaCoverage,
  type ScsRequirement,
} from "@/lib/scs-mapping";

// ─── helpers ────────────────────────────────────────────────────────────────

const COVERAGE_META: Record<
  SequliaCoverage,
  { label: string; icon: React.ReactNode; badgeClass: string }
> = {
  full: {
    label: "完全対応",
    icon: <CheckCircle className="size-3.5 text-emerald-600" />,
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  partial: {
    label: "部分対応",
    icon: <AlertCircle className="size-3.5 text-amber-600" />,
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
  },
  guide: {
    label: "ガイド支援",
    icon: <BookOpen className="size-3.5 text-blue-600" />,
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
  },
  none: {
    label: "対象外",
    icon: <XCircle className="size-3.5 text-slate-400" />,
    badgeClass: "bg-slate-50 text-slate-500 border-slate-200",
  },
};

function CoverageBadge({ coverage }: { coverage: SequliaCoverage }) {
  const meta = COVERAGE_META[coverage];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${meta.badgeClass}`}
    >
      {meta.icon}
      {meta.label}
    </span>
  );
}

function coveragePct(reqs: ScsRequirement[]) {
  const total = reqs.length;
  if (total === 0) return 0;
  const covered = reqs.filter(
    (r) => r.coverage === "full" || r.coverage === "partial"
  ).length;
  return Math.round((covered / total) * 100);
}

// ─── FAQ item ────────────────────────────────────────────────────────────────

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-slate-200 last:border-none">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 py-4 text-left text-sm font-medium text-slate-800 hover:text-blue-700"
      >
        <span>{q}</span>
        {open ? (
          <ChevronUp className="size-4 shrink-0 text-slate-400" />
        ) : (
          <ChevronDown className="size-4 shrink-0 text-slate-400" />
        )}
      </button>
      {open && (
        <p className="pb-4 text-sm leading-relaxed text-slate-600">{a}</p>
      )}
    </div>
  );
}

// ─── Category card ───────────────────────────────────────────────────────────

function CategoryCard({
  category,
  reqs,
}: {
  category: ScsCategory;
  reqs: ScsRequirement[];
}) {
  const meta = SCS_CATEGORY_LABELS[category];
  const pct = coveragePct(reqs);
  const [expanded, setExpanded] = useState(false);

  const colorClass =
    pct >= 70
      ? "text-emerald-600"
      : pct >= 40
      ? "text-amber-600"
      : "text-slate-500";

  const trackColor =
    pct >= 70
      ? "[&_[data-slot=progress-indicator]]:bg-emerald-500"
      : pct >= 40
      ? "[&_[data-slot=progress-indicator]]:bg-amber-500"
      : "[&_[data-slot=progress-indicator]]:bg-slate-400";

  return (
    <Card className="flex flex-col gap-0 overflow-visible py-0">
      <CardHeader className="border-b border-slate-100 px-4 py-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">{meta.icon}</span>
            <div>
              <CardTitle className="text-sm font-semibold text-slate-800">
                {meta.ja}
              </CardTitle>
              <CardDescription className="text-xs text-slate-400">
                {meta.en}
              </CardDescription>
            </div>
          </div>
          <span className={`text-lg font-bold tabular-nums ${colorClass}`}>
            {pct}%
          </span>
        </div>
        <Progress value={pct} className={`mt-2 gap-0 ${trackColor}`}>
          <ProgressTrack className="h-1.5 w-full rounded-full bg-slate-100">
            <ProgressIndicator />
          </ProgressTrack>
        </Progress>
      </CardHeader>

      <CardContent className="px-4 py-3">
        <ul className="space-y-2">
          {(expanded ? reqs : reqs.slice(0, 3)).map((req) => (
            <li key={req.id} className="flex items-start gap-2 text-xs">
              <span className="mt-0.5 shrink-0">
                {COVERAGE_META[req.coverage].icon}
              </span>
              <div className="min-w-0">
                <p className="font-medium text-slate-700 leading-snug">
                  {req.title}
                </p>
                <p className="text-slate-400 text-[11px] leading-snug mt-0.5">
                  {req.coverageNote}
                </p>
              </div>
            </li>
          ))}
        </ul>

        {reqs.length > 3 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="mt-3 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
          >
            {expanded ? (
              <>
                <ChevronUp className="size-3" /> 折り畳む
              </>
            ) : (
              <>
                <ChevronDown className="size-3" /> さらに{reqs.length - 3}件を表示
              </>
            )}
          </button>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

const ALL_CATEGORIES: ScsCategory[] = [
  "governance",
  "supplier_mgmt",
  "risk_identification",
  "protection",
  "detection",
  "response",
  "recovery",
];

// ─── テンプレート文言セクション ──────────────────────────────────────────────

const TEMPLATES = [
  {
    id: "conservative",
    level: "保守的（最も安全）",
    badge: "✅ 法的リスクゼロ",
    badgeClass: "bg-emerald-100 text-emerald-800",
    description: "事実のみを記載。制度名を使わず、実施内容を説明する表現です。",
    text: `当社では、インターネット公開サービスを対象とした定期的な脆弱性診断を実施しています。OWASP Top10（A01〜A10全カテゴリ）に準拠した自動診断ツールを活用し、Webアプリケーションおよびインフラのセキュリティ状態を継続的に確認・改善しています。`,
    hint: "どの企業でも安心して使える表現。ベンダー選定時の信頼性向上に有効。",
  },
  {
    id: "standard",
    level: "標準（推奨）",
    badge: "✅ 事実ベースで安全",
    badgeClass: "bg-blue-100 text-blue-800",
    description: "SCS制度への「取り組み」を表明する表現。「認定」「取得済」は使いません。",
    text: `当社は、経産省・IPAが推進するサプライチェーンセキュリティ評価制度（SCS）への対応を進めています。Sequliaを活用したOWASP Top10準拠の定期的な脆弱性診断により、SCS★3の「インターネット公開機器・サービスの脆弱性診断要件」への継続的な取り組みを実施しています。

診断実施頻度：月次
対象：インターネット公開全サービス
準拠規格：OWASP Top10・NIST CSF 2.0`,
    hint: "取引先・調達先への提示や自社Webサイトのセキュリティポリシーページに適した表現。",
  },
  {
    id: "active",
    level: "積極的（注意事項あり）",
    badge: "⚠️ 事実確認が必要",
    badgeClass: "bg-amber-100 text-amber-800",
    description: "SCS評価制度の要件に「対応している」と明記する表現。専門家確認が推奨されます。",
    text: `【サプライチェーンセキュリティへの取り組み】

当社は、経産省・IPA主管のサプライチェーンセキュリティ評価制度（SCS）における「インターネット公開機器・サービスの脆弱性診断」要件（★3基礎評価・技術要件）に対応した定期診断を実施しています。

■ 実施内容
・OWASP Top10全カテゴリ準拠の脆弱性診断（月次）
・174項目の自動セキュリティチェック
・CVE（既知脆弱性）データベースとの照合
・リスクスコアによる優先度付き改善管理

■ 対応する主なSCS★3要件
・インターネット公開機器・サービスの脆弱性診断の実施
・脆弱性情報の収集と管理
・Webアプリケーションの安全確認
・ソフトウェアの脆弱性パッチ管理

お取引先様からのセキュリティ確認書・アンケートへの対応も随時承ります。`,
    hint: "SCS★3の取得を目指していることを明示したい場合に使用。専門家（CISSP等）に確認してもらうとより確実。",
  },
];

const NG_EXPRESSIONS = [
  { text: "SCS★3 認定企業", reason: "IPA認定なしに「認定」は使用不可" },
  { text: "経産省認定 SCS対応企業", reason: "経産省が直接認定する仕組みではない" },
  { text: "SCS評価制度 認証取得済", reason: "第三者評価なしに「認証取得」は虚偽表示になる可能性" },
  { text: "IPA認定 SCS準拠", reason: "IPA認定プロセス未完了の場合は使用不可" },
  { text: "このツールだけでSCS★3取得できます", reason: "MFA・教育・ポリシー等の要件が別途必要" },
];

// ─── IPA SECURITY ACTION ロゴ ─────────────────────────────────────────────
// ロゴ画像ロード失敗時はSVGバッジにフォールバック
function IpaLogo({ className = "h-14" }: { className?: string }) {
  return (
    <img
      src="/ipa-security-action-2.svg"
      alt="IPA SECURITY ACTION ★2（二つ星）"
      className={`${className} w-auto object-contain`}
    />
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
        copied
          ? "bg-emerald-100 text-emerald-700"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {copied ? (
        <><Check className="size-3" />コピー済み</>
      ) : (
        <><Copy className="size-3" />文言をコピー</>
      )}
    </button>
  );
}

function DownloadButton({ template }: { template: typeof TEMPLATES[0] }) {
  function handleDownload() {
    const today = new Date().toLocaleDateString("ja-JP", {
      year: "numeric", month: "long", day: "numeric",
    });
    const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>セキュリティ対応宣言テンプレート（${template.level}）</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Helvetica Neue', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', Meiryo, sans-serif;
      max-width: 760px; margin: 48px auto; padding: 32px 40px;
      color: #1e293b; line-height: 1.7; background: #fff;
    }
    .header {
      display: flex; align-items: center; gap: 24px;
      padding-bottom: 24px; border-bottom: 2px solid #e2e8f0; margin-bottom: 28px;
    }
    .ipa-block { display: flex; flex-direction: column; align-items: center; gap: 6px; flex-shrink: 0; }
    .ipa-logo { height: 72px; width: auto; object-fit: contain; }
    .ipa-fallback {
      border: 2px solid #003087; border-radius: 4px; padding: 6px 12px;
      text-align: center; background: #fff;
    }
    .ipa-fallback .ipa-label { font-size: 8px; font-weight: bold; color: #003087; }
    .ipa-fallback .stars { color: #f59e0b; font-size: 18px; }
    .ipa-caption { font-size: 10px; color: #64748b; text-align: center; max-width: 80px; }
    .title-block h1 { font-size: 20px; font-weight: 800; color: #1e3a5f; margin-bottom: 6px; }
    .title-block p { font-size: 12px; color: #64748b; }
    .badge {
      display: inline-block; padding: 4px 12px; border-radius: 9999px;
      font-size: 12px; font-weight: 700; margin-bottom: 20px;
      background: #dbeafe; color: #1d4ed8;
    }
    .template-box {
      background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px;
      padding: 28px 32px; font-size: 14px; line-height: 1.9;
      white-space: pre-wrap; color: #1e293b;
    }
    .hint {
      margin-top: 16px; padding: 12px 16px; background: #eff6ff;
      border: 1px solid #bfdbfe; border-radius: 6px;
      font-size: 12px; color: #1d4ed8;
    }
    .ng-section { margin-top: 28px; }
    .ng-section h3 { font-size: 13px; font-weight: 700; color: #7f1d1d; margin-bottom: 10px; }
    .ng-list { display: flex; flex-wrap: wrap; gap: 8px; }
    .ng-tag {
      background: #fee2e2; color: #991b1b; border-radius: 9999px;
      padding: 3px 10px; font-size: 11px; font-weight: 600;
    }
    .footer {
      margin-top: 32px; padding-top: 20px; border-top: 1px solid #e2e8f0;
      font-size: 11px; color: #94a3b8; line-height: 1.8;
    }
    .footer a { color: #3b82f6; }
    .generated { margin-top: 16px; font-size: 11px; color: #cbd5e1; }
  </style>
</head>
<body>
  <div class="header">
    <div class="ipa-block">
      <!-- IPA SECURITY ACTION ★2 ロゴはIPA公式申請後に取得してください -->
      <!-- 申請URL: https://www.ipa.go.jp/security/security-action/ -->
      <div class="ipa-fallback">
        <div class="ipa-label">IPA</div>
        <div class="ipa-label">SECURITY ACTION</div>
        <div class="stars">★★</div>
        <div class="ipa-label" style="font-size:8px;">（二つ星）</div>
      </div>
      <div class="ipa-caption">IPA SECURITY ACTION ★2（二つ星）</div>
    </div>
    <div class="title-block">
      <h1>セキュリティ対応宣言テンプレート</h1>
      <p>経産省 SCS評価制度 脆弱性診断要件対応 ／ Sequlia 生成</p>
    </div>
  </div>

  <div class="badge">${template.badge}　${template.level}</div>

  <div class="template-box">${template.text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>

  <div class="hint">💡 ${template.hint}</div>

  <div class="ng-section">
    <h3>⚠️ 使用してはいけない表現（NG例）</h3>
    <div class="ng-list">
      <span class="ng-tag">SCS★3 認定企業</span>
      <span class="ng-tag">経産省認定 SCS対応企業</span>
      <span class="ng-tag">SCS評価制度 認証取得済</span>
      <span class="ng-tag">IPA認定 SCS準拠</span>
    </div>
  </div>

  <div class="footer">
    <p>※ 本テンプレートは事実ベースの適切な表現を収録しています。「SCS認定取得済」「IPA認定」等の誤解を招く表現は使用しないようご注意ください。</p>
    <p>※ IPA SECURITY ACTION ★2の申請・取得は <a href="https://www.ipa.go.jp/security/security-action/" target="_blank">IPA公式サイト</a> でご確認ください。</p>
    <p>※ SCS評価制度の最新情報は <a href="https://www.ipa.go.jp/security/scs/" target="_blank">IPA（ipa.go.jp/security/scs/）</a> をご確認ください。</p>
  </div>

  <div class="generated">Sequlia にて ${today} 生成｜OWASP Top10準拠 脆弱性診断ツール</div>
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `security-declaration-${template.id}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <button
      onClick={handleDownload}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition-all"
    >
      <Download className="size-3" />
      ロゴ付きでDL
    </button>
  );
}

function TemplateSection() {
  const [activeTab, setActiveTab] = useState("standard");
  const active = TEMPLATES.find((t) => t.id === activeTab) ?? TEMPLATES[1];

  return (
    <section className="mt-10 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100">
          <Globe className="size-5 text-indigo-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">自社サイト掲載用テンプレート文言</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            取引先・調達先への安全確認書、セキュリティポリシーページ、入札資料等にご活用ください。
          </p>
        </div>
      </div>

      {/* 重要注意事項カード */}
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="size-5 shrink-0 text-amber-600 mt-0.5" />
            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-amber-900">「SCS★3認定企業」と名乗るのはNG ─ SDGsとは制度構造が違います</p>
              <p className="text-xs text-amber-800 leading-relaxed">
                SCS★3は専門家確認付きの自己評価、★4は第三者機関による評価が必要な<strong>認定制度</strong>です。SDGsの取り組み宣言とは異なり、IPA審査なしに「SCS認定取得」は名乗れません。
                また経産省は<strong>2026年4月に誤解を招く広告表現への注意喚起</strong>を発出しています。
                下記テンプレートは事実ベースの適切な表現のみを収録しています。
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {NG_EXPRESSIONS.map((ng) => (
                  <div key={ng.text} className="flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1">
                    <XCircle className="size-3 text-red-500 shrink-0" />
                    <span className="text-xs font-medium text-red-700">{ng.text}</span>
                    <span className="text-xs text-red-500">—{ng.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SECURITY ACTION の提案（IPAロゴ付き） */}
      <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 overflow-hidden">
        <CardContent className="pt-5 pb-5">
          <div className="flex flex-col sm:flex-row items-start gap-5">
            {/* IPAロゴ */}
            <div className="flex flex-col items-center gap-1.5 shrink-0">
              <IpaLogo className="h-20" />
              <span className="text-[10px] text-blue-600 font-semibold text-center leading-tight">
                IPA<br />SECURITY ACTION<br />★2（二つ星）
              </span>
            </div>
            {/* テキスト */}
            <div className="flex-1">
              <p className="text-sm font-bold text-blue-900 mb-1.5">
                💡 SDGsのように自己宣言したいなら → IPA「SECURITY ACTION ★2」がオススメ
              </p>
              <p className="text-xs text-blue-800 leading-relaxed mb-3">
                IPAの<strong>SECURITY ACTION</strong>は、Sequliaのような脆弱性診断ツールを活用していれば
                <strong>★2（2つ星）</strong>を自己宣言でき、<strong>IPAの公式ロゴを自社サイトに掲載</strong>できます。
                SCS★3の前身プログラムであり、取引先への信頼性アピールにも有効です。
                Sequliaのご利用は★2宣言の実施根拠として十分に活用できます。
              </p>
              <div className="flex flex-wrap gap-2 items-center">
                <a
                  href="https://www.ipa.go.jp/security/security-action/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-blue-700 transition-colors"
                >
                  IPA SECURITY ACTION 申請・詳細
                  <ExternalLink className="size-3" />
                </a>
                <span className="text-xs text-blue-600">無料・自己宣言のみ・審査なし</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* テンプレート選択・表示 */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">テンプレート文言（3段階）</CardTitle>
          <CardDescription className="text-xs">
            表現の強度を選んで、そのままコピー＆ペーストしてご利用ください。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* タブ */}
          <div className="flex gap-2 flex-wrap mb-4">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                  activeTab === t.id
                    ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                {t.level}
              </button>
            ))}
          </div>

          {/* アクティブテンプレート */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            {/* ヘッダー行：バッジ・説明・操作ボタン */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${active.badgeClass}`}>
                  {active.badge}
                </span>
                <span className="text-xs text-slate-500">{active.description}</span>
              </div>
              <div className="flex items-center gap-2">
                <CopyButton text={active.text} />
                <DownloadButton template={active} />
              </div>
            </div>

            {/* IPAロゴ＋テンプレート本文 */}
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              {/* IPAロゴをテンプレートの右上に表示 */}
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex-1">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">テンプレート本文</p>
                </div>
                <div className="flex flex-col items-center gap-1 shrink-0">
                  <IpaLogo className="h-12" />
                  <span className="text-[9px] text-slate-400 text-center leading-tight">IPA SECURITY ACTION<br />★2（二つ星）</span>
                </div>
              </div>
              <pre className="whitespace-pre-wrap text-sm text-slate-800 leading-relaxed font-sans border-t border-slate-100 pt-3">
                {active.text}
              </pre>
            </div>

            <div className="flex items-start gap-2 rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2">
              <Info className="size-3.5 text-indigo-500 mt-0.5 shrink-0" />
              <p className="text-xs text-indigo-700">{active.hint}</p>
            </div>

            {/* ダウンロード説明 */}
            <div className="flex items-start gap-2 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2">
              <Download className="size-3.5 text-emerald-600 mt-0.5 shrink-0" />
              <p className="text-xs text-emerald-700">
                「ロゴ付きでDL」ボタンで<strong>IPAロゴ入りHTMLファイル</strong>をダウンロードできます。
                そのままWebサイトに貼り付けたり、印刷してご利用いただけます。
              </p>
            </div>
          </div>

          {/* 使用シーン */}
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { icon: "📋", title: "取引先への回答書", desc: "サプライチェーン確認アンケート・セキュリティ質問票への回答に" },
              { icon: "🌐", title: "自社Webサイト", desc: "セキュリティポリシーページ・会社情報のIR・CSR欄に" },
              { icon: "📁", title: "入札・RFP資料", desc: "政府・大企業向け提案書のセキュリティ要件回答欄に" },
            ].map((s) => (
              <div key={s.title} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <p className="text-base mb-1">{s.icon}</p>
                <p className="text-xs font-semibold text-slate-800">{s.title}</p>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

type LiveScanLite = {
  id: string;
  status: string;
  riskScore: number;
  createdAt: string;
  completedAt: string | null;
  findings: { severity: string }[];
};

type UserScanStats = {
  loading: boolean;
  error: string | null;
  totalLast30: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  lastScanAt: string | null;
};

function useUserScanStats(): UserScanStats {
  const [state, setState] = useState<UserScanStats>({
    loading: true,
    error: null,
    totalLast30: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    lastScanAt: null,
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/scans");
        if (!res.ok) {
          if (res.status === 401) {
            if (!cancelled) setState((s) => ({ ...s, loading: false }));
            return;
          }
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as LiveScanLite[];
        if (!Array.isArray(data) || cancelled) {
          if (!cancelled) setState((s) => ({ ...s, loading: false }));
          return;
        }
        const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const last30 = data.filter((s) => new Date(s.createdAt).getTime() >= cutoff);
        let critical = 0;
        let high = 0;
        let medium = 0;
        let low = 0;
        for (const sc of data) {
          for (const f of sc.findings ?? []) {
            const sev = (f.severity || "").toLowerCase();
            if (sev === "critical") critical++;
            else if (sev === "high") high++;
            else if (sev === "medium") medium++;
            else if (sev === "low") low++;
          }
        }
        const completed = data
          .filter((s) => s.status === "completed" && s.completedAt)
          .sort(
            (a, b) =>
              new Date(b.completedAt as string).getTime() -
              new Date(a.completedAt as string).getTime()
          );
        if (!cancelled) {
          setState({
            loading: false,
            error: null,
            totalLast30: last30.length,
            critical,
            high,
            medium,
            low,
            lastScanAt: completed[0]?.completedAt ?? null,
          });
        }
      } catch (e) {
        if (!cancelled) {
          setState((s) => ({
            ...s,
            loading: false,
            error: e instanceof Error ? e.message : "取得に失敗しました",
          }));
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return state;
}

function ScsUserKpi() {
  const stats = useUserScanStats();

  return (
    <section className="mt-8">
      <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <BarChart2 className="size-4 text-blue-600" />
          <h2 className="text-sm font-semibold text-slate-800">あなたのSCS対応状況（実データ）</h2>
          {stats.loading && <Loader2 className="size-3.5 animate-spin text-blue-500" />}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg bg-white border border-slate-100 px-4 py-3">
            <p className="text-[11px] text-slate-500 font-medium">過去30日のスキャン</p>
            <p className="text-2xl font-bold text-blue-600 tabular-nums mt-0.5">{stats.totalLast30}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">件 / 30日間</p>
          </div>
          <div className="rounded-lg bg-white border border-slate-100 px-4 py-3">
            <p className="text-[11px] text-slate-500 font-medium">重大度の高い検出</p>
            <p className="text-2xl font-bold text-red-600 tabular-nums mt-0.5">
              {stats.critical + stats.high}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              C: {stats.critical} / H: {stats.high}
            </p>
          </div>
          <div className="rounded-lg bg-white border border-slate-100 px-4 py-3">
            <p className="text-[11px] text-slate-500 font-medium">中・低リスク検出</p>
            <p className="text-2xl font-bold text-amber-600 tabular-nums mt-0.5">
              {stats.medium + stats.low}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              M: {stats.medium} / L: {stats.low}
            </p>
          </div>
          <div className="rounded-lg bg-white border border-slate-100 px-4 py-3">
            <p className="text-[11px] text-slate-500 font-medium">前回の診断日</p>
            <p className="text-sm font-bold text-slate-800 tabular-nums mt-1">
              {stats.lastScanAt
                ? new Date(stats.lastScanAt).toLocaleDateString("ja-JP", {
                    year: "numeric", month: "2-digit", day: "2-digit",
                  })
                : "—"}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {stats.lastScanAt ? "完了スキャン" : "未実施"}
            </p>
          </div>
        </div>
        {stats.error && (
          <p className="text-[11px] text-red-500 mt-2">取得エラー: {stats.error}</p>
        )}
        {!stats.loading && !stats.error && stats.totalLast30 === 0 && (
          <p className="text-[11px] text-slate-500 mt-2">
            まだスキャンが実行されていません。
            <a href="/scan" className="ml-1 text-blue-600 hover:underline">
              最初のスキャンを実行 →
            </a>
          </p>
        )}
      </div>
    </section>
  );
}

export default function CompliancePage() {
  const star3Stats = calcScsCoverage(SCS_STAR3_REQUIREMENTS);
  const allStats = calcScsCoverage(ALL_SCS_REQUIREMENTS);
  const star3Pct = Math.round(
    ((star3Stats.full + star3Stats.partial) / star3Stats.total) * 100
  );

  // Group all requirements by category
  const byCategory = (cat: ScsCategory) =>
    ALL_SCS_REQUIREMENTS.filter((r) => r.category === cat);

  return (
    <div className="min-h-screen bg-slate-50 pb-16">

      {/* ── SECTION 1: Hero Banner ─────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 px-4 py-14 text-white">
        {/* subtle grid overlay */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg,transparent,transparent 39px,white 40px),repeating-linear-gradient(90deg,transparent,transparent 39px,white 40px)",
          }}
        />

        <div className="relative mx-auto max-w-5xl">
          {/* Government badge */}
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-400/40 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-200">
              <Building2 className="size-3.5" />
              経産省・IPA 主管
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-500/40 bg-slate-500/10 px-3 py-1 text-xs font-medium text-slate-300">
              NIST CSF 2.0・ISO 27001:2022 準拠
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-200">
              <Star className="size-3.5 fill-amber-300 text-amber-300" />
              2027年2月 本格運用開始予定
            </span>
          </div>

          <h1 className="mb-3 text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">
            経産省 サプライチェーンセキュリティ<br className="hidden sm:block" />
            評価制度（SCS）対応
          </h1>

          <p className="mb-8 max-w-2xl text-base leading-relaxed text-slate-300">
            SCS評価制度は、サプライチェーン全体のセキュリティ強化を目的に経産省・IPAが主管する
            日本初の国家サイバーセキュリティ認定制度です。Sequliaは
            <span className="font-semibold text-white">
              脆弱性診断要件（★3・★4）に直接対応
            </span>
            し、評価取得に必要なエビデンスの自動生成を支援します。
          </p>

          {/* Star level badges */}
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3">
              <Award className="size-5 text-emerald-400" />
              <div>
                <p className="text-xs font-semibold text-emerald-300">★3 BASIS</p>
                <p className="text-[11px] text-emerald-400/80">
                  26項目 / 83評価基準・自己評価・1年
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-blue-400/30 bg-blue-500/10 px-4 py-3">
              <Award className="size-5 text-blue-400" />
              <div>
                <p className="text-xs font-semibold text-blue-300">★4 STANDARD</p>
                <p className="text-[11px] text-blue-400/80">
                  44項目 / 157評価基準・第三者評価・3年
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-slate-500/30 bg-slate-600/10 px-4 py-3">
              <Award className="size-5 text-slate-400" />
              <div>
                <p className="text-xs font-semibold text-slate-300">★5 FUTURE</p>
                <p className="text-[11px] text-slate-400/80">
                  制度設計中・詳細未公開
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4">

        {/* ── ユーザー実データKPI ─────────────────────────────── */}
        <ScsUserKpi />

        {/* ── SECTION 2: Coverage Summary Cards ─────────────────────────── */}
        <section className="mt-8">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">

            {/* Full coverage count */}
            <Card className="py-5 text-center">
              <CardContent className="px-4 py-0">
                <p className="text-4xl font-bold text-emerald-600 tabular-nums">
                  {allStats.full}
                </p>
                <p className="mt-1 text-xs font-medium text-slate-600">
                  Sequliaが直接対応
                </p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  完全カバー要件数
                </p>
              </CardContent>
            </Card>

            {/* Partial + guide count */}
            <Card className="py-5 text-center">
              <CardContent className="px-4 py-0">
                <p className="text-4xl font-bold text-amber-500 tabular-nums">
                  {allStats.partial + allStats.guide}
                </p>
                <p className="mt-1 text-xs font-medium text-slate-600">
                  部分対応・補助
                </p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  検出支援＋ガイド資料
                </p>
              </CardContent>
            </Card>

            {/* ★3 coverage rate */}
            <Card className="py-5 text-center">
              <CardContent className="px-4 py-0">
                <p className="text-4xl font-bold text-blue-600 tabular-nums">
                  {star3Pct}%
                </p>
                <p className="mt-1 text-xs font-medium text-slate-600">
                  ★3要件カバー率
                </p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  完全＋部分対応の合計
                </p>
              </CardContent>
            </Card>

            {/* OWASP Top10 */}
            <Card className="py-5 text-center">
              <CardContent className="px-4 py-0">
                <p className="text-4xl font-bold text-indigo-600 tabular-nums">
                  全10
                </p>
                <p className="mt-1 text-xs font-medium text-slate-600">
                  OWASP Top10
                </p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  全カテゴリ A01〜A10
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* ── SECTION 3: ★3 Direct Coverage Highlight ───────────────────── */}
        <section className="mt-8">
          <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <CheckCircle className="size-5 text-emerald-600" />
              <h2 className="text-base font-semibold text-emerald-800">
                Sequliaが直接対応する★3要件
              </h2>
              <span className="ml-auto rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                完全対応 {star3Stats.full}件
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {SCS_STAR3_REQUIREMENTS.filter((r) => r.coverage === "full").map(
                (req) => (
                  <div
                    key={req.id}
                    className="flex items-start gap-3 rounded-lg border border-emerald-100 bg-white px-4 py-3 shadow-sm"
                  >
                    <CheckCircle className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {req.title}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 leading-snug">
                        {req.coverageNote}
                      </p>
                      {req.relatedChecks && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {req.relatedChecks.slice(0, 4).map((c) => (
                            <span
                              key={c}
                              className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 border border-emerald-100"
                            >
                              {c}
                            </span>
                          ))}
                          {req.relatedChecks.length > 4 && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                              +{req.relatedChecks.length - 4}件
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        </section>

        {/* ── SECTION 4: 7カテゴリ別カバレッジ ─────────────────────────── */}
        <section className="mt-10">
          <div className="mb-4 flex items-center gap-2">
            <BarChart2 className="size-5 text-slate-600" />
            <h2 className="text-lg font-semibold text-slate-800">
              SCS 7カテゴリ別カバレッジ
            </h2>
          </div>

          {/* Legend */}
          <div className="mb-4 flex flex-wrap items-center gap-4 text-xs text-slate-500">
            {(Object.entries(COVERAGE_META) as [SequliaCoverage, typeof COVERAGE_META[SequliaCoverage]][]).map(
              ([key, meta]) => (
                <span key={key} className="flex items-center gap-1">
                  {meta.icon}
                  {meta.label}
                </span>
              )
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ALL_CATEGORIES.map((cat) => (
              <CategoryCard
                key={cat}
                category={cat}
                reqs={byCategory(cat)}
              />
            ))}
          </div>
        </section>

        {/* ── SECTION 5: SCS対応エビデンスレポート ─────────────────────── */}
        <section className="mt-10">
          <Card>
            <CardHeader className="border-b border-slate-100 px-6 py-5">
              <div className="flex items-center gap-2">
                <FileText className="size-5 text-blue-600" />
                <CardTitle className="text-base font-semibold text-slate-800">
                  SCS対応エビデンスレポート
                </CardTitle>
              </div>
              <CardDescription className="mt-1 text-sm text-slate-500">
                Sequliaは評価機関への提出に対応した証跡ドキュメントを自動生成します
              </CardDescription>
            </CardHeader>
            <CardContent className="px-6 py-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
                  <div className="mt-0.5 rounded-md bg-blue-100 p-1.5">
                    <FileText className="size-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      脆弱性診断実施証明書
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      PDF出力対応。診断日時・対象URL・実施チェック一覧を記載
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
                  <div className="mt-0.5 rounded-md bg-emerald-100 p-1.5">
                    <Shield className="size-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      OWASP Top10 準拠チェックレポート
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      A01〜A10 全カテゴリの検査結果・合否を一覧表示
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
                  <div className="mt-0.5 rounded-md bg-indigo-100 p-1.5">
                    <BarChart2 className="size-4 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      リスクスコア推移レポート
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      継続的改善の証跡。過去スキャンのスコアトレンドをグラフ化
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
                  <div className="mt-0.5 rounded-md bg-slate-200 p-1.5">
                    <Info className="size-4 text-slate-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      スキャン履歴ログ
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      診断実施日時・対象URL・検出件数を蓄積。定期実施の証跡に
                    </p>
                  </div>
                </div>
              </div>

              <Separator className="my-5" />

              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-2 text-sm text-slate-600">
                  <Info className="mt-0.5 size-4 shrink-0 text-blue-500" />
                  <span>
                    エビデンスレポートはスキャン完了後、ダッシュボードのスキャン詳細から出力できます。
                    評価機関（IPA指定）への提出書類として活用可能です。
                  </span>
                </div>
                <Button variant="outline" size="sm" className="shrink-0 gap-1.5">
                  <Download className="size-4" />
                  SCSエビデンスレポートを生成
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ── SECTION 6: FAQ ────────────────────────────────────────────── */}
        <section className="mt-10">
          <div className="mb-4 flex items-center gap-2">
            <Info className="size-5 text-slate-600" />
            <h2 className="text-lg font-semibold text-slate-800">
              よくある質問
            </h2>
          </div>

          <Card>
            <CardContent className="px-6 py-2">
              <FaqItem
                q="SequliaだけでSCS★3取得できますか？"
                a="SCS★3の脆弱性診断要件（インターネット公開機器・サービスの定期的な脆弱性診断実施）には完全対応しています。MFA設定・バックアップ・従業員教育等の要件は別途対応が必要ですが、Sequliaはそれらの実施状況を可視化する根拠資料の生成を支援します。"
              />
              <FaqItem
                q="★4評価にも使えますか？"
                a="★4が要求する「第三者機関レベルの脆弱性診断」要件に対応しています。Sequliaの診断レポートは評価機関への提出書類として活用できます。★4では取引先管理・継続的な脆弱性管理プログラムへの対応も強化されており、Sequliaはサプライチェーン全体の診断・管理を支援します。"
              />
              <FaqItem
                q="経産省の注意喚起について教えてください。"
                a="経産省は2026年4月に「SCS制度に関する誤解を招く広告表現」への注意喚起を発出しています。Sequliaは「脆弱性診断要件への対応」に特化した正確な表現を使用しており、制度への完全準拠を単独で保証するものではありません。評価取得にはIPA指定の評価機関による審査が別途必要です。"
              />
              <FaqItem
                q="SCS評価制度はいつから始まりますか？"
                a="2027年2月〜3月より★3・★4の本格運用が開始予定です（IPA主管）。現在は制度準備期間であり、Sequliaで今から脆弱性診断を実施・記録することで、評価開始時に診断実績の証跡を提示できます。定期的な診断履歴が評価において重要な根拠となります。"
              />
            </CardContent>
          </Card>
        </section>

        {/* ── Quick reference table ──────────────────────────────────────── */}
        <section className="mt-10">
          <div className="mb-4 flex items-center gap-2">
            <ChevronRight className="size-5 text-slate-600" />
            <h2 className="text-lg font-semibold text-slate-800">
              Sequliaの対応要件一覧
            </h2>
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left">
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 w-20">
                      等級
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      要件
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 w-24 text-center">
                      カバレッジ
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ALL_SCS_REQUIREMENTS.map((req) => (
                    <tr
                      key={req.id}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                            req.star === 3
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-blue-50 text-blue-700"
                          }`}
                        >
                          ★{req.star}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{req.title}</p>
                        <p className="mt-0.5 text-xs text-slate-400 leading-snug">
                          {req.description}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <CoverageBadge coverage={req.coverage} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </section>

        {/* ── 自社サイト掲載用テンプレート文言 ────────────────────────── */}
        <TemplateSection />

        {/* ── Footer disclaimer ─────────────────────────────────────────── */}
        <footer className="mt-10 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-100/60 px-4 py-4 text-xs leading-relaxed text-slate-500">
          <Info className="mt-0.5 size-4 shrink-0 text-slate-400" />
          <p>
            ※ 本ページはSequliaが対応するSCS要件の範囲を説明するものです。
            SCS認定の取得にはIPA指定の評価機関による審査が必要です。
            最新情報は
            <a
              href="https://www.ipa.go.jp/security/scs/"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-0.5 inline-flex items-center gap-0.5 text-blue-600 underline underline-offset-2 hover:text-blue-800"
            >
              IPA（ipa.go.jp/security/scs/）
              <ExternalLink className="size-3" />
            </a>
            をご確認ください。
          </p>
        </footer>
      </div>
    </div>
  );
}
