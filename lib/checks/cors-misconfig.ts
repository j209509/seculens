import { chromium } from "playwright";
import { isUrlInScope } from "@/lib/scope";
import { safeJsonParse } from "@/lib/json";
import { maskBody } from "@/lib/mask";
import { makeScanCtx, createScanFinding, findExistingScanFinding } from "@/lib/scan-adapter";

export { runCorsMisconfigCheck as runCorsCheck };

export async function runCorsMisconfigCheck(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  const browser = await chromium.launch({ headless: true });
  let count = 0;
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();

    const allowed = safeJsonParse<string[]>(program.allowedDomains, []);
    const hosts = Array.from(new Set(allowed.map((d) => d.replace(/^\*\./, "").replace(/^https?:\/\//, "").split("/")[0]).filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(d)))).slice(0, 6);

    const ATTACKER_ORIGINS = [
      "https://evil-cors-test.example.com",
      "null",
      "https://trusted.example.com.evil.com"
    ];
    const API_PATHS = ["/api/user", "/api/me", "/api/profile", "/api/v1/user", "/api/v1/me", "/api/account", "/api/auth/session"];

    for (const host of hosts) {
      for (const path of API_PATHS) {
        const url = `https://${host}${path}`;
        if (!isUrlInScope(program, url).allowed) continue;
        for (const origin of ATTACKER_ORIGINS) {
          try {
            const res = await page.request.fetch(url, {
              method: "GET",
              headers: { "Origin": origin },
              failOnStatusCode: false,
              timeout: 8000
            });
            const acao = res.headers()["access-control-allow-origin"] ?? "";
            const acac = res.headers()["access-control-allow-credentials"] ?? "";
            const body = await res.text().catch(() => "");
            // Vulnerable: reflects attacker origin + credentials
            const reflectsOrigin = acao === origin || acao === "*";
            const allowsCredentials = acac.toLowerCase() === "true";
            const isVulnerable = reflectsOrigin && allowsCredentials;
            const isMedium = reflectsOrigin && !allowsCredentials && acao !== "*";
            if (!isVulnerable && !isMedium) continue;
            const severity: "high" | "medium" = isVulnerable ? "high" : "medium";
            const sevLabel = isVulnerable ? "High" : "Medium";
            const taggedType = `CORS 設定ミス (${isVulnerable ? "credentials + origin reflect" : "origin reflect"}) [${sevLabel}]`;
            const target = url;
            const existing = await findExistingScanFinding(scanId, taggedType, target);
            if (existing) continue;
            await createScanFinding(scanId, {
              type: taggedType,
              target,
              severity,
              impact: `${url} に Origin: ${origin} ヘッダーを付けてリクエストしたところ、Access-Control-Allow-Origin: ${acao}${allowsCredentials ? " + Access-Control-Allow-Credentials: true" : ""} が返却されました。${isVulnerable ? "攻撃者ドメインから被害者の認証 cookie を使った cross-origin リクエストが成立し、ユーザーデータの窃取が可能です。" : "Credentials なしですが origin を反射しており、公開情報の読み取りに悪用される可能性があります。"}`,
              inScopeReason: `収集済み許可ドメイン内の API エンドポイント`,
              evidence: `endpoint=${url}, attackerOrigin=${origin}, acao=${acao}, acac=${acac}`,
              requestResponseDiff: maskBody("application/json", JSON.stringify({
                endpoint: url,
                attackerOrigin: origin,
                responseAcao: acao,
                responseAcac: acac,
                status: res.status(),
                bodyPreview: body.slice(0, 500),
                safetyNote: "GET 1 リクエストのみ。データ取得は実施していない。"
              }, null, 2)),
              reproductionSteps: `1. curl -H 'Origin: ${origin}' '${url}'\n2. レスポンスヘッダーに Access-Control-Allow-Origin: ${acao}${allowsCredentials ? "\n3. Access-Control-Allow-Credentials: true も確認\n4. 攻撃者ページから fetch() + credentials: 'include' でユーザーデータ窃取可能" : "\n3. credentials なしで公開情報の cross-origin 読取が可能"}`,
              recommendedAction: isVulnerable ? "report_now" : "manual_verify"
            });
            count++;
            break;
          } catch { /* skip */ }
        }
      }
    }
    await context.close();
  } finally {
    await browser.close();
  }
  return count;
}
