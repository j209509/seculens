// SSRF / SSTI 安全 PoC 候補検出。
// 戦略:
//   - SSRF: URL 受け取る query param に http://example.com/.marker を送って応答を確認
//   - SSTI: テンプレート式 ( 数値演算のみ ) を送って「1337」がレスポンスに出るか確認
// 安全策:
//   - DoS / ブルートフォース / 内部メタデータ取得は試行しない
//   - example.com への単発 GET のみ
//   - SSTI は算術式のみ ( RCE ペイロードは使用しない )

import crypto from "node:crypto";
import { chromium } from "playwright";
import { isUrlInScope } from "@/lib/scope";
import { maskBody } from "@/lib/mask";
import { makeScanCtx, createScanFinding, findExistingScanFinding } from "@/lib/scan-adapter";

const URL_PARAM_NAMES = /^(url|uri|target|dest|destination|callback|redirect|webhook|fetch|proxy|src|source|image|file|path|next|return)$/i;

const SSTI_PROBES: Array<{ payload: string; expect: string; engine: string }> = [
  { payload: "${7*191}", expect: "1337", engine: "JSP/Spring" },
  { payload: "{{7*191}}", expect: "1337", engine: "Jinja2/Twig/AngularJS" },
  { payload: "<%= 7*191 %>", expect: "1337", engine: "ERB/EJS" },
  { payload: "#{7*191}", expect: "1337", engine: "Ruby/Pug" },
  { payload: "[[7*191]]", expect: "1337", engine: "Thymeleaf" }
];

const SSTI_PARAMS = ["template", "name", "greeting", "message", "subject", "title", "content", "q", "search", "text"];

async function fetchWithUrl(url: string): Promise<{ status: number; body: string }> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    const res = await page.request.fetch(url, { method: "GET", failOnStatusCode: false, timeout: 12000 });
    const body = await res.text().catch(() => "");
    await context.close();
    return { status: res.status(), body };
  } finally {
    await browser.close();
  }
}

