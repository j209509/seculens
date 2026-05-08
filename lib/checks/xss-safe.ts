// 反射型 XSS 安全 PoC 候補検出。
// 戦略:
//   1. targetUrl の GET エンドポイントと既知 query params を probe
//   2. 各 query param に safe marker ( "><svg data-bb-xss="abc"></svg> ) を挿入して fetch
//   3. レスポンス Content-Type が text/html かつ marker がリテラルで反射してたら候補
//   4. HTML エンコード ( &lt;svg ) されてたら safeContext として除外
// 安全策:
//   - script タグや eval / cookie アクセス系は付けない
//   - data-bb-xss 属性で「攻撃文字列」風じゃないことが確認できる
//
// DOM-based XSS は runDomXssAnalysis で JS バンドルの source-sink 解析で検出する。

import { chromium } from "playwright";
import { isUrlInScope } from "@/lib/scope";
import { maskBody } from "@/lib/mask";
import { makeScanCtx, createScanFinding, findExistingScanFinding } from "@/lib/scan-adapter";
import { generateSafeXssMarker, analyzeXssReflection, isPayloadSafeForXss } from "./safe-payloads";

// Common query parameter names that tend to reflect in HTML
const COMMON_REFLECT_PARAMS = ["q", "search", "query", "keyword", "name", "msg", "message", "input", "value", "text", "s", "term", "filter", "category", "tag", "title", "lang", "locale", "page", "error", "success"];

// Common paths to probe
const PROBE_PATHS = ["/", "/search", "/api/search", "/products", "/blog", "/news"];

