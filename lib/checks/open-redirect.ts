// Open Redirect 検出。
// 戦略:
//   - targetUrl のフォームパラメータ / API を probe
//     「リダイレクト系パラメータ名」を持つ URL を候補として生成
//   - 各 param の値を https://oredr-test.example.com/ ( 確実に attacker controlled とみなせる外部ドメイン ) に
//     置き換えて redirect: 'manual' で fetch
//   - レスポンスが 301/302/303/307/308 で Location ヘッダーが攻撃者ドメインを指していたらアウト
//   - meta refresh / window.location.href = '...' で内部 HTML 実装の場合は body 検査
// 安全策:
//   - 外部ドメインへの実 navigation はしない ( manual redirect で Location 確認のみ )
//   - 攻撃者ドメインは固有の test 専用 sentinel で、誤動作で実害が出ない host

import { chromium } from "playwright";
import { isUrlInScope } from "@/lib/scope";
import { maskBody } from "@/lib/mask";
import { makeScanCtx, createScanFinding, findExistingScanFinding } from "@/lib/scan-adapter";

const REDIRECT_PARAM_NAMES = [
  "redirect", "redirect_uri", "redirect_url", "redirecturi", "redirecturl",
  "return", "return_url", "returnurl", "returnto", "return_to",
  "next", "nexturl", "next_url",
  "url", "u", "dest", "destination", "destinationurl",
  "continue", "continueto", "success", "success_url", "successurl",
  "target", "callback", "redir", "ref", "forward", "forward_url",
  "link", "go", "goto", "out", "checkout_url", "back", "backurl"
];
const ATTACKER_HOST = "oredr-test-bbagent.example.com";
const ATTACKER_URL = `https://${ATTACKER_HOST}/`;

// Common paths that tend to accept redirect params
const CANDIDATE_PATHS = [
  "/",
  "/login",
  "/logout",
  "/signin",
  "/signout",
  "/auth/login",
  "/auth/logout",
  "/api/auth/signin",
  "/api/auth/signout",
  "/redirect",
  "/goto",
  "/out"
];

async function fetchManualRedirect(url: string): Promise<{ status: number; location: string | null; body: string }> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    const res = await page.request.fetch(url, { method: "GET", failOnStatusCode: false, timeout: 10000, maxRedirects: 0 });
    const headers = res.headers();
    const body = await res.text().catch(() => "");
    await context.close();
    return { status: res.status(), location: headers["location"] ?? null, body };
  } finally {
    await browser.close();
  }
}

function isAttackerControlled(target: string | null): boolean {
  if (!target) return false;
  if (/^https?:\/\/[^/]*oredr-test-bbagent\.example\.com/i.test(target)) return true;
  if (/^\/\/[^/]*oredr-test-bbagent\.example\.com/i.test(target)) return true;
  return false;
}

function findInBodyRedirect(body: string): string | null {
  const meta = body.match(/<meta[^>]*http-equiv=["']?refresh["']?[^>]*content=["'][^"']*url=([^"'>]+)/i);
  if (meta) return meta[1];
  const js = body.match(/(?:window\.)?location(?:\.href|\.replace\s*\(\s*)?\s*=?\s*['"]([^'"]+)['"]/);
  if (js) return js[1];
  return null;
}

export async function runOpenRedirectCheck(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  const base = new URL(targetUrl).origin;

  let count = 0;
  const tested = new Set<string>();

  for (const path of CANDIDATE_PATHS) {
    if (count >= 8) break;
    const candidateUrl = `${base}${path}`;
    if (!isUrlInScope(program, candidateUrl).allowed) continue;

    for (const paramName of REDIRECT_PARAM_NAMES.slice(0, 12)) {
      if (count >= 8) break;
      const key = `${candidateUrl}|${paramName}`;
      if (tested.has(key)) continue;
      tested.add(key);

      try {
        const probeUrl = new URL(candidateUrl);
        probeUrl.searchParams.set(paramName, ATTACKER_URL);
        const res = await fetchManualRedirect(probeUrl.toString());
        const isRedirectStatus = res.status >= 300 && res.status < 400;
        const headerHit = isRedirectStatus && isAttackerControlled(res.location);
        const bodyRedirectTarget = findInBodyRedirect(res.body);
        const bodyHit = !!bodyRedirectTarget && isAttackerControlled(bodyRedirectTarget);
        if (!headerHit && !bodyHit) continue;

        const via = headerHit ? `Location ヘッダー ${res.location}` : `body 内 redirect ${bodyRedirectTarget}`;
        const taggedType = `Open Redirect 候補 (${headerHit ? "HTTP 30x" : "meta/JS"}) [Medium-High]`;
        const target = `GET ${base}${path}?${paramName}=...`;
        const existing = await findExistingScanFinding(scanId, taggedType, target);
        if (existing) continue;

        await createScanFinding(scanId, {
          type: taggedType,
          target,
          severity: "medium",
          impact: `クエリパラメータ ${paramName} の値を外部 attacker host ( ${ATTACKER_URL} ) に置き換えたところ、サーバーが ${via} で誘導いたしました。攻撃者は被害者を任意の外部サイトに転送できるため、フィッシング / OAuth state 横取り / Cookie 漏洩等への連鎖が可能です。`,
          inScopeReason: `収集済み許可ドメイン内のリダイレクト系パラメータを持つエンドポイント`,
          evidence: `candidateUrl=${candidateUrl}, paramName=${paramName}, status=${res.status}, location=${res.location ?? "(none)"}, bodyRedirect=${bodyRedirectTarget ?? "(none)"}`,
          requestResponseDiff: maskBody("application/json", JSON.stringify({
            paramName,
            probeUsed: ATTACKER_URL,
            probeUrl: probeUrl.toString(),
            status: res.status,
            location: res.location,
            bodyRedirectTarget,
            hitVia: headerHit ? "header" : "body",
            safetyNote: "外部ホストへの実 navigation は実施せず Location ヘッダーと body の redirect 文字列のみ確認しました。"
          }, null, 2)),
          reproductionSteps: `1. ${probeUrl.toString()} に GET ( フォロー無し ) でアクセス\n2. ${via} を確認\n3. 攻撃者は ${paramName} パラメータに任意の URL を入れることで被害者を外部に誘導可能\n4. 連鎖例: SSO callback URL に挿入してトークン窃取、phishing 用の信頼ホスト経由など`,
          aiWorthSending: "実プロダクトで OAuth flow や認証画面の前段に存在する場合 high になる類のため、コンテキストを確認してください。",
          bountyLikelihood: "medium",
          recommendedAction: "manual_verify"
        });
        count++;
      } catch { /* skip */ }
    }
  }
  return count;
}
