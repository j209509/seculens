"use client";

import { useEffect, useState } from "react";
import { X, ExternalLink, AlertTriangle, Wrench, BookOpen, ShieldCheck, Loader2 } from "lucide-react";

type FindingLite = {
  id: string;
  type: string;
  severity: string;
  target: string;
  impact: string;
};

type FullFinding = FindingLite & {
  evidence?: string;
  reproductionSteps?: string;
  recommendedAction?: string;
  owasp?: string;
  cvssScore?: number;
  category?: string;
  affectedUrl?: string;
  inScopeReason?: string;
  aiTriageReason?: string;
};

const SEV_BG: Record<string, string> = {
  critical: "bg-red-600",
  high: "bg-orange-500",
  medium: "bg-amber-500",
  low: "bg-emerald-500",
  info: "bg-slate-400",
};

const SEV_LABEL: Record<string, string> = {
  critical: "緊急",
  high: "高",
  medium: "中",
  low: "低",
  info: "情報",
};

// 静的な解説辞書（type名をキーに、よくある脆弱性タイプを解説）
// AIトリアージ未生成時のフォールバック
const TYPE_EXPLANATIONS: Record<string, { what: string; risk: string; fix: string; refs?: { label: string; url: string }[] }> = {
  "Missing-Security-Header": {
    what: "セキュリティ関連のHTTPレスポンスヘッダー（HSTS/CSP/X-Frame-Options等）が設定されていません。",
    risk: "中間者攻撃でのHTTPS強制、クリックジャッキング、XSSの成功率が上がります。",
    fix: "Webサーバーまたはアプリケーションフレームワークでヘッダーを追加してください。Nginxなら add_header、Express なら helmet ミドルウェアを使うのが一般的です。",
    refs: [
      { label: "OWASP Secure Headers Project", url: "https://owasp.org/www-project-secure-headers/" },
      { label: "MDN: HTTP headers", url: "https://developer.mozilla.org/ja/docs/Web/HTTP/Headers" },
    ],
  },
  "Cookie-Flag-Missing": {
    what: "Cookie に Secure / HttpOnly / SameSite フラグが付いていません。",
    risk: "セッションIDが盗まれる、CSRF攻撃が成立しやすくなります。",
    fix: "Cookie 設定で Secure; HttpOnly; SameSite=Lax または Strict を必ず指定してください。",
    refs: [{ label: "MDN: Set-Cookie", url: "https://developer.mozilla.org/ja/docs/Web/HTTP/Headers/Set-Cookie" }],
  },
  "Outdated-Software": {
    what: "既知の脆弱性が報告されている古いバージョンのソフトウェア（フレームワーク・ライブラリ・サーバ等）が検出されました。",
    risk: "公開されているCVEを悪用される可能性があります。攻撃ツールが流通しているケースもあります。",
    fix: "最新の安定版にアップデートしてください。アップデートが難しい場合はパッチ適用やWAFでの一時的な保護も検討。",
    refs: [{ label: "NIST NVD", url: "https://nvd.nist.gov/" }],
  },
  "Information-Disclosure": {
    what: "サーバー内部情報や機密データが意図せず公開されています。",
    risk: "攻撃者が次の攻撃の手がかり（バージョン、内部パス、メールアドレス等）を得られます。",
    fix: "Server / X-Powered-By ヘッダーを抑制し、エラーページや HTML コメントから内部情報を取り除いてください。",
  },
  "Open-Redirect": {
    what: "任意のURLにリダイレクトできるパラメータが存在します。",
    risk: "フィッシング、認証バイパスに悪用されます。Microsoft や Google ログインでも問題になる典型的な脆弱性。",
    fix: "リダイレクト先を許可リスト方式（whitelist）にし、外部ドメインへのリダイレクトを禁止してください。",
  },
  "CORS-Misconfiguration": {
    what: "CORS（クロスオリジンリソース共有）の設定が緩すぎます（Origin リフレクション、wildcard 等）。",
    risk: "他サイトのJSから認証情報付きでAPIを呼べるようになり、データ漏洩や不正操作のリスクが上がります。",
    fix: "Access-Control-Allow-Origin に信頼できるドメインのみを明示してください。* と credentials の併用は禁止。",
  },
  "DNS-Email-Security": {
    what: "メール認証関連のDNS設定（SPF / DKIM / DMARC）が不備または未設定です。",
    risk: "なりすましメール（フィッシング）を送られやすくなり、ブランドや顧客の信頼を損ねます。",
    fix: "DNSにSPF（v=spf1 ~all）、DKIM、DMARC（p=quarantine 以上）を設定してください。Google Postmaster Tools で確認できます。",
    refs: [{ label: "Google: メール送信者ガイド", url: "https://support.google.com/mail/answer/81126" }],
  },
};

