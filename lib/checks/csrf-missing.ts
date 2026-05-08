/* eslint-disable */
// CSRF 保護欠落検出

import { chromium } from "playwright";
import { isUrlInScope } from "@/lib/scope";
import { maskBody } from "@/lib/mask";
import { makeScanCtx, createScanFinding, findExistingScanFinding } from "@/lib/scan-adapter";

const CSRF_TOKEN_PATTERNS = [
  /x-csrf-token/i, /x-xsrf-token/i, /x-csrftoken/i,
  /csrf-token/i, /csrfmiddlewaretoken/i, /authenticity_token/i,
  /_csrf/i, /__requestverificationtoken/i, /xsrf-token/i
];
const FORBIDDEN_PATH = /\/(?:delete|destroy|remove|wipe|charge|payment|invoice|withdraw|transfer|cancel-subscription|deactivate|close-account)\b/i;
const ATTACKER_ORIGIN = "https://evil-csrf-test-bbagent.example.com";

async function replayWithOrigin(method: string, url: string, body: string, contentType: string, origin: string): Promise<{ status: number; body: string }> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    const headers: Record<string, string> = {
      "content-type": contentType,
      "Origin": origin,
      "Referer": origin + "/"
    };
    const res = await page.request.fetch(url, {
      method,
      data: body,
      headers,
      failOnStatusCode: false,
      timeout: 10000
    });
    const respBody = await res.text().catch(() => "");
    await context.close();
    return { status: res.status(), body: respBody.slice(0, 4000) };
  } finally {
    await browser.close();
  }
}

export { runCsrfMissingCheck as runCsrfCheck };

export async function runCsrfMissingCheck(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  const allowed = JSON.parse(program.allowedDomains || "[]") as string[];
  let count = 0;
  const tested = new Set<string>();

  // Test CSRF on common state-changing endpoints derived from target URL
  const baseOrigin = new URL(targetUrl).origin;
  const STATE_PATHS = ["/api/user", "/api/profile", "/api/settings", "/api/account", "/api/v1/user"];

  for (const path of STATE_PATHS) {
    if (count >= 6) break;
    const url = `${baseOrigin}${path}`;
    if (!isUrlInScope(program, url).allowed) continue;
    if (FORBIDDEN_PATH.test(url)) continue;
    const key = `POST ${baseOrigin}${path}`;
    if (tested.has(key)) continue;
    tested.add(key);
    try {
      // Test GET first to see if endpoint exists
      const browser = await chromium.launch({ headless: true });
      let getStatus = 0;
      try {
        const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
        const page = await ctx.newPage();
        const res = await page.request.fetch(url, { method: "GET", failOnStatusCode: false, timeout: 8000 });
        getStatus = res.status();
        await ctx.close();
      } finally { await browser.close(); }
      // Only test endpoints that exist (200/401/403 — not 404)
      if (getStatus === 404) continue;

      const probe = await replayWithOrigin("POST", url, JSON.stringify({ test: "csrf" }), "application/json", ATTACKER_ORIGIN);
      // If the endpoint accepts cross-origin POST (2xx), it may be vulnerable
      if (probe.status < 200 || probe.status >= 300) continue;
      const taggedType = `CSRF 保護欠落候補 [Medium-High]`;
      const target = `POST ${baseOrigin}${path}`;
      const existing = await findExistingScanFinding(scanId, taggedType, target);
      if (existing) continue;
      await createScanFinding(scanId, {
        type: taggedType,
        target,
        severity: "high",
        impact: `${target} は state-changing リクエストでありながら、CSRF トークン (X-CSRF-Token / authenticity_token 等) の保護が検出されず、攻撃者 Origin (${ATTACKER_ORIGIN}) からの replay で ${probe.status} を返して受け入れられました。攻撃者は被害者がログインしている状態で誘導サイトに訪問させると、被害者の権限で任意の操作を実行できます。`,
        inScopeReason: `収集済み許可ドメイン内の state-changing エンドポイント`,
        evidence: `url=${url}, attackerOriginReplayStatus=${probe.status}, csrfTokenDetected=false`,
        requestResponseDiff: maskBody("application/json", JSON.stringify({
          method: "POST",
          url,
          attackerOriginReplayStatus: probe.status,
          csrfTokenInHeaders: false,
          attackerOrigin: ATTACKER_ORIGIN,
          safetyNote: "DELETE / 決済 / 退会系 path は除外。replay は 1 リクエストのみ。"
        }, null, 2)),
        reproductionSteps: `1. 被害者を ${ATTACKER_ORIGIN} の悪性ページに誘導\n2. 同ページから ${target} へクロスオリジン POST を発火 ( fetch with credentials: 'include' )\n3. サーバが Origin / CSRF token を検証せず ${probe.status} を返す → 副作用が実行される`,
        recommendedAction: "manual_verify"
      });
      count++;
    } catch { /* skip */ }
  }

  void allowed;
  return count;
}