export async function runSsrfSafeProbe(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  const base = new URL(targetUrl).origin;
  const tested = new Set<string>();
  let count = 0;

  // Collect candidate URLs from main page
  const candidateUrls: string[] = [targetUrl];
  try {
    const mainPageRes = await fetchWithUrl(targetUrl);
    const linkMatches = mainPageRes.body.matchAll(/href=["']([^"']*\?[^"']+)["']/gi);
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

  for (const candidateUrl of candidateUrls.slice(0, 10)) {
    if (count >= 6) break;
    if (!isUrlInScope(program, candidateUrl).allowed) continue;

    try {
      const u = new URL(candidateUrl);
      for (const [name, value] of u.searchParams) {
        if (!URL_PARAM_NAMES.test(name)) continue;
        if (!/^https?:\/\/|^\/\//.test(value) && !/\.[a-z]{2,}/.test(value)) continue;
        const key = `${u.origin}${u.pathname}|${name}`;
        if (tested.has(key)) continue;
        tested.add(key);

        const probeId = crypto.randomBytes(3).toString("hex");
        const probeMarker = `bb-ssrf-${probeId}`;
        const probeUrl = new URL(candidateUrl);
        probeUrl.searchParams.set(name, `http://example.com/.${probeMarker}`);
        const beforeT = Date.now();
        const result = await fetchWithUrl(probeUrl.toString());
        const elapsed = Date.now() - beforeT;
        const reflected = result.body.includes(probeMarker) || result.body.includes("example.com") || result.body.includes("Example Domain");
        const slowResponse = elapsed > 4000 && elapsed < 11000;

        if (reflected || slowResponse) {
          const taggedType = `SSRF 安全PoC候補 (${reflected ? "外部応答反映" : "応答遅延"}) [Medium-High]`;
          const target = `GET ${u.origin}${u.pathname}?${name}=...`;
          const existing = await findExistingScanFinding(scanId, taggedType, target);
          if (existing) continue;

          await createScanFinding(scanId, {
            type: taggedType,
            target,
            severity: "high",
            impact: `${name} パラメータに外部URLを渡したところ、${reflected ? "サーバ側で外部URLを取得して応答に内容を反映" : `${elapsed}ms の応答遅延 (外部接続している可能性)`} が確認されました。SSRF の可能性があります。報奨金見込み: $1,000〜$15,000+。`,
            inScopeReason: `収集済み許可ドメイン内のリダイレクト/URL系パラメータ`,
            evidence: `param=${name} reflected=${reflected} elapsedMs=${elapsed}`,
            requestResponseDiff: maskBody("application/json", JSON.stringify({
              probe: probeUrl.toString(),
              elapsedMs: elapsed,
              statusCode: result.status,
              bodyContainsProbe: reflected,
              bodyPreview: result.body.slice(0, 1500),
              safetyNote: "DoS、ブルートフォース、内部メタデータ取得は試行しておりません。example.com への単発GETのみ。"
            }, null, 2)),
            reproductionSteps: `1. ${probeUrl.toString()} にアクセス\n2. 応答に外部URLの内容が反映されるか、または応答が異常に遅いかを確認\n3. 別の外部URLでも同じ挙動か確認 (Burp Collaborator や interactsh で OOB 検証推奨)`,
            aiWorthSending: "サーバ側の信頼境界を破る重大バグの可能性。報告価値が高い。",
            bountyLikelihood: "high",
            recommendedAction: "manual_verify"
          });
          count++;
        }
      }
    } catch { /* skip */ }
  }
  return count;
}

export async function runSstiSafeProbe(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  const base = new URL(targetUrl).origin;
  const tested = new Set<string>();
  let count = 0;

  // Collect candidate URLs with params that might reflect
  const candidateUrls: string[] = [targetUrl];
  try {
    const mainPageRes = await fetchWithUrl(targetUrl);
    const linkMatches = mainPageRes.body.matchAll(/href=["']([^"']*\?[^"']+)["']/gi);
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

  for (const candidateUrl of candidateUrls.slice(0, 10)) {
    if (count >= 6) break;
    if (!isUrlInScope(program, candidateUrl).allowed) continue;

    try {
      const u = new URL(candidateUrl);
      const paramsToTest: string[] = [...u.searchParams.keys()];
      if (paramsToTest.length === 0) paramsToTest.push(...SSTI_PARAMS.slice(0, 4));

      for (const name of paramsToTest.slice(0, 6)) {
        if (count >= 6) break;
        const value = u.searchParams.get(name) ?? "";
        if (!value && !SSTI_PARAMS.includes(name)) continue;

        // Check if value is reflected in page
        const baselineRes = await fetchWithUrl(candidateUrl);
        if (value && !baselineRes.body.includes(value)) continue; // Only test reflected params

        const key = `${u.origin}${u.pathname}|${name}`;
        if (tested.has(key)) continue;
        tested.add(key);

        for (const probe of SSTI_PROBES) {
          const probeUrl = new URL(candidateUrl);
          probeUrl.searchParams.set(name, probe.payload);
          const result = await fetchWithUrl(probeUrl.toString());
          const evaluatedToExpected = result.body.includes(probe.expect);
          const literalEchoed = result.body.includes(probe.payload);
          if (evaluatedToExpected && !literalEchoed) {
            const taggedType = `SSTI 安全PoC候補 (${probe.engine}) [High]`;
            const target = `GET ${u.origin}${u.pathname}?${name}=...`;
            const existing = await findExistingScanFinding(scanId, taggedType, target);
            if (existing) continue;

            await createScanFinding(scanId, {
              type: taggedType,
              target,
              severity: "high",
              impact: `${name} パラメータに ${probe.engine} 系のテンプレート式 \`${probe.payload}\` を渡したところ、サーバ側で評価されて結果 \`${probe.expect}\` が応答に含まれました。Server-Side Template Injection の可能性があります。RCE につながるケースもあり、報奨金見込み: $5,000〜$50,000。`,
              inScopeReason: `収集済み許可ドメイン内、応答に反射するパラメータ`,
              evidence: `param=${name} payload=${probe.payload} expectedFound=true literalEchoed=false engine=${probe.engine}`,
              requestResponseDiff: maskBody("text/plain", JSON.stringify({
                probeUrl: probeUrl.toString(),
                payload: probe.payload,
                expectedResult: probe.expect,
                statusCode: result.status,
                bodyPreview: result.body.slice(0, 2000),
                safetyNote: "算術式のみ。RCEペイロード (例: __import__、{{config.items}}、system) は使用しておりません。"
              }, null, 2)),
              reproductionSteps: `1. ${probeUrl.toString()} にアクセス\n2. 応答内に "${probe.expect}" が含まれることを確認 (テンプレートエンジンが式を評価した証拠)\n3. ${probe.engine} のドキュメントを参照して RCE まで到達可能か慎重に確認 (人間判断必須)`,
              aiWorthSending: "サーバ側の信頼境界を破る重大バグの可能性。RCE 確定なら $5k-50k 級。報告価値が高い。",
              bountyLikelihood: "high",
              recommendedAction: "report_now"
            });
            count++;
            break;
          }
        }
      }
    } catch { /* skip */ }
  }
  return count;
}
