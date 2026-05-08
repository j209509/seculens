// 過剰レスポンス (Over-fetching) 検出。
// 戦略:
//   - APIエンドポイントを探索 (メインページのリンク + 共通パス)
//   - JSON レスポンスに高機密フィールド (password_hash, api_key, ssn 等) が含まれないか確認
//   - 含まれていれば Over-fetching 候補として記録

import { chromium } from "playwright";
import { isUrlInScope } from "@/lib/scope";
import { maskBody } from "@/lib/mask";
import { makeScanCtx, createScanFinding, findExistingScanFinding } from "@/lib/scan-adapter";

const HIGH_VALUE_FIELDS: Record<string, { category: string; label: string; severity: "critical" | "high" | "medium" }> = {
  password_hash: { category: "credentials", label: "パスワードハッシュ", severity: "critical" },
  password: { category: "credentials", label: "パスワード", severity: "critical" },
  api_key: { category: "credentials", label: "APIキー", severity: "critical" },
  api_secret: { category: "credentials", label: "APIシークレット", severity: "critical" },
  refresh_token: { category: "credentials", label: "リフレッシュトークン", severity: "high" },
  access_token: { category: "credentials", label: "アクセストークン", severity: "high" },
  private_key: { category: "credentials", label: "秘密鍵", severity: "critical" },
  ssn: { category: "pii", label: "SSN", severity: "critical" },
  social_security: { category: "pii", label: "Social Security Number", severity: "critical" },
  date_of_birth: { category: "pii", label: "生年月日", severity: "high" },
  birth_date: { category: "pii", label: "生年月日", severity: "high" },
  passport_number: { category: "pii", label: "パスポート番号", severity: "high" },
  drivers_license: { category: "pii", label: "運転免許証番号", severity: "high" },
  national_id: { category: "pii", label: "国民識別番号", severity: "high" },
  tax_id: { category: "pii", label: "税ID", severity: "high" },
  bank_account: { category: "billing", label: "銀行口座", severity: "critical" },
  routing_number: { category: "billing", label: "ルーティング番号", severity: "high" },
  iban: { category: "billing", label: "IBAN", severity: "high" },
  card_number: { category: "billing", label: "カード番号", severity: "critical" },
  card_last4: { category: "billing", label: "カード末尾4桁", severity: "medium" },
  cvv: { category: "credentials", label: "CVV", severity: "critical" },
  invoice_amount: { category: "billing", label: "請求額", severity: "medium" },
  payment_method_id: { category: "billing", label: "決済手段ID", severity: "medium" },
  stripe_customer_id: { category: "billing", label: "Stripe顧客ID", severity: "medium" },
  internal_role: { category: "admin_data", label: "内部ロール", severity: "high" },
  is_admin: { category: "admin_data", label: "is_admin フラグ", severity: "high" },
  is_superuser: { category: "admin_data", label: "is_superuser フラグ", severity: "high" },
  permissions: { category: "admin_data", label: "権限フラグ", severity: "high" },
  internal_notes: { category: "admin_data", label: "内部メモ", severity: "medium" },
  internal_id: { category: "info_leak", label: "内部ID", severity: "medium" },
  email_verified: { category: "pii", label: "メール認証状態", severity: "medium" },
  phone_verified: { category: "pii", label: "電話認証状態", severity: "medium" },
  shipping_address: { category: "pii", label: "配送先住所", severity: "medium" },
  billing_address: { category: "pii", label: "請求先住所", severity: "medium" }
};

// Common API paths to probe
const CANDIDATE_PATHS = [
  "/api/user", "/api/me", "/api/profile", "/api/account", "/api/settings",
  "/api/users/me", "/api/v1/user", "/api/v1/me", "/api/v1/profile",
  "/api/v2/user", "/api/v2/me",
  "/api/users", "/api/v1/users",
  "/api/products", "/api/orders", "/api/items",
  "/api/dashboard", "/api/admin"
];

