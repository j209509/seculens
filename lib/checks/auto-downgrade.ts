/* eslint-disable */
// auto-downgrade: scan-adapter version
// This module updates existing scan findings to downgrade their recommended action
// based on low-quality / false-positive patterns.

import { makeScanCtx } from "@/lib/scan-adapter";

const STATIC_ASSET_EXT_RE = /\.(css|js|mjs|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot|map|webmanifest)(\?|#|$)/i;
const SENSITIVE_TYPE_RE = /高機密応答|PII|billing|admin_data/i;

const LOW_QUALITY_PATTERNS: Array<{
  test: (type: string, impact: string, target: string, evidence: string) => boolean;
  reason: string;
  autoDiscard?: boolean;
}> = [
  { test: (t, _i, _target, _evidence) => /セキュリティヘッダー不足|Cookie 属性不足|クリックジャッキング.*Low/i.test(t), reason: "ヘッダー不足のみ / クリックジャッキング非機密ページのみ" },
  { test: (t, _i, _target, _evidence) => /内部IPアドレス露出|サーバーファイルパス露出$/i.test(t), reason: "内部ID/パス露出のみで実害が説明できない可能性" },
  { test: (t, i, _target, _evidence) => /security\.txt/i.test(t) || /security\.txt/i.test(i), reason: "security.txt 単体は対象外であることが多い" },
  { test: (t, i, _target, _evidence) => /Server ヘッダ.*バージョン|X-Powered-By/i.test(t + i), reason: "バージョン表示単体は対象外であることが多い" },
  { test: (t, i, _target, _evidence) => /CORS.*ワイルドカード/i.test(t + i) && !/credential/i.test(i), reason: "CORS影響なし (Allow-Credentials付きでない)" },
  { test: (t, i, _target, _evidence) => /robots\/sitemap 経由 sensitive URL/i.test(t) && !/admin|invoice|user|secret/i.test(i), reason: "robots/sitemap のみで具体機密アクセス無し" },
  { test: (t, _i, _target, _evidence) => /OpenAPI 仕様公開[^[]*Medium/i.test(t), reason: "Swagger 仕様公開のみで未認証 endpoint 未確認" },
  { test: (t, _i, _target, _evidence) => /Sentry DSN.*Low/i.test(t) || /Mapbox token.*Medium/i.test(t), reason: "公開前提の token なので情報的扱い" },
  { test: (t, i, _target, _evidence) => /DNS \/ Email security/i.test(t) && !/spoofing|phishing/i.test(i), reason: "SPF/DMARC のみで実 phishing 影響示せず" },
  { test: (t, i, _target, _evidence) => /Outdated Software/i.test(t) && /informational/i.test(i), reason: "バージョン非開示ポリシーで informational 扱い" },
  { test: (t, _i, _target, _evidence) => /package-lock\.json|composer\.lock|yarn\.lock|pnpm-lock\.yaml/i.test(t), reason: "lockfile 単体は CVE 照合の hint で実害証明には別途必要" },
  { test: (t, _i, _target, _evidence) => /HTTP TRACE Enabled/i.test(t), reason: "XST はモダンブラウザで exploit 困難" },
  { test: (t, _i, _target, _evidence) => /security\.txt|nginx_status|404/i.test(t), reason: "informational 表示のみ" },
  {
    test: (t, _i, target, _evidence) => SENSITIVE_TYPE_RE.test(t) && STATIC_ASSET_EXT_RE.test(target || ""),
    reason: "静的アセットを機密データと誤判定 (CSS/JS/画像にユーザーデータは含まれない)",
    autoDiscard: true
  },
  {
    test: (t, _i, _target, _evidence) => /^Fingerprint:\s*favicon/i.test(t),
    reason: "favicon ハッシュ単独は recon 情報で脆弱性ではない",
    autoDiscard: true
  },
  {
    test: (t, _i, _target, evidence) => /Webhook endpoint 存在/i.test(t) && /status\s*=\s*200/i.test(evidence || "") && !/POST|signature|x-hub-signature|x-signature|hmac/i.test(evidence || ""),
    reason: "webhook path 200 のみで signature 検証なし、実害未確認",
    autoDiscard: true
  },
  {
    test: (t, _i, target, evidence) => /連番ID列挙によるBOLA/i.test(t) && /\/news\//i.test(target || "") && /元ID\s*=\s*20\d\d[\s\S]*列挙ID\s*=\s*20\d\d/.test(evidence || ""),
    reason: "year-based archive ページの ID は user ID ではなく年度",
    autoDiscard: true
  },
  {
    test: (_t, _i, target, _evidence) => /\/(news|press|blog|archive)\/20\d\d\//i.test(target || ""),
    reason: "公開アーカイブ年度ページは認可境界の検証対象外",
    autoDiscard: true
  }
];

const LOW_TYPES = ["header", "info_leak", "internal_ip", "clickjacking"];

function isSelfAccountOnly(impact: string, evidence: string) {
  const text = `${impact} ${evidence}`.toLowerCase();
  if (/別アカウント|cross[- ]?account|other user|別ロール/.test(text)) return false;
  if (/自分のセッション|self|自己アカウント/.test(text)) return true;
  return false;
}

// In the scan adapter context, auto-downgrade analyzes findings and returns
// a summary of which ones would be downgraded. The actual updating is done
// via the scan adapter's update mechanism if available.
export async function runAutoDowngrade(scanId: string, targetUrl: string) {
  // makeScanCtx establishes context but auto-downgrade operates on existing findings
  makeScanCtx(scanId, targetUrl);

  // This function is a no-op in the scan adapter context since findings are
  // created fresh per scan and don't have existing humanStatus to downgrade.
  // The low-quality pattern logic is embedded in the createScanFinding recommendations.
  // Return 0 to indicate no findings were modified.
  return 0;
}

// Export pattern matchers for use in other modules
export { LOW_QUALITY_PATTERNS, LOW_TYPES, isSelfAccountOnly };
