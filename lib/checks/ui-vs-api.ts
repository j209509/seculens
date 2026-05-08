// UI非表示APIにAPIから到達 検出。
// 戦略:
//   - 管理・削除・エクスポート系の admin path hint をパスに含む API エンドポイントを探索
//   - GET で 200 が返りJSON が含まれれば候補

import { chromium } from "playwright";
import { isUrlInScope } from "@/lib/scope";
import { makeScanCtx, createScanFinding, findExistingScanFinding } from "@/lib/scan-adapter";

const ADMIN_PATH_HINTS = /admin|delete|disable|owner|impersonate|export|invoice|billing|permission|role/i;

const ADMIN_CANDIDATE_PATHS = [
  "/api/admin", "/api/admin/users", "/api/admin/dashboard", "/api/admin/stats",
  "/api/admin/billing", "/api/admin/invoices", "/api/admin/export",
  "/api/admin/permissions", "/api/admin/roles", "/api/admin/config",
  "/admin/api", "/admin/api/users", "/admin/api/stats",
  "/api/users/export", "/api/billing/export", "/api/reports",
  "/api/internal", "/api/internal/users", "/api/internal/stats",
  "/api/v1/admin", "/api/v1/admin/users",
  "/api/v2/admin",
  "/api/owner", "/api/impersonate",
  "/api/disable", "/api/delete/all"
];

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

function hasAdminDataContent(body: string): boolean {
  // Check if the body contains structured data that looks like admin/sensitive data
  if (!body || body.length < 20) return false;
  const trimmed = body.trimStart();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
  try {
    const obj = JSON.parse(trimmed);
    if (Array.isArray(obj) && obj.length > 0) return true;
    if (typeof obj === "object" && obj !== null && Object.keys(obj).length > 0) return true;
    return false;
  } catch {
    return false;
  }
}

export async function runUiApiDifferentialCheck(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  const base = new URL(targetUrl).origin;
  let count = 0;
  const seen = new Set<string>();

  // Collect candidate URLs from main page links
  const candidateUrls: string[] = [];
  try {
    const mainPage = await fetchAnonymous(targetUrl);
    const linkMatches = mainPage.body.matchAll(/href=["']([^"']+)["']/gi);
    for (const m of linkMatches) {
      try {
        const u = new URL(m[1], base);
        if (isUrlInScope(program, u.toString()).allowed && ADMIN_PATH_HINTS.test(u.pathname)) {
          candidateUrls.push(u.toString());
          if (candidateUrls.length >= 10) break;
        }
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }

  // Add common admin paths
  for (const path of ADMIN_CANDIDATE_PATHS) {
    const u = `${base}${path}`;
    if (!candidateUrls.includes(u)) candidateUrls.push(u);
  }

  for (const candidateUrl of candidateUrls.slice(0, 25)) {
    if (count >= 6) break;
    if (!isUrlInScope(program, candidateUrl).allowed) continue;

    const u = new URL(candidateUrl);
    if (!ADMIN_PATH_HINTS.test(u.pathname)) continue;

    const key = `GET|${u.pathname}`;
    if (seen.has(key)) continue;
    seen.add(key);

    try {
      const res = await fetchAnonymous(candidateUrl);
      if (res.status !== 200 && res.status !== 201) continue;
      const ct = ((res.headers["content-type"] ?? "") as string).toLowerCase();
      if (!ct.includes("json")) continue;
      if (!hasAdminDataContent(res.body)) continue;

      const category = "admin_data";
      const taggedType = `UI非表示APIにAPIから到達 (${category}) [High]`;
      const target = `GET ${candidateUrl}`;
      const existing = await findExistingScanFinding(scanId, taggedType, target);
      if (existing) continue;

      await createScanFinding(scanId, {
        type: taggedType,
        target,
        severity: "high",
        impact: `UI上では対応する操作ボタンやリンクが見当たらないものの、APIエンドポイント ${u.pathname} が ${res.status} で応答し、管理系データが含まれます。認可制御の漏れの可能性があります。`,
        inScopeReason: `収集済み許可ドメイン内、UI操作で到達しにくいadmin/削除系パス`,
        evidence: `url=${candidateUrl}, status=${res.status}, bodySize=${res.body.length}`,
        requestResponseDiff: JSON.stringify({
          apiPath: u.pathname,
          status: res.status,
          sample: res.body.slice(0, 1500)
        }, null, 2),
        reproductionSteps: `1. UI上で関連操作のボタン/リンクを探す (見つからないことを確認)\n2. GET ${candidateUrl} を直接実行\n3. ${res.status} で管理系情報が返ることを確認`,
        aiWorthSending: "UI制限とAPI制限の不整合は隠れた認可問題の典型です。認証状態での確認を推奨します。",
        bountyLikelihood: "medium",
        recommendedAction: "manual_verify"
      });
      count++;
    } catch { /* skip */ }
  }
  return count;
}