function findHighValueFields(body: string) {
  const hits: { field: string; category: string; label: string; severity: "critical" | "high" | "medium" }[] = [];
  try {
    const seen = new Set<string>();
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") {
        for (const [k, val] of Object.entries(v)) {
          const lcK = k.toLowerCase().replace(/-/g, "_");
          const matched = HIGH_VALUE_FIELDS[lcK];
          if (matched && !seen.has(lcK) && val !== null && val !== "" && val !== undefined) {
            seen.add(lcK);
            hits.push({ field: k, category: matched.category, label: matched.label, severity: matched.severity });
          }
          walk(val);
        }
      }
    };
    walk(JSON.parse(body));
  } catch { /* not JSON */ }
  return hits;
}

async function fetchAnonymous(url: string): Promise<{ status: number; body: string; headers: Record<string, string | string[] | undefined> }> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    const res = await page.request.fetch(url, { method: "GET", failOnStatusCode: false, timeout: 10000 });
    const body = await res.text().catch(() => "");
    const headers = res.headers();
    await context.close();
    return { status: res.status(), body, headers };
  } finally {
    await browser.close();
  }
}

export async function runExcessiveResponseCheck(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  const base = new URL(targetUrl).origin;
  let count = 0;
  const seen = new Set<string>();

  // Collect candidate URLs from main page links
  const candidateUrls: string[] = [];
  try {
    const mainPage = await fetchAnonymous(targetUrl);
    const linkMatches = mainPage.body.matchAll(/href=["']([^"']*\/api\/[^"']+)["']/gi);
    for (const m of linkMatches) {
      try {
        const u = new URL(m[1], base);
        if (isUrlInScope(program, u.toString()).allowed) {
          candidateUrls.push(u.toString());
          if (candidateUrls.length >= 10) break;
        }
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }

  // Add common paths
  for (const path of CANDIDATE_PATHS) {
    const u = `${base}${path}`;
    if (!candidateUrls.includes(u)) candidateUrls.push(u);
  }

  for (const candidateUrl of candidateUrls.slice(0, 25)) {
    if (count >= 8) break;
    if (!isUrlInScope(program, candidateUrl).allowed) continue;

    const urlObj = new URL(candidateUrl);
    const pathKey = `GET|${urlObj.pathname}`;
    if (seen.has(pathKey)) continue;
    seen.add(pathKey);

    try {
      const res = await fetchAnonymous(candidateUrl);
      if (res.status !== 200 && res.status !== 201) continue;
      const ct = ((res.headers["content-type"] ?? "") as string).toLowerCase();
      if (!ct.includes("json")) continue;
      if (res.body.length < 20) continue;

      const hits = findHighValueFields(res.body);
      if (hits.length === 0) continue;

      const worstHit = hits.find((h) => h.severity === "critical") ?? hits.find((h) => h.severity === "high") ?? hits[0];
      const taggedType = `過剰レスポンス (${worstHit.category}) [${worstHit.severity === "critical" ? "Critical" : worstHit.severity === "high" ? "High" : "Medium"}]`;
      const target = `GET ${candidateUrl}`;
      const existing = await findExistingScanFinding(scanId, taggedType, target);
      if (existing) continue;

      await createScanFinding(scanId, {
        type: taggedType,
        target,
        severity: worstHit.severity,
        impact: `APIレスポンスにUI上で表示されない高機密フィールド (${hits.map((h) => h.label).slice(0, 5).join(", ")}) が含まれております。本来クライアントに送るべきでない情報の Over-fetching に該当する可能性がございます。`,
        inScopeReason: `収集済み許可ドメイン内応答`,
        evidence: `url=${candidateUrl}, fields=${hits.map((h) => h.field).join(", ")}`,
        requestResponseDiff: maskBody("application/json", JSON.stringify({
          excessiveFields: hits.map((h) => ({ field: h.field, category: h.category, label: h.label })),
          sample: res.body.slice(0, 1500)
        }, null, 2)),
        reproductionSteps: `1. ${candidateUrl} に GET リクエストを送信\n2. 応答本文を確認\n3. 以下のフィールドがUIに表示されていないにも関わらず応答に含まれていることを確認: ${hits.map((h) => h.field).slice(0, 5).join(", ")}`,
        aiWorthSending: "Over-fetching は単独で報酬獲得実績のあるパターンです。",
        bountyLikelihood: worstHit.severity === "critical" ? "very_high" : worstHit.severity === "high" ? "high" : "medium",
        recommendedAction: "manual_verify"
      });
      count++;
    } catch { /* skip */ }
  }
  return count;
}
