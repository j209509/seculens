// 未ログイン外部観測チェック 追加 14 機能
// 制約: GET/HEAD/OPTIONS のみ、 exploit / brute force / DoS / 外部送信 禁止

import { chromium } from "playwright";
import { isUrlInScope } from "@/lib/scope";
import { maskBody } from "@/lib/mask";
import { safeJsonParse } from "@/lib/json";
import { isLikelyValidApex } from "@/lib/domain-validity";
import { makeScanCtx, createScanFinding, findExistingScanFinding } from "@/lib/scan-adapter";

async function fetchAnon(url: string, method: "GET" | "HEAD" = "GET"): Promise<{ status: number; body: string; headers: Record<string, string | string[] | undefined> } | null> {
  try {
    const browser = await chromium.launch({ headless: true });
    try {
      const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
      const page = await ctx.newPage();
      const res = await page.request.fetch(url, { method, failOnStatusCode: false, timeout: 8000, maxRedirects: 2 });
      const body = await res.text().catch(() => "");
      const headers = res.headers();
      await ctx.close();
      return { status: res.status(), body: body.slice(0, 12000), headers };
    } finally { await browser.close().catch(() => undefined); }
  } catch { return null; }
}

async function createNote(scanId: string, type: string, target: string, severity: "high" | "medium" | "low", impact: string, evidence: string, repro: string, payload: object, action: "report_now" | "manual_verify" | "monitor" = "monitor") {
  const existing = await findExistingScanFinding(scanId, type, target);
  if (existing) return null;
  await createScanFinding(scanId, {
    type, target, severity, impact,
    inScopeReason: "収集済み許可ドメイン ( 外部観測 mining )",
    evidence,
    requestResponseDiff: maskBody("application/json", JSON.stringify(payload, null, 2)),
    reproductionSteps: repro,
    recommendedAction: action
  });
  return true;
}