function explainType(type: string): { what: string; risk: string; fix: string; refs?: { label: string; url: string }[] } {
  // パターンマッチで近いものを返す
  const lower = type.toLowerCase();
  if (/header|hsts|csp|x-frame|x-content/.test(lower)) return TYPE_EXPLANATIONS["Missing-Security-Header"];
  if (/cookie/.test(lower)) return TYPE_EXPLANATIONS["Cookie-Flag-Missing"];
  if (/outdated|version|cve|jquery|wordpress/.test(lower)) return TYPE_EXPLANATIONS["Outdated-Software"];
  if (/info.*disclos|leak|exposure|banner|server-info/.test(lower)) return TYPE_EXPLANATIONS["Information-Disclosure"];
  if (/redirect|open-redirect/.test(lower)) return TYPE_EXPLANATIONS["Open-Redirect"];
  if (/cors/.test(lower)) return TYPE_EXPLANATIONS["CORS-Misconfiguration"];
  if (/dns|email|spf|dkim|dmarc/.test(lower)) return TYPE_EXPLANATIONS["DNS-Email-Security"];
  return {
    what: `「${type}」が検出されました。詳細はリスク内容と推奨対応をご確認ください。`,
    risk: "攻撃者がこの問題を悪用すると、認証バイパス・データ漏洩・サービス停止等のリスクがあります。",
    fix: "最新のセキュリティガイドラインに従って修正してください。スキャン完了後、AI解析レポートで詳細な対応手順が提供されます。",
  };
}

export function FindingDetailModal({ finding, onClose }: { finding: FindingLite | null; onClose: () => void }) {
  const [full, setFull] = useState<FullFinding | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!finding) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/findings/${finding.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        // API returns finding directly OR wrapped
        const f = d.finding ?? d;
        if (f && typeof f === "object" && "id" in f) setFull(f as FullFinding);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [finding]);

  // ESCで閉じる
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!finding) return null;
  const expl = explainType(finding.type);
  const sev = finding.severity.toLowerCase();
  const sevBg = SEV_BG[sev] ?? "bg-slate-400";
  const sevLabel = SEV_LABEL[sev] ?? finding.severity;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-200">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className={`inline-block ${sevBg} text-white text-xs font-bold px-2.5 py-1 rounded`}>
                {sevLabel}
              </span>
              {full?.owasp && (
                <span className="inline-block bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-1 rounded">
                  {full.owasp}
                </span>
              )}
              {full?.cvssScore != null && full.cvssScore > 0 && (
                <span className="inline-block bg-purple-100 text-purple-800 text-xs font-semibold px-2 py-1 rounded">
                  CVSS {full.cvssScore.toFixed(1)}
                </span>
              )}
            </div>
            <h2 className="text-xl font-bold text-slate-900 leading-tight">{finding.type}</h2>
            <p className="text-sm text-slate-600 mt-1">対象: {finding.target}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0 ml-2"
            aria-label="閉じる"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* What */}
          <section>
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-800">何が起きているのか</h3>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">{full?.impact || finding.impact || expl.what}</p>
          </section>

          {/* Risk */}
          <section>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              <h3 className="text-sm font-bold text-slate-800">リスク・影響</h3>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">{expl.risk}</p>
          </section>

          {/* Fix */}
          <section className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Wrench className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-emerald-900">推奨対応</h3>
            </div>
            <p className="text-sm text-emerald-900/90 leading-relaxed whitespace-pre-line">
              {full?.recommendedAction && full.recommendedAction !== "manual_verify"
                ? full.recommendedAction
                : expl.fix}
            </p>
          </section>

          {/* Evidence (AI triage) */}
          {full?.aiTriageReason && (
            <section className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-blue-900">AI解析</h3>
              </div>
              <p className="text-sm text-blue-900/90 leading-relaxed whitespace-pre-line">
                {full.aiTriageReason}
              </p>
            </section>
          )}

          {/* Evidence raw */}
          {full?.evidence && (
            <section>
              <h3 className="text-sm font-bold text-slate-800 mb-2">証拠（Raw）</h3>
              <pre className="text-xs bg-slate-900 text-slate-100 rounded-lg p-3 overflow-x-auto font-mono leading-relaxed">
                {full.evidence.length > 1500 ? full.evidence.slice(0, 1500) + "\n\n... (省略)" : full.evidence}
              </pre>
            </section>
          )}

          {/* References */}
          {expl.refs && expl.refs.length > 0 && (
            <section>
              <h3 className="text-sm font-bold text-slate-800 mb-2">参考リンク</h3>
              <ul className="space-y-1.5">
                {expl.refs.map((r) => (
                  <li key={r.url}>
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1"
                    >
                      {r.label}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {loading && (
            <div className="flex items-center justify-center text-xs text-slate-400 py-2">
              <Loader2 className="w-3 h-3 animate-spin mr-1.5" />
              詳細情報を読み込み中...
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 p-4 bg-slate-50">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
