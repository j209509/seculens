// SQLi 安全 PoC 候補検出。
// 戦略:
//   1. targetUrl の GET エンドポイントを probe ( 既知 params + ページから抽出 )
//   2. 各 query param に safe probes ( 引用符 / boolean 構造 ) を送って diff 確認
//   3. レスポンス差分があれば SQLi 候補として記録
// 安全策:
//   - DROP/DELETE/UPDATE/INSERT/UNION SELECT/SLEEP/BENCHMARK は使用しない
//   - データ抽出 / 破壊的 SQL は一切実行しない

import { chromium } from "playwright";
import { isUrlInScope } from "@/lib/scope";
import { maskBody } from "@/lib/mask";
import { makeScanCtx, createScanFinding, findExistingScanFinding } from "@/lib/scan-adapter";
import { analyzeSqliDiff, generateSafeSqliProbes, isPayloadSafeForSqli } from "./safe-payloads";

const COMMON_PARAMS = ["id", "user_id", "userId", "q", "search", "category", "type", "filter", "sort", "page", "offset", "limit", "product_id", "item", "name", "key"];

async function fetchPage(url: string): Promise<{ status: number; body: string }> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    const res = await page.request.fetch(url, { method: "GET", failOnStatusCode: false, timeout: 10000 });
    const body = await res.text().catch(() => "");
    await context.close();
    return { status: res.status(), body };
  } finally {
    await browser.close();
  }
}

export async function runSqliSafeProbe(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  const base = new URL(targetUrl).origin;
  const probes = generateSafeSqliProbes();
  const tested = new Set<string>();
  let count = 0;

  // Collect candidate URLs from main page links
  const candidateUrls: string[] = [targetUrl];
  try {
    const mainPage = await fetchPage(targetUrl);
    const linkMatches = mainPage.body.matchAll(/href=["']([^"']*\?[^"']+)["']/gi);
    for (const m of linkMatches) {
      try {
        const u = new URL(m[1], base);
        if (isUrlInScope(program, u.toString()).allowed) {
          candidateUrls.push(u.toString());
          if (candidateUrls.length >= 15) break;
        }
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }

  for (const candidateUrl of candidateUrls.slice(0, 20)) {
    if (count >= 8) break;
    if (!isUrlInScope(program, candidateUrl).allowed) continue;

    try {
      const u = new URL(candidateUrl);
      const paramsToTest: string[] = [...u.searchParams.keys()];
      if (paramsToTest.length === 0) paramsToTest.push(...COMMON_PARAMS.slice(0, 5));

      for (const name of paramsToTest.slice(0, 5)) {
        if (count >= 8) break;
        const key = `${u.origin}${u.pathname}|${name}`;
        if (tested.has(key)) continue;
        tested.add(key);

        const value = u.searchParams.get(name) ?? "1";
        const baselineUrl = u.toString();
        const baseline = await fetchPage(baselineUrl);

        if (baseline.status === 404 || baseline.status === 405) continue;

        const errorUrl = new URL(candidateUrl);
        errorUrl.searchParams.set(name, value + probes.quoteError);
        if (!isPayloadSafeForSqli(probes.quoteError)) continue;
        const errorRes = await fetchPage(errorUrl.toString());

        const trueUrl = new URL(candidateUrl);
        trueUrl.searchParams.set(name, value + probes.booleanTrue);
        const falseUrl = new URL(candidateUrl);
        falseUrl.searchParams.set(name, value + probes.booleanFalse);
        if (!isPayloadSafeForSqli(probes.booleanTrue) || !isPayloadSafeForSqli(probes.booleanFalse)) continue;

        const [trueRes, falseRes] = await Promise.all([
          fetchPage(trueUrl.toString()),
          fetchPage(falseUrl.toString())
        ]);

        const diff = analyzeSqliDiff({
          trueStatus: trueRes.status,
          falseStatus: falseRes.status,
          trueBody: trueRes.body,
          falseBody: falseRes.body,
          errorBody: errorRes.body
        });

        if (diff.candidate) {
          const taggedType = `SQLi 安全PoC候補 (${diff.errorPatternFound ? "エラー差分" : "boolean差分"}) [Medium]`;
          const target = `GET ${u.origin}${u.pathname}?${name}=...`;
          const existing = await findExistingScanFinding(scanId, taggedType, target);
          if (existing) continue;

          await createScanFinding(scanId, {
            type: taggedType,
            target,
            severity: "medium",
            impact: `クエリパラメータ ${name} に単一引用符および boolean 構造の安全probeを送ったところ、応答に有意な差分が確認されました: ${diff.signal}。SQLインジェクションの可能性がございますが、データ抽出や破壊的SQLは一切実行しておりません。`,
            inScopeReason: `収集済み許可ドメイン内のGETパラメータ`,
            evidence: `paramName=${name}, signal=${diff.signal}`,
            requestResponseDiff: maskBody("application/json", JSON.stringify({
              paramName: name,
              probesUsed: { quoteError: probes.quoteError, booleanTrue: probes.booleanTrue, booleanFalse: probes.booleanFalse },
              baselineStatus: baseline.status,
              errorStatus: errorRes.status,
              trueStatus: trueRes.status,
              falseStatus: falseRes.status,
              trueSize: diff.trueSize,
              falseSize: diff.falseSize,
              errorPatternFound: diff.errorPatternFound,
              signal: diff.signal,
              safetyNote: "DROP/DELETE/UPDATE/INSERT/UNION SELECT/SLEEP/BENCHMARK は使用しておりません。少数リクエストのみで判定しております。データ抽出や破壊的SQLは行っておりません。"
            }, null, 2)),
            reproductionSteps: `1. ${baselineUrl} にアクセスしベースライン応答を取得\n2. ${name} パラメータ末尾に ${probes.quoteError} を付加して再アクセス → ${errorRes.status}\n3. ${name} パラメータ末尾に ${probes.booleanTrue} を付加 → ${trueRes.status}, body ${diff.trueSize} bytes\n4. ${name} パラメータ末尾に ${probes.booleanFalse} を付加 → ${falseRes.status}, body ${diff.falseSize} bytes\n5. ${diff.signal}`,
            aiWorthSending: "差分は弱信号の可能性があるため、人間が実環境で文脈確認をしてください。",
            bountyLikelihood: "medium",
            recommendedAction: "manual_verify"
          });
          count++;
        }
      }
    } catch { /* skip */ }
  }
  return count;
}