async function fetchPage(url: string): Promise<{ status: number; body: string; headers: Record<string, string | string[] | undefined> }> {
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

export async function runXssSafeProbe(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  const base = new URL(targetUrl).origin;
  const tested = new Set<string>();
  let count = 0;

  // Also detect params from the main page's existing links
  const candidateUrls: string[] = [targetUrl];
  try {
    const mainPage = await fetchPage(targetUrl);
    const linkMatches = mainPage.body.matchAll(/href=["']([^"']*\?[^"']+)["']/gi);
    for (const m of linkMatches) {
      try {
        const u = new URL(m[1], base);
        if (isUrlInScope(program, u.toString()).allowed && u.searchParams.size > 0) {
          candidateUrls.push(u.toString());
          if (candidateUrls.length >= 10) break;
        }
      } catch { /* ignore */ }
    }
    // Add common paths
    for (const p of PROBE_PATHS) {
      const u = `${base}${p}`;
      if (!candidateUrls.includes(u)) candidateUrls.push(u);
    }
  } catch { /* ignore */ }

  const marker = generateSafeXssMarker();
  if (!isPayloadSafeForXss(marker.safeProbe)) return 0;

  for (const candidateUrl of candidateUrls.slice(0, 15)) {
    if (count >= 10) break;
    if (!isUrlInScope(program, candidateUrl).allowed) continue;

    try {
      const u = new URL(candidateUrl);
      // Get existing params OR try common ones
      const paramsToTest: string[] = [...u.searchParams.keys()];
      if (paramsToTest.length === 0) paramsToTest.push(...COMMON_REFLECT_PARAMS.slice(0, 5));

      for (const name of paramsToTest.slice(0, 8)) {
        if (count >= 10) break;
        const key = `${u.origin}${u.pathname}|${name}`;
        if (tested.has(key)) continue;
        tested.add(key);

        const probeUrl = new URL(candidateUrl);
        probeUrl.searchParams.set(name, marker.safeProbe);
        const res = await fetchPage(probeUrl.toString());
        const ct = ((res.headers["content-type"] || "") as string).toLowerCase();
        const isHtml = ct.includes("text/html") || ct.includes("application/xhtml");
        if (!isHtml) continue;

        const encoded = `&lt;svg data-bb-xss=&quot;${marker.id}&quot;`;
        const encodedAlsoFound = res.body.includes(encoded);
        const reflection = analyzeXssReflection({ responseBody: res.body, probe: marker.safeProbe, markerId: marker.id, encodedAlsoFound });
        if (!reflection.reflected || reflection.safeContext) continue;

        const taggedType = `XSS 安全PoC候補 (反射型 ${reflection.type}) [Medium-High]`;
        const target = `GET ${u.origin}${u.pathname}?${name}=...`;
        const existing = await findExistingScanFinding(scanId, taggedType, target);
        if (existing) continue;

        await createScanFinding(scanId, {
          type: taggedType,
          target,
          severity: reflection.type === "literal" ? "high" : "medium",
          impact: `クエリパラメータ ${name} に safe marker ( ${marker.safeProbe} ) を挿入したところ、レスポンス HTML 中にエンコードされず literal で反射されました。XSS が成立する可能性がございます。実 payload は data-bb-xss 属性のみで script/eval/cookie アクセスは含めていないため、PoC として安全です。`,
          inScopeReason: `収集済み許可ドメイン内の HTML レスポンスを返す GET エンドポイント`,
          evidence: `paramName=${name}, markerId=${marker.id}, contentType=${ct}, reflectionType=${reflection.type}`,
          requestResponseDiff: maskBody("application/json", JSON.stringify({
            paramName: name,
            probeUsed: marker.safeProbe,
            markerId: marker.id,
            status: res.status,
            contentType: ct,
            reflectionType: reflection.type,
            encodedAlsoFound,
            safetyNote: "data-bb-xss 属性のみ。script / eval / document.cookie / fetch は使用していない。"
          }, null, 2)),
          reproductionSteps: `1. ${probeUrl.toString()} にアクセス\n2. レスポンス HTML を grep '${marker.safeProbe}' で確認 → リテラル反射あり\n3. 攻撃者は ${name} パラメータに任意の HTML/JS を挿入することで XSS を成立させ得る\n4. 実環境では Cookie 窃取 / アカウント乗っ取り等に発展する可能性`,
          aiWorthSending: reflection.type === "literal" ? "リテラル反射が確認されました。CSP / WAF の防御確認後 PoC を強化して報告候補です。" : "エンコード反射のためコンテキスト ( 属性値 / JS リテラル等 ) を人間が確認してください。",
          bountyLikelihood: reflection.type === "literal" ? "high" : "medium",
          recommendedAction: reflection.type === "literal" ? "report_now" : "manual_verify"
        });
        count++;
      }
    } catch { /* skip */ }
  }
  return count;
}

// DOM-based XSS の sink 検出。
// JS バンドル中に "innerHTML / document.write / eval / setTimeout(string) / location.href = ..." 等の
// sink がユーザー入力 (location.search / location.hash / referrer / postMessage event.data) と
// 組み合わさってるかを静的に検出 ( 実行はしない )。
const DOM_SINKS = [
  /\.innerHTML\s*=/g,
  /\.outerHTML\s*=/g,
  /document\.write(?:ln)?\s*\(/g,
  /\beval\s*\(/g,
  /new\s+Function\s*\(/g,
  /setTimeout\s*\(\s*["']?[a-zA-Z_$]/g,
  /setInterval\s*\(\s*["']?[a-zA-Z_$]/g,
  /location\s*\.\s*href\s*=/g,
  /location\s*=\s*[^=]/g,
  /\.insertAdjacentHTML\s*\(/g
];
const DOM_SOURCES = [
  /location\.search/,
  /location\.hash/,
  /location\.href/,
  /document\.referrer/,
  /document\.URL/,
  /window\.name/,
  /addEventListener\s*\(\s*["']message["']/,
  /event\.data/
];

async function fetchJsBundle(url: string): Promise<string> {
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    const res = await page.request.fetch(url, { method: "GET", failOnStatusCode: false, timeout: 10000 });
    const body = await res.text().catch(() => "");
    await ctx.close();
    return body.slice(0, 500000);
  } finally { await browser.close().catch(() => undefined); }
}

export async function runDomXssAnalysis(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  const base = new URL(targetUrl).origin;

  // Get list of JS files from main page
  const mainPageRes = await fetchPage(targetUrl).catch(() => null);
  if (!mainPageRes) return 0;

  const jsUrls: string[] = [];
  const scriptMatches = mainPageRes.body.matchAll(/<script[^>]*src=["']([^"']+\.js[^"']*)["']/gi);
  for (const m of scriptMatches) {
    try {
      const jsUrl = new URL(m[1], base).toString();
      if (isUrlInScope(program, jsUrl).allowed) jsUrls.push(jsUrl);
      if (jsUrls.length >= 5) break;
    } catch { /* ignore */ }
  }

  let count = 0;
  const seen = new Set<string>();
  for (const jsUrl of jsUrls.slice(0, 10)) {
    if (count >= 6) break;
    if (seen.has(jsUrl)) continue;
    seen.add(jsUrl);

    try {
      const body = await fetchJsBundle(jsUrl);
      if (!body || body.length < 50) continue;

      const sinkHits: string[] = [];
      const sourceHits: string[] = [];
      for (const re of DOM_SINKS) {
        const m = body.match(re);
        if (m) sinkHits.push(re.source);
      }
      for (const re of DOM_SOURCES) {
        if (re.test(body)) sourceHits.push(re.source);
      }
      if (sinkHits.length === 0 || sourceHits.length === 0) continue;

      let coLocated = false;
      for (const sinkRe of DOM_SINKS) {
        const sinkMatch = body.match(sinkRe);
        if (!sinkMatch || sinkMatch.index === undefined) continue;
        const sinkIdx = sinkMatch.index;
        const window = body.slice(Math.max(0, sinkIdx - 200), sinkIdx + 200);
        for (const srcRe of DOM_SOURCES) {
          if (srcRe.test(window)) { coLocated = true; break; }
        }
        if (coLocated) break;
      }
      if (!coLocated) continue;

      const taggedType = `DOM-based XSS 候補 ( JS sink+source 同居 ) [Medium]`;
      const target = jsUrl;
      const existing = await findExistingScanFinding(scanId, taggedType, target);
      if (existing) continue;

      await createScanFinding(scanId, {
        type: taggedType,
        target,
        severity: "medium",
        impact: `JS バンドル ${jsUrl} 中に DOM XSS の sink ( ${sinkHits.join(", ")} ) とユーザー制御 source ( ${sourceHits.join(", ")} ) が近接して存在いたします。location.search や hash 経由で sink に到達するコードパスがあれば DOM XSS が成立する可能性がございます。実行は行っておらず静的解析のみのため誤検知の可能性もございます。`,
        inScopeReason: `収集済み許可ドメイン内の JS バンドル`,
        evidence: `jsUrl=${jsUrl}, sinks=[${sinkHits.join(",")}], sources=[${sourceHits.join(",")}]`,
        requestResponseDiff: maskBody("application/javascript", JSON.stringify({ sinkHits, sourceHits, sampleSnippet: body.slice(0, 800), safetyNote: "静的解析のみ。実行はしていない。" }, null, 2)),
        reproductionSteps: `1. ${jsUrl} を取得して JS ソースを確認\n2. sink ${sinkHits[0]} 周辺の制御フローを辿る\n3. location.hash や location.search 経由でユーザー入力が sink に到達するパスを特定\n4. ペイロード例: #<img src=x onerror=alert(1)> でブラウザ実機検証`,
        aiWorthSending: "DOM XSS は実機ブラウザで再現確認が必須です。静的に sink+source 同居が見えただけなので、実際の到達可能性は人間検証が必要です。",
        bountyLikelihood: "medium",
        recommendedAction: "manual_verify"
      });
      count++;
    } catch { /* skip */ }
  }
  return count;
}