function getHosts(program: { allowedDomains: string }, max = 4): string[] {
  const allowed = safeJsonParse<string[]>(program.allowedDomains, []);
  return Array.from(new Set(allowed.map((d) => d.replace(/^\*\./, "").replace(/^https?:\/\//, "").split("/")[0]).filter(isLikelyValidApex))).slice(0, max);
}

// === 1. HTTP/2 Alt-Svc / h3 / Via / Server backend correlation ===
export async function runHttp2AltSvcCorrelation(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  let count = 0;
  for (const host of getHosts(program, 3)) {
    if (count >= 2) break;
    const r = await fetchAnon(`https://${host}/`);
    if (!r) continue;
    const altSvc = (Array.isArray(r.headers["alt-svc"]) ? r.headers["alt-svc"].join(",") : r.headers["alt-svc"]) ?? "";
    const via = (Array.isArray(r.headers["via"]) ? r.headers["via"].join(",") : r.headers["via"]) ?? "";
    const xBackend = r.headers["x-backend-server"] || r.headers["x-app-server"] || r.headers["x-served-by"] || r.headers["x-host"];
    const issues: string[] = [];
    if (altSvc) {
      const altHosts = Array.from(altSvc.matchAll(/(?:h2|h3)(?:-\d+)?=["']([^:"']+):/gi)).map((m) => m[1]).filter((h) => h && h !== "");
      const internal = altHosts.filter((h) => h !== host && /(?:internal|corp|local|cluster|svc|ec2|prod|stg|dev)/i.test(h));
      if (internal.length > 0) issues.push(`Alt-Svc に内部 host: ${internal.join(", ")}`);
    }
    if (/[a-z0-9-]+\.(?:internal|local|corp|cluster|svc)/i.test(via)) issues.push(`Via header に内部 hostname: ${via.slice(0, 80)}`);
    const xb = Array.isArray(xBackend) ? xBackend.join(",") : (xBackend ?? "");
    if (/(?:internal|local|corp|cluster|svc|i-[a-f0-9]+|ip-\d+)/i.test(xb)) issues.push(`X-Backend / X-Served-By: ${xb.slice(0, 80)}`);
    if (issues.length === 0) continue;
    await createNote(scanId, `HTTP/2 Alt-Svc / Via / backend 内部情報漏洩 (${issues.length} 件) [Low]`, `https://${host}/`, "low",
      `${host} のレスポンスヘッダーから内部 backend 情報が漏洩: ${issues.join(" / ")}。 攻撃面マップの hint。`,
      `host=${host}, issues=${issues.length}`,
      `1. GET https://${host}/ → response headers 観察\n2. Alt-Svc / Via / X-Backend で内部 hostname 検出`,
      { host, altSvc, via, xBackend: xb, safetyNote: "GET 1 リクエストのみ。" });
    count++;
  }
  return count;
}

// === 2. canonical / hreflang alternate host extraction ===
export async function runCanonicalHreflangMining(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  let count = 0;
  const r = await fetchAnon(targetUrl);
  if (!r || !isUrlInScope(program, targetUrl).allowed) return count;
  const body = r.body;
  const altHosts = new Set<string>();
  for (const m of body.matchAll(/<link[^>]+rel=["'](?:canonical|alternate)["'][^>]+href=["']([^"']+)["']/gi)) {
    try { altHosts.add(new URL(m[1]).host); } catch { /* ignore */ }
  }
  for (const m of body.matchAll(/<link[^>]+hreflang=["'][^"']+["'][^>]+href=["']([^"']+)["']/gi)) {
    try { altHosts.add(new URL(m[1]).host); } catch { /* ignore */ }
  }
  if (altHosts.size === 0) return count;
  const currentHost = new URL(targetUrl).host;
  altHosts.delete(currentHost);
  if (altHosts.size === 0) return count;
  const newHosts = [...altHosts];
  await createNote(scanId, `canonical/hreflang 別 host ${newHosts.length} 件抽出 [Low]`, targetUrl, "low",
    `${targetUrl} の canonical/hreflang/alternate 経由で ${newHosts.length} 個の別 host: ${newHosts.slice(0, 5).join(", ")}。 多 region / 多言語版 / staging の hint。`,
    `url=${targetUrl}, altHosts=${newHosts.length}`,
    `1. GET ${targetUrl}\n2. <link rel="canonical|alternate"> から host 抽出`,
    { sourceUrl: targetUrl, altHosts: newHosts, safetyNote: "GET 1 リクエストのみ。" });
  count++;
  return count;
}

// === 3. Open Graph / Twitter Card metadata leakage ===
export async function runOpenGraphTwitterCardMining(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  let count = 0;
  if (!isUrlInScope(program, targetUrl).allowed) return count;
  const r = await fetchAnon(targetUrl);
  if (!r || r.status !== 200) return count;
  const body = r.body;
  const ogImage = body.match(/<meta[^>]+(?:property|name)=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1];
  const twitterImage = body.match(/<meta[^>]+(?:property|name)=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)?.[1];
  const ogUrl = body.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i)?.[1];
  const issues: string[] = [];
  for (const v of [ogImage, twitterImage, ogUrl].filter(Boolean) as string[]) {
    try {
      const u = new URL(v);
      if (/(?:internal|staging|dev|sandbox|preview|preprod)/i.test(u.host)) issues.push(`OG metadata に内部/staging host: ${u.host}`);
      if (/(?:s3-bucket|gcs-bucket|admin|private|draft|unpublished)/i.test(u.pathname)) issues.push(`OG metadata に sensitive path: ${u.pathname}`);
    } catch { /* ignore */ }
  }
  if (issues.length === 0) return count;
  await createNote(scanId, `Open Graph / Twitter Card metadata 漏洩 (${issues.length} 件) [Low]`, targetUrl, "low",
    `${targetUrl} の OG / Twitter Card メタデータから内部 host / staging URL / sensitive path: ${issues.join(" / ")}。 SNS 共有時に意図せず内部情報が広まる + 攻撃面マップ。`,
    `url=${targetUrl}, issues=${issues.length}`,
    `1. GET ${targetUrl}\n2. <meta property="og:*"> / <meta name="twitter:*"> から URL 抽出`,
    { url: targetUrl, ogImage, twitterImage, ogUrl, issues, safetyNote: "GET 1 リクエストのみ。" });
  count++;
  return count;
}

// === 4. JSON-LD structured data mining ===
export async function runJsonLdMining(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  let count = 0;
  if (!isUrlInScope(program, targetUrl).allowed) return count;
  const r = await fetchAnon(targetUrl);
  if (!r || r.status !== 200) return count;
  const body = r.body;
  const blocks = Array.from(body.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)).map((m) => m[1]);
  if (blocks.length === 0) return count;
  const sensitive: string[] = [];
  for (const b of blocks.slice(0, 5)) {
    try {
      const j = JSON.parse(b.trim());
      const text = JSON.stringify(j);
      if (/@(?:internal|staging|dev|corp)\.[a-z]+/i.test(text)) sensitive.push("内部 email domain");
      if (/employee[_-]?id|staff[_-]?id|internal[_-]?id/i.test(text)) sensitive.push("内部 ID キー");
      if (/(?:author|publisher).*?email[\s"':]+[^@]+@[a-z0-9.-]+/i.test(text)) {
        const m = text.match(/email[\s"':]+([^@\s"]+@[a-z0-9.-]+)/i);
        if (m) sensitive.push(`公開 email: ${m[1].slice(0, 40)}`);
      }
    } catch { /* ignore */ }
  }
  if (sensitive.length === 0) return count;
  await createNote(scanId, `JSON-LD 機微情報 ${sensitive.length} 件 [Low]`, targetUrl, "low",
    `${targetUrl} の JSON-LD ( 構造化データ ) から: ${sensitive.join(" / ")}。 OSINT / phishing 標的化の hint。`,
    `url=${targetUrl}, blockCount=${blocks.length}, issues=${sensitive.length}`,
    `1. GET ${targetUrl}\n2. <script type="application/ld+json"> から JSON 抽出`,
    { url: targetUrl, sensitive, blockCount: blocks.length, safetyNote: "GET 1 リクエストのみ。" });
  count++;
  return count;
}

// === 5. HTML data-* attribute mining ===
export async function runDataAttributeMining(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  let count = 0;
  if (!isUrlInScope(program, targetUrl).allowed) return count;
  const r = await fetchAnon(targetUrl);
  if (!r || r.status !== 200) return count;
  const body = r.body;
  const attrs = Array.from(body.matchAll(/data-([a-z][a-z0-9-]*)=["']([^"']{1,200})["']/gi)).map((m) => ({ name: m[1], value: m[2] }));
  const sensitive = attrs.filter((a) =>
    /api[-_]?key|secret|token|password|admin|internal|user[-_]?id|tenant[-_]?id|workspace[-_]?id|email/i.test(a.name) ||
    /[A-Za-z0-9]{20,}/.test(a.value) && /key|token|secret/i.test(a.name)
  ).slice(0, 20);
  if (sensitive.length === 0) return count;
  await createNote(scanId, `HTML data-* 属性に機微情報 (${sensitive.length} 件) [Low]`, targetUrl, "low",
    `${targetUrl} の HTML 中に data-* 属性で機微情報名 ${sensitive.length} 件: ${sensitive.slice(0, 5).map((a) => `data-${a.name}=${a.value.slice(0, 20)}`).join(", ")}。`,
    `url=${targetUrl}, attrCount=${attrs.length}, sensitiveCount=${sensitive.length}`,
    `1. GET ${targetUrl}\n2. data-* 属性抽出`,
    { url: targetUrl, sensitiveAttrs: sensitive.slice(0, 15).map((a) => ({ name: a.name, valuePreview: a.value.slice(0, 40) })), safetyNote: "GET 1 リクエストのみ。" });
  count++;
  return count;
}

// === 6. robots.txt Disallow target verification ===
export async function runRobotsSensitiveVerification(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  let count = 0;
  for (const host of getHosts(program, 3)) {
    if (count >= 2) break;
    const r = await fetchAnon(`https://${host}/robots.txt`);
    if (!r || r.status !== 200) continue;
    const disallows = Array.from(r.body.matchAll(/^Disallow:\s*([^\s#]+)/gim)).map((m) => m[1]);
    const sensitive = disallows.filter((p) => /(?:admin|internal|private|backup|debug|export|api\/v\d+|graphql|console|panel|dashboard|backoffice|secret|key|token)/i.test(p)).slice(0, 5);
    if (sensitive.length === 0) continue;
    const accessible: Array<{ path: string; status: number; bodyPreview: string }> = [];
    for (const p of sensitive) {
      const url = `https://${host}${p.startsWith("/") ? p : "/" + p}`;
      if (!isUrlInScope(program, url).allowed) continue;
      const probe = await fetchAnon(url);
      if (!probe) continue;
      if (probe.status === 200 && /(?:admin|user|customer|invoice|secret|token|api[_-]?key)/i.test(probe.body.slice(0, 1000))) {
        accessible.push({ path: p, status: probe.status, bodyPreview: probe.body.slice(0, 500) });
      }
    }
    if (accessible.length === 0) continue;
    await createNote(scanId, `robots.txt Disallow が公開アクセス可 (${accessible.length} 件) [Medium]`, `https://${host}/robots.txt`, "medium",
      `${host}/robots.txt で Disallow 指定された sensitive path が匿名 GET で 200 返却 + 機密 keyword 検出: ${accessible.map((a) => a.path).join(", ")}。`,
      `host=${host}, sensitiveDisallows=${sensitive.length}, accessibleCount=${accessible.length}`,
      `1. GET https://${host}/robots.txt → Disallow リスト\n2. 各 sensitive path に GET → 200 + 機密含む`,
      { host, accessible, safetyNote: "robots.txt + 各 path に GET 1 回ずつのみ。" });
    count++;
  }
  return count;
}

// === 7. favicon / apple-touch-icon asset host/path mining ===
export async function runFaviconAppleTouchMining(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  let count = 0;
  for (const host of getHosts(program, 3)) {
    if (count >= 2) break;
    const r = await fetchAnon(`https://${host}/`);
    if (!r) continue;
    const icons = Array.from(r.body.matchAll(/<link[^>]+rel=["'][^"']*(?:icon|apple-touch-icon)[^"']*["'][^>]+href=["']([^"']+)["']/gi)).map((m) => m[1]);
    if (icons.length === 0) continue;
    const externalHosts = new Set<string>();
    for (const i of icons) {
      try {
        const u = new URL(i, `https://${host}/`);
        if (u.host !== host && u.host !== `www.${host}`) externalHosts.add(u.host);
      } catch { /* ignore */ }
    }
    if (externalHosts.size === 0) continue;
    const sensitive = [...externalHosts].filter((h) => /(?:s3\.amazonaws|gcs|blob\.core\.windows|r2\.cloudflarestorage|cdn\.|assets\.|internal|staging)/i.test(h));
    if (sensitive.length === 0) continue;
    await createNote(scanId, `favicon/apple-touch-icon 外部 asset host (${sensitive.length} 件) [Low]`, `https://${host}/`, "low",
      `${host} の favicon / apple-touch-icon が外部 host から提供: ${sensitive.join(", ")}。 CDN / S3 bucket / 内部 asset 配信 host の発見 hint。`,
      `host=${host}, externalHosts=${sensitive.length}`,
      `1. GET https://${host}/\n2. <link rel="icon|apple-touch-icon"> から host 抽出`,
      { host, sensitiveHosts: sensitive, allIcons: icons, safetyNote: "GET 1 リクエストのみ。" });
    count++;
  }
  return count;
}

// === 8. public worker files inspection ===
export async function runPublicWorkerFilesCheck(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  const paths = [
    "/worker.js", "/sw.js", "/service-worker.js",
    "/pdf.worker.js", "/pdf.worker.min.js",
    "/monaco.worker.js", "/editor.worker.js",
    "/ts.worker.js", "/json.worker.js", "/css.worker.js", "/html.worker.js",
    "/ffmpeg.worker.js",
    "/static/js/worker.js", "/static/workers/worker.js"
  ];
  let count = 0;
  for (const host of getHosts(program, 3)) {
    if (count >= 3) break;
    for (const p of paths) {
      if (count >= 3) break;
      const url = `https://${host}${p}`;
      if (!isUrlInScope(program, url).allowed) continue;
      const r = await fetchAnon(url);
      if (!r || r.status !== 200) continue;
      if (r.body.length < 200) continue;
      const sensitive = Array.from(new Set([
        ...(r.body.match(/(?:apiKey|api_key|API_KEY|secret|token|admin|internal|password)[\s=:"']+[A-Za-z0-9_-]{10,}/gi) ?? []),
        ...(r.body.match(/https?:\/\/(?:[a-z0-9-]+\.)*(?:internal|local|corp|cluster|staging|dev|sandbox)\.[a-z]+/gi) ?? [])
      ])).slice(0, 10);
      if (sensitive.length === 0) continue;
      await createNote(scanId, `Public worker file 機微情報 (${p}) [Low]`, url, "low",
        `${url} に sensitive 情報 ${sensitive.length} 件: ${sensitive.slice(0, 3).map((s) => s.slice(0, 50)).join(", ")}。`,
        `host=${host}, path=${p}, sensitiveCount=${sensitive.length}`,
        `1. GET ${url}`,
        { url, sensitive, safetyNote: "GET 1 リクエストのみ。" });
      count++;
    }
  }
  return count;
}

// === 9. CSS sourceMappingURL exposure ===
export async function runCssSourcemapCheck(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  // Fetch main page to get CSS URLs
  let count = 0;
  const mainPage = await fetchAnon(targetUrl);
  if (!mainPage) return count;
  const cssSrcs = Array.from(mainPage.body.matchAll(/href=["']([^"']+\.css[^"']*)["']/gi)).map((m) => m[1]);
  const tested = new Set<string>();
  for (const src of cssSrcs.slice(0, 10)) {
    if (count >= 2) break;
    const cssUrl = src.startsWith("http") ? src : `${new URL(targetUrl).origin}${src.startsWith("/") ? src : "/" + src}`;
    if (!isUrlInScope(program, cssUrl).allowed) continue;
    if (tested.has(cssUrl)) continue;
    tested.add(cssUrl);
    const t = await fetchAnon(cssUrl);
    if (!t || t.status !== 200) continue;
    const body = t.body;
    const m = body.match(/\/\*#\s*sourceMappingURL\s*=\s*([^\s\*]+)\s*\*\//);
    if (!m) continue;
    let mapUrl = m[1];
    if (!/^https?:/i.test(mapUrl)) {
      try { mapUrl = new URL(mapUrl, cssUrl).toString(); } catch { continue; }
    }
    if (!isUrlInScope(program, mapUrl).allowed) continue;
    const r = await fetchAnon(mapUrl);
    if (!r || r.status !== 200) continue;
    if (!/"version"\s*:\s*3|"sources"\s*:\s*\[/.test(r.body)) continue;
    const sources = Array.from((r.body.match(/"sources"\s*:\s*\[([^\]]+)\]/i)?.[1] ?? "").matchAll(/"([^"]+)"/g)).map((s) => s[1]).slice(0, 30);
    const internalPaths = sources.filter((s) => /(?:webpack:\/\/|\/Users\/|C:\\|\/home\/|\/builds\/|node_modules)/i.test(s));
    if (internalPaths.length === 0) continue;
    await createNote(scanId, `CSS source map 公開 (${internalPaths.length} 内部 path) [Low]`, mapUrl, "low",
      `${mapUrl} で CSS の source map が公開され、SCSS / Less / Tailwind 等の元ファイル path ${internalPaths.length} 個が漏洩。`,
      `cssUrl=${cssUrl}, mapUrl=${mapUrl}, internalPaths=${internalPaths.length}`,
      `1. GET ${cssUrl} → /*# sourceMappingURL */ コメント\n2. GET ${mapUrl} → CSS source map`,
      { cssUrl, mapUrl, sources: sources.slice(0, 15), internalPaths, safetyNote: "GET 2 リクエストのみ。" });
    count++;
  }
  return count;
}

// === 10. meta refresh redirect review ===
export async function runMetaRefreshReview(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  let count = 0;
  if (!isUrlInScope(program, targetUrl).allowed) return count;
  const r = await fetchAnon(targetUrl);
  if (!r || r.status !== 200) return count;
  const body = r.body;
  const m = body.match(/<meta[^>]+http-equiv=["']?refresh["']?[^>]+content=["']?\d+;\s*url=([^"'>]+)/i);
  if (!m) return count;
  let target: URL;
  try { target = new URL(m[1], targetUrl); } catch { return count; }
  const sourceHost = new URL(targetUrl).host;
  if (target.host === sourceHost) return count;
  const issue = /(?:staging|internal|dev|sandbox|preprod|test)/i.test(target.host) ? "内部/staging host へ refresh"
              : !target.host.endsWith(sourceHost.split(".").slice(-2).join(".")) ? "外部 host へ refresh"
              : null;
  if (!issue) return count;
  await createNote(scanId, `meta refresh で別 host へリダイレクト (${issue}) [Low]`, targetUrl, "low",
    `${targetUrl} に meta refresh で ${target.toString()} ( ${issue} )。 attacker 制御パラメータ次第で open redirect 化リスク。`,
    `sourceUrl=${targetUrl}, refreshTo=${target.toString()}, issue=${issue}`,
    `1. GET ${targetUrl}\n2. <meta http-equiv="refresh"> から URL 抽出`,
    { sourceUrl: targetUrl, refreshTarget: target.toString(), issue, safetyNote: "GET 1 リクエストのみ。" });
  count++;
  return count;
}

// === 11. JS/CSS license comment block mining ===
export async function runLicenseCommentBlockMining(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  let count = 0;
  const mainPage = await fetchAnon(targetUrl);
  if (!mainPage) return count;
  const jsSrcs = Array.from(mainPage.body.matchAll(/src=["']([^"']+\.(?:js|mjs))["']/gi)).map((m) => m[1]);
  for (const src of jsSrcs.slice(0, 10)) {
    if (count >= 3) break;
    const jsUrl = src.startsWith("http") ? src : `${new URL(targetUrl).origin}${src.startsWith("/") ? src : "/" + src}`;
    if (!isUrlInScope(program, jsUrl).allowed) continue;
    const t = await fetchAnon(jsUrl);
    if (!t || t.status !== 200) continue;
    const body = t.body;
    if (!body || body.length < 200) continue;
    const head = body.slice(0, 5000);
    const blocks = [...head.matchAll(/\/\*!?[\s\S]{20,1500}?\*\//g)].map((m) => m[0]);
    if (blocks.length === 0) continue;
    const sensitive: string[] = [];
    for (const b of blocks) {
      const repoMatch = b.match(/(?:git@|https?:\/\/)(?:github\.com|gitlab\.com|bitbucket\.org|[a-z0-9-]+\.(?:internal|corp|local))[\/:]([\w-]+\/[\w-]+)/i);
      if (repoMatch) sensitive.push(`repo URL: ${repoMatch[0].slice(0, 80)}`);
      const pkgMatch = b.match(/@[a-z0-9-]+\/(?:internal|private|core|admin|legacy)[a-z0-9-]+/i);
      if (pkgMatch) sensitive.push(`private pkg: ${pkgMatch[0]}`);
      const pathMatch = b.match(/\/(?:Users|home|builds|workspace|jenkins|gitlab-runner)\/[a-z0-9._\-\/]+/i);
      if (pathMatch) sensitive.push(`build path: ${pathMatch[0].slice(0, 80)}`);
      const hostMatch = b.match(/[a-z0-9-]+\.(?:internal|local|corp|cluster|svc)\.[a-z0-9.]+/i);
      if (hostMatch) sensitive.push(`internal host: ${hostMatch[0]}`);
    }
    if (sensitive.length === 0) continue;
    await createNote(scanId, `License/banner comment 機微情報 ${sensitive.length} 件 [Low]`, jsUrl, "low",
      `${jsUrl} の先頭 license/banner block に: ${sensitive.slice(0, 3).join(" / ")}。 内部 repo / private package / build 環境 / 内部 host の hint。`,
      `url=${jsUrl}, sensitiveCount=${sensitive.length}`,
      `1. GET ${jsUrl}\n2. 先頭 5KB の /*! ... */ block 抽出`,
      { url: jsUrl, sensitive, safetyNote: "GET 1 リクエストのみ。" });
    count++;
  }
  return count;
}

// === 12. CSS url() asset host mining ===
export async function runCssUrlAssetHostMining(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  let count = 0;
  const mainPage = await fetchAnon(targetUrl);
  if (!mainPage) return count;
  const cssSrcs = Array.from(mainPage.body.matchAll(/href=["']([^"']+\.css[^"']*)["']/gi)).map((m) => m[1]);
  for (const src of cssSrcs.slice(0, 5)) {
    if (count >= 2) break;
    const cssUrl = src.startsWith("http") ? src : `${new URL(targetUrl).origin}${src.startsWith("/") ? src : "/" + src}`;
    if (!isUrlInScope(program, cssUrl).allowed) continue;
    const t = await fetchAnon(cssUrl);
    if (!t || t.status !== 200) continue;
    const body = t.body;
    const urlMatches = Array.from(body.matchAll(/url\s*\(\s*["']?([^"')]+)["']?\s*\)/g)).map((m) => m[1]);
    const externalHosts = new Set<string>();
    for (const u of urlMatches) {
      try {
        const x = new URL(u, cssUrl);
        if (x.host !== new URL(cssUrl).host) externalHosts.add(x.host);
      } catch { /* ignore */ }
    }
    if (externalHosts.size === 0) continue;
    const interesting = [...externalHosts].filter((h) => /(?:s3\.amazonaws|blob\.core\.windows|gcs|cdn|assets|internal|staging|preview)/i.test(h));
    if (interesting.length === 0) continue;
    await createNote(scanId, `CSS url() 外部 asset host (${interesting.length} 件) [Low]`, cssUrl, "low",
      `${cssUrl} ( CSS ) に外部 host への url() 参照: ${interesting.slice(0, 5).join(", ")}。 CDN / bucket / 内部 asset host 発見の hint。`,
      `cssUrl=${cssUrl}, externalHosts=${interesting.length}`,
      `1. GET ${cssUrl} → url() 参照抽出`,
      { cssUrl, interestingHosts: interesting, allHosts: [...externalHosts], safetyNote: "GET 1 リクエストのみ。" });
    count++;
  }
  return count;
}

/** scan-runner.ts から呼ばれる統合エントリポイント */
export async function runExternalMiningChecks(scanId: string, targetUrl: string): Promise<void> {
  await Promise.allSettled([
    runHttp2AltSvcCorrelation(scanId, targetUrl),
    runCanonicalHreflangMining(scanId, targetUrl),
    runOpenGraphTwitterCardMining(scanId, targetUrl),
    runJsonLdMining(scanId, targetUrl),
    runDataAttributeMining(scanId, targetUrl),
    runRobotsSensitiveVerification(scanId, targetUrl),
    runFaviconAppleTouchMining(scanId, targetUrl),
    runPublicWorkerFilesCheck(scanId, targetUrl),
    runCssSourcemapCheck(scanId, targetUrl),
    runMetaRefreshReview(scanId, targetUrl),
    runLicenseCommentBlockMining(scanId, targetUrl),
    runCssUrlAssetHostMining(scanId, targetUrl),
  ]);
}
