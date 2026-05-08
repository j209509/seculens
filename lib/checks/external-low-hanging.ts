// 未ログイン外部観測 / 低報酬でも拾いやすい Low〜Medium 候補チェック群
// 制約: GET/HEAD のみ。brute force / DoS / 書き込み / 外部送信 / secret 有効性確認 禁止

import { chromium } from "playwright";
import { isUrlInScope } from "@/lib/scope";
import { maskBody } from "@/lib/mask";
import { safeJsonParse } from "@/lib/json";
import { isLikelyValidApex } from "@/lib/domain-validity";
import { makeScanCtx, createScanFinding, findExistingScanFinding } from "@/lib/scan-adapter";
import { reportSubStep } from "@/lib/scan-context";

async function fetchAnon(url: string): Promise<{ status: number; body: string; headers: Record<string, string | string[] | undefined> } | null> {
  try {
    const browser = await chromium.launch({ headless: true });
    try {
      const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
      const page = await ctx.newPage();
      const res = await page.request.fetch(url, { method: "GET", failOnStatusCode: false, timeout: 8000, maxRedirects: 2 });
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
    inScopeReason: "収集済み許可ドメイン ( 未ログイン外部観測 / Low-hanging )",
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

// === 1. HTML コメント抽出 ( TODO / FIXME / debug / admin / api key / secret ) ===
export async function runHtmlCommentExtraction(scanId: string, targetUrl: string) {
  reportSubStep("HTML コメント (TODO / debug 等) 抽出");
  const program = makeScanCtx(scanId, targetUrl);
  // Fetch target URL and extract HTML comments
  let count = 0;
  const r = await fetchAnon(targetUrl);
  if (!r || r.status !== 200) return count;
  const body = r.body;
  if (!body || body.length < 200) return count;
  if (!/<!--[\s\S]*?-->/.test(body)) return count;
  const comments = Array.from(body.matchAll(/<!--([\s\S]{1,500}?)-->/g)).map((m) => m[1].trim()).slice(0, 50);
  const sensitive = comments.filter((c) =>
    /TODO|FIXME|HACK|XXX|debug|staging|admin|internal|test\s*user|api[\s_-]?key|secret|password|token|deprecated|legacy|don['']?t\s+expose|do\s+not\s+commit/i.test(c) &&
    c.length > 5 && c.length < 400
  );
  if (sensitive.length === 0) return count;
  if (!isUrlInScope(program, targetUrl).allowed) return count;
  const sev: "medium" | "low" = sensitive.some((c) => /api[\s_-]?key|secret|password|token|don['']?t\s+expose/i.test(c)) ? "medium" : "low";
  await createNote(scanId, `HTML コメント機微情報 (${sensitive.length} 件) [${sev === "medium" ? "Medium" : "Low"}]`, targetUrl, sev,
    `${targetUrl} の HTML コメントに機微情報 / 開発メモ ${sensitive.length} 件: ${sensitive.slice(0, 3).map((c) => c.slice(0, 80)).join(" / ")}。`,
    `url=${targetUrl}, count=${sensitive.length}`,
    `1. GET ${targetUrl}\n2. HTML 中の <!-- --> から TODO / FIXME / api key 等抽出`,
    { url: targetUrl, sensitiveComments: sensitive.slice(0, 15), safetyNote: "GET 1 リクエストのみ。" });
  count++;
  return count;
}

// === 2. small public config files ===
export async function runSmallPublicConfigCheck(scanId: string, targetUrl: string) {
  reportSubStep("小規模公開 config ファイル探索");
  const program = makeScanCtx(scanId, targetUrl);
  const paths = [
    "/runtime-config.json", "/env.js", "/config.runtime.js", "/runtime.json", "/runtime.js",
    "/firebase-messaging-sw.js", "/firebase-config.js",
    "/.env.local.json", "/.env.development.json",
    "/assets/config.json", "/static/config.json", "/public/config.json",
    "/_app/config.json", "/api/config", "/api/runtime-config"
  ];
  let count = 0;
  for (const host of getHosts(program, 4)) {
    if (count >= 5) break;
    for (const p of paths) {
      if (count >= 5) break;
      const url = `https://${host}${p}`;
      if (!isUrlInScope(program, url).allowed) continue;
      const r = await fetchAnon(url);
      if (!r || r.status !== 200) continue;
      const ct = String(r.headers["content-type"] ?? "");
      if (!/json|javascript|text\/plain|application\/octet/i.test(ct)) continue;
      if (/<!DOCTYPE\s+html|<html|BssoInterrupt|Redirecting/i.test(r.body.slice(0, 500))) continue;
      if (!/(?:"apiKey"|"api_key"|"API_KEY"|"secret"|"client_secret"|"token"\s*:\s*"|"password"|"databaseURL"|"firebaseConfig"|"VAPID")/i.test(r.body)) continue;
      const sev: "high" | "medium" = /sk[_\-]live|sk_test_|firebase.*databaseURL|VAPID_PRIVATE|secret/i.test(r.body) ? "high" : "medium";
      await createNote(scanId, `Small config file 漏洩 (${p}) [${sev === "high" ? "High" : "Medium"}]`, url, sev,
        `${url} に 200 で config file が公開され、apiKey / firebase 設定 / VAPID / secret 等が含まれます。`,
        `host=${host}, path=${p}, status=${r.status}`,
        `1. GET ${url}\n2. body 内に sensitive key 含む`,
        { url, bodyPreview: r.body.slice(0, 1500), safetyNote: "GET 1 リクエストのみ。 secret の有効性確認は実施していない。" });
      count++;
    }
  }
  return count;
}

// === 3. .well-known 拡張 ( webfinger / nodeinfo / host-meta / jwks / matrix ) ===
export async function runWellKnownExtended(scanId: string, targetUrl: string) {
  reportSubStep(".well-known 拡張パス検査");
  const program = makeScanCtx(scanId, targetUrl);
  const paths = [
    { p: "/.well-known/webfinger?resource=acct:admin@", sig: /"subject"|aliases/, label: "WebFinger admin lookup" },
    { p: "/.well-known/nodeinfo", sig: /"links"|"rel":\s*"http:\/\/nodeinfo/, label: "NodeInfo discovery" },
    { p: "/.well-known/host-meta", sig: /<XRD|<Link\s+rel/, label: "host-meta XRD" },
    { p: "/.well-known/jwks.json", sig: /"keys"\s*:\s*\[/, label: "JWKS public keys" },
    { p: "/.well-known/matrix/server", sig: /"m\.server"\s*:|"m\.homeserver"/, label: "Matrix server discovery" },
    { p: "/.well-known/matrix/client", sig: /"m\.homeserver"|"base_url"/, label: "Matrix client discovery" }
  ];
  let count = 0;
  for (const host of getHosts(program, 3)) {
    if (count >= 4) break;
    for (const probe of paths) {
      if (count >= 4) break;
      const fullUrl = probe.p.includes("webfinger") ? `https://${host}${probe.p}${host}` : `https://${host}${probe.p}`;
      if (!isUrlInScope(program, fullUrl).allowed) continue;
      const r = await fetchAnon(fullUrl);
      if (!r || r.status !== 200) continue;
      if (!probe.sig.test(r.body)) continue;
      let extra = "";
      if (probe.label.includes("JWKS")) {
        try {
          const j = JSON.parse(r.body);
          const algs = (j.keys ?? []).map((k: { alg?: string }) => k.alg).filter(Boolean);
          if (algs.includes("none") || algs.includes("HS256")) extra = ` ( weak alg: ${algs.join(",")} )`;
        } catch { /* ignore */ }
      }
      await createNote(scanId, `${probe.label}${extra} [Low]`, fullUrl, "low",
        `${fullUrl} で ${probe.label} が公開${extra}。 単独では low だが内部システム特定 / Federation 経路 / JWT 偽造の hint。`,
        `host=${host}, path=${probe.p}`,
        `1. GET ${fullUrl}`,
        { url: fullUrl, bodyPreview: r.body.slice(0, 800), safetyNote: "GET 1 リクエストのみ。" });
      count++;
    }
  }
  return count;
}

// === 4. legacy policy files ( crossdomain / clientaccesspolicy ) ===
export async function runLegacyPolicyFiles(scanId: string, targetUrl: string) {
  reportSubStep("レガシー policy ファイル確認");
  const program = makeScanCtx(scanId, targetUrl);
  let count = 0;
  for (const host of getHosts(program, 4)) {
    if (count >= 3) break;
    for (const p of ["/crossdomain.xml", "/clientaccesspolicy.xml"]) {
      if (count >= 3) break;
      const url = `https://${host}${p}`;
      if (!isUrlInScope(program, url).allowed) continue;
      const r = await fetchAnon(url);
      if (!r || r.status !== 200) continue;
      if (!/<cross-domain-policy|<access-policy/i.test(r.body)) continue;
      const wildcard = /<allow-access-from\s+domain="\*"|<domain\s+uri="\*"/i.test(r.body);
      const sev: "medium" | "low" = wildcard ? "medium" : "low";
      await createNote(scanId, `Legacy policy ${p}${wildcard ? " ( wildcard 許可 )" : ""} [${sev === "medium" ? "Medium" : "Low"}]`, url, sev,
        `${url} に legacy policy 公開${wildcard ? " ★ wildcard ( allow-access-from domain=\"*\" ) で全 origin に Flash/SL からアクセス許可 = ブラウザは古いが SWF 残ってると CSRF/credential 漏洩リスク" : ""}。`,
        `host=${host}, path=${p}, wildcard=${wildcard}`,
        `1. GET ${url}`,
        { url, wildcard, bodyPreview: r.body.slice(0, 1000), safetyNote: "GET 1 リクエストのみ。" });
      count++;
    }
  }
  return count;
}

// === 5. RSS/Atom/feed から非公開っぽい URL 抽出 ===
export async function runRssFeedMining(scanId: string, targetUrl: string) {
  reportSubStep("RSS / Atom フィード解析");
  const program = makeScanCtx(scanId, targetUrl);
  const paths = ["/feed", "/rss", "/atom.xml", "/feed.xml", "/rss.xml", "/feed/", "/feed/atom", "/index.xml", "/blog/feed"];
  let count = 0;
  for (const host of getHosts(program, 3)) {
    if (count >= 2) break;
    for (const p of paths) {
      if (count >= 2) break;
      const url = `https://${host}${p}`;
      if (!isUrlInScope(program, url).allowed) continue;
      const r = await fetchAnon(url);
      if (!r || r.status !== 200) continue;
      if (!/<rss|<feed\s|<channel>|<entry>/i.test(r.body)) continue;
      const links = Array.from(r.body.matchAll(/<link[^>]*>([^<]+)<\/link>|<link\s+href="([^"]+)"/gi)).map((m) => m[1] || m[2]).filter(Boolean);
      const sensitive = links.filter((l) => /(?:admin|preview|draft|internal|staging|password-reset|invite|share)/i.test(l));
      if (sensitive.length === 0) continue;
      await createNote(scanId, `RSS/Atom feed から sensitive URL ${sensitive.length} 件 [Low]`, url, "low",
        `${url} の feed から非公開系 URL ${sensitive.length} 件: ${sensitive.slice(0, 3).join(", ")}。 後段で個別 GET 確認推奨。`,
        `url=${url}, count=${sensitive.length}`,
        `1. GET ${url}\n2. <link> タグから抽出`,
        { url, sensitiveLinks: sensitive.slice(0, 15), safetyNote: "GET 1 リクエストのみ。" });
      count++;
    }
  }
  return count;
}

// === 6. CSP report-uri から内部 URL / Sentry / staging URL 抽出 ===
export async function runCspReportUriMining(scanId: string, targetUrl: string) {
  reportSubStep("CSP report-uri 採掘");
  const program = makeScanCtx(scanId, targetUrl);
  let count = 0;
  for (const host of getHosts(program, 3)) {
    if (count >= 2) break;
    const r = await fetchAnon(`https://${host}/`);
    if (!r) continue;
    const csp = (Array.isArray(r.headers["content-security-policy"]) ? r.headers["content-security-policy"].join(",") : r.headers["content-security-policy"]) ?? "";
    const reportUri = csp.match(/report-uri\s+(\S+)/i)?.[1];
    if (!reportUri) continue;
    let info = "";
    if (/staging|dev|sandbox|internal/i.test(reportUri)) info = "staging/internal host";
    else if (/sentry\.io|ingest\.sentry/i.test(reportUri)) info = "Sentry";
    else if (/[a-z0-9-]+\.(?:internal|local|cluster|svc|corp)/i.test(reportUri)) info = "internal-tld";
    if (!info) continue;
    await createNote(scanId, `CSP report-uri から ${info} 漏洩 [Low]`, `https://${host}/`, "low",
      `${host} の CSP report-uri ( ${reportUri} ) から ${info} を確認。 内部システム / monitoring 構成の hint。`,
      `host=${host}, reportUri=${reportUri}, infoType=${info}`,
      `1. GET https://${host}/\n2. CSP header の report-uri 抽出`,
      { host, reportUri, infoType: info, safetyNote: "GET 1 リクエストのみ。 report 送信は実施していない。" });
    count++;
  }
  return count;
}

// === 7. sourceMappingURL コメント解析 + 外部 source map 確認 ===
export async function runSourcemapCommentCheck(scanId: string, targetUrl: string) {
  reportSubStep("ソースマップコメント検出");
  const program = makeScanCtx(scanId, targetUrl);
  // Fetch main page to get JS URLs
  let count = 0;
  const mainPage = await fetchAnon(targetUrl);
  if (!mainPage) return count;
  const jsSrcs = Array.from(mainPage.body.matchAll(/src=["']([^"']+\.(?:js|mjs))["']/gi)).map((m) => m[1]);
  const tested = new Set<string>();
  for (const src of jsSrcs.slice(0, 10)) {
    if (count >= 3) break;
    const jsUrl = src.startsWith("http") ? src : `${new URL(targetUrl).origin}${src.startsWith("/") ? src : "/" + src}`;
    if (!isUrlInScope(program, jsUrl).allowed) continue;
    if (tested.has(jsUrl)) continue;
    tested.add(jsUrl);
    const t = await fetchAnon(jsUrl);
    if (!t || t.status !== 200) continue;
    const body = t.body;
    if (!body) continue;
    const m = body.match(/\/[\/\*]#\s*sourceMappingURL\s*=\s*([^\s\*\n]+)/i);
    if (!m) continue;
    let mapUrl = m[1];
    if (!/^https?:/i.test(mapUrl)) {
      try { mapUrl = new URL(mapUrl, jsUrl).toString(); } catch { continue; }
    }
    if (!isUrlInScope(program, mapUrl).allowed) continue;
    const r = await fetchAnon(mapUrl);
    if (!r || r.status !== 200) continue;
    if (!/"version"\s*:\s*3|"sources"\s*:\s*\[/i.test(r.body)) continue;
    const sources = Array.from((r.body.match(/"sources"\s*:\s*\[([^\]]+)\]/i)?.[1] ?? "").matchAll(/"([^"]+)"/g)).map((s) => s[1]).slice(0, 30);
    const internalPaths = sources.filter((s) => /(?:webpack:\/\/|\.\.\/\.\.\/|\/Users\/|C:\\|\/home\/|\/builds\/)/i.test(s));
    await createNote(scanId, `Source map 公開 (${internalPaths.length} 内部 path) [Medium]`, mapUrl, "medium",
      `${mapUrl} で source map が公開され、 元コード復元可能 ${internalPaths.length} 個の内部 path が漏洩。 商用コード露出 + 内部 path 開示。`,
      `jsUrl=${jsUrl}, mapUrl=${mapUrl}, internalPaths=${internalPaths.length}`,
      `1. GET ${jsUrl} → sourceMappingURL コメント\n2. GET ${mapUrl} → source map\n3. sources field から元 path 復元`,
      { jsUrl, mapUrl, sources: sources.slice(0, 15), internalPaths, safetyNote: "GET 2 リクエストのみ。 元コード再構築は実施していない。" });
    count++;
  }
  return count;
}

// === 8. public CMS REST 軽量確認 ( Ghost / Strapi / Directus ) ===
export async function runPublicCmsRestCheck(scanId: string, targetUrl: string) {
  reportSubStep("WordPress / CMS REST API 確認");
  const program = makeScanCtx(scanId, targetUrl);
  const probes = [
    { p: "/ghost/api/v3/content/settings/?key=", sig: /"settings"\s*:|"site_title"/i, label: "Ghost content/settings ( public API )", sev: "low" as const },
    { p: "/ghost/api/v3/content/posts/?key=", sig: /"posts"\s*:\s*\[|"title"/i, label: "Ghost content/posts API", sev: "low" as const },
    { p: "/api/users", sig: /"data":\s*\[/, label: "Strapi /api/users public", sev: "high" as const },
    { p: "/api/articles", sig: /"data":\s*\[.*"attributes"/, label: "Strapi /api/articles public", sev: "low" as const },
    { p: "/users", sig: /"data":\s*\[.*"id"/, label: "Directus /users public", sev: "high" as const },
    { p: "/items/", sig: /"data":\s*\[/, label: "Directus /items public", sev: "medium" as const }
  ];
  let count = 0;
  for (const host of getHosts(program, 3)) {
    if (count >= 4) break;
    for (const probe of probes) {
      if (count >= 4) break;
      const url = `https://${host}${probe.p}`;
      if (!isUrlInScope(program, url).allowed) continue;
      const r = await fetchAnon(url);
      if (!r || r.status !== 200) continue;
      if (!probe.sig.test(r.body)) continue;
      await createNote(scanId, `${probe.label} 公開 [${probe.sev === "high" ? "High" : probe.sev === "medium" ? "Medium" : "Low"}]`, url, probe.sev,
        `${url} で ${probe.label} に匿名アクセス成功。 Ghost public API は仕様だが、 Strapi / Directus の users 公開は設定ミス。`,
        `host=${host}, path=${probe.p}, status=200`,
        `1. GET ${url}`,
        { url, bodyPreview: r.body.slice(0, 1000), safetyNote: "GET 1 リクエストのみ。" });
      count++;
    }
  }
  return count;
}

// === 9. GraphQL Playground / GraphiQL / Altair UI 検出 ===
export async function runGraphqlUiDetection(scanId: string, targetUrl: string) {
  reportSubStep("GraphQL Playground / UI 検出");
  const program = makeScanCtx(scanId, targetUrl);
  const paths = ["/graphql", "/graphiql", "/playground", "/altair", "/__graphql", "/api/graphql", "/v1/graphql"];
  let count = 0;
  for (const host of getHosts(program, 3)) {
    if (count >= 3) break;
    for (const p of paths) {
      if (count >= 3) break;
      const url = `https://${host}${p}`;
      if (!isUrlInScope(program, url).allowed) continue;
      const r = await fetchAnon(url);
      if (!r || r.status !== 200) continue;
      const ui = /<title>GraphiQL/i.test(r.body) ? "GraphiQL" :
                 /<title>(?:GraphQL )?Playground|prisma-playground/i.test(r.body) ? "Apollo/Prisma Playground" :
                 /<title>Altair|altair-app/i.test(r.body) ? "Altair" : null;
      if (!ui) continue;
      await createNote(scanId, `GraphQL ${ui} UI 公開 [Medium]`, url, "medium",
        `${url} で GraphQL ${ui} ( Web IDE ) が公開。 任意 query / mutation を匿名で実行可能 = データ漏洩 + DoS リスク。`,
        `host=${host}, path=${p}, ui=${ui}`,
        `1. GET ${url}`,
        { url, ui, safetyNote: "GET 1 リクエストのみ。 query 実行は別途。" });
      count++;
    }
  }
  return count;
}

// === 10. URL token format review ===
export async function runUrlTokenFormatReview(scanId: string, targetUrl: string) {
  reportSubStep("URL token 形式レビュー");
  const program = makeScanCtx(scanId, targetUrl);
  void program;
  // This check analyzes URL token format from the target URL itself
  const tokens: Array<{ name: string; value: string }> = [];
  const matches = Array.from(targetUrl.matchAll(/[?&](reset|token|invite|code|verify|confirm|activation|unsubscribe)[_-]?\w*=([A-Za-z0-9_\-.]{6,200})/gi));
  for (const m of matches) tokens.push({ name: m[1], value: m[2] });
  if (tokens.length < 1) return 0;
  const issues: string[] = [];
  const jwtTokens = tokens.filter((t) => /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(t.value));
  if (jwtTokens.length > 0) {
    for (const jt of jwtTokens.slice(0, 3)) {
      try {
        const parts = jt.value.split(".");
        const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
        if (!payload.exp) issues.push(`${jt.name} JWT exp 無し ( 永久有効 )`);
        else if (payload.exp - (payload.iat ?? 0) > 30 * 24 * 3600) issues.push(`${jt.name} JWT 有効期限 30 日超`);
      } catch { /* ignore */ }
    }
  }
  const shortTokens = tokens.filter((t) => t.value.length < 12 && !/^\d+$/.test(t.value));
  if (shortTokens.length >= 2) issues.push(`${shortTokens.length} 件 token が 12 文字未満 ( brute force 余地 )`);
  if (issues.length === 0) return 0;
  await createNote(scanId, `URL token 形式弱点 (${issues.length} 件) [Low]`, "(token format)", "low",
    `URL 内 token の形式分析: ${issues.join(" / ")}。 brute force は実施していない ( 形式観察のみ )。`,
    `tokenSampleCount=${tokens.length}, jwtCount=${jwtTokens.length}, issues=${issues.length}`,
    `1. 既存 URL から URL token 抽出\n2. 形式分析 ( JWT exp / 長さ / entropy )`,
    { tokenSamples: tokens.slice(0, 8).map((t) => ({ name: t.name, valuePreview: t.value.slice(0, 16) + "..." })), issues, safetyNote: "観察のみ。 brute force / 値の有効性確認禁止。" });
  return 1;
}

// === 11. favicon hash + meta generator fingerprint ===
export async function runFaviconAndMetaFingerprint(scanId: string, targetUrl: string) {
  reportSubStep("favicon ハッシュフィンガープリント");
  const program = makeScanCtx(scanId, targetUrl);
  let count = 0;
  for (const host of getHosts(program, 3)) {
    if (count >= 2) break;
    const r = await fetchAnon(`https://${host}/`);
    if (!r) continue;
    const generator = r.body.match(/<meta\s+name=["']?generator["']?\s+content=["']?([^"'<>]+)/i)?.[1];
    const faviconUrl = r.body.match(/<link\s+[^>]*rel=["']?(?:shortcut\s+)?icon["']?[^>]*href=["']([^"']+)["']/i)?.[1] ?? "/favicon.ico";
    let favHash: string | null = null;
    try {
      const fav = await fetchAnon(faviconUrl.startsWith("http") ? faviconUrl : `https://${host}${faviconUrl.startsWith("/") ? faviconUrl : "/" + faviconUrl}`);
      if (fav && fav.status === 200 && fav.body.length > 50) {
        favHash = `${fav.body.length}b/${fav.body.charCodeAt(0)}-${fav.body.charCodeAt(fav.body.length - 1)}`;
      }
    } catch { /* ignore */ }
    if (!generator && !favHash) continue;
    await createNote(scanId, `Fingerprint: ${generator ?? "favicon"} [Low]`, `https://${host}/`, "low",
      `${host} の technology fingerprint:${generator ? ` generator="${generator}"` : ""}${favHash ? ` favicon=${favHash}` : ""}。 既知 admin panel / SaaS テンプレートの照合に利用。`,
      `host=${host}, generator=${generator}, favHash=${favHash}`,
      `1. GET https://${host}/ → meta generator\n2. GET ${faviconUrl} → favicon hash`,
      { host, generator, favHash, safetyNote: "GET 2 リクエストのみ。" });
    count++;
  }
  return count;
}

// === 12. Wayback / archive 取り込み ( 古い JS / OpenAPI / admin path ) ===
export async function runWaybackImport(scanId: string, targetUrl: string) {
  reportSubStep("Wayback Machine 履歴 import");
  const program = makeScanCtx(scanId, targetUrl);
  let count = 0;
  for (const host of getHosts(program, 2)) {
    if (count >= 1) break;
    try {
      const cdxUrl = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(host)}/*&output=json&limit=200&filter=statuscode:200&fl=original`;
      const res = await fetch(cdxUrl, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) continue;
      const data = await res.json() as string[][];
      const urls = data.slice(1).map((row) => row[0]).filter((u) => /^https?:\/\//i.test(u));
      const sensitive = urls.filter((u) => /(?:admin|invoice|debug|internal|staging|api[\/_-]?(?:v\d+|admin|internal)|backup|\.env|\.git|swagger|graphql|playground|jenkins)/i.test(u));
      if (sensitive.length === 0) continue;
      const uniq = Array.from(new Set(sensitive)).slice(0, 20);
      await createNote(scanId, `Wayback Machine 古い sensitive URL ${uniq.length} 件 [Low]`, host, "low",
        `Wayback Machine ( web.archive.org ) で ${host} の過去 URL から sensitive 系 ${uniq.length} 件: ${uniq.slice(0, 3).join(", ")}。 現在は 404 でも残存してる可能性 → 個別 GET 確認推奨。`,
        `host=${host}, sensitiveCount=${uniq.length}`,
        `1. https://web.archive.org/cdx/search/cdx?url=${host}/* で過去 URL 取得\n2. admin/internal 系のみフィルタ\n3. 各 URL を現在の host で GET して残存確認`,
        { host, sensitiveUrls: uniq, safetyNote: "Wayback CDX への GET 1 回のみ。 個別 URL の現在状態確認は別モジュール。" });
      count++;
    } catch { /* ignore */ }
  }
  return count;
}

// === 13. CDN old asset leakage ===
export async function runCdnOldAssetLeakage(scanId: string, targetUrl: string) {
  reportSubStep("CDN 古いアセット漏洩確認");
  const program = makeScanCtx(scanId, targetUrl);
  const mainPage = await fetchAnon(targetUrl);
  if (!mainPage) return 0;
  let count = 0;
  const jsSrcs = Array.from(mainPage.body.matchAll(/src=["']([^"']+\.(?:js|mjs))["']/gi)).map((m) => m[1]);
  for (const src of jsSrcs.slice(0, 10)) {
    if (count >= 3) break;
    const jsUrl = src.startsWith("http") ? src : `${new URL(targetUrl).origin}${src.startsWith("/") ? src : "/" + src}`;
    if (!isUrlInScope(program, jsUrl).allowed) continue;
    const m = jsUrl.match(/^(.+\.)([a-f0-9]{6,12})(\..+)$/);
    if (!m) continue;
    const variants: string[] = [];
    for (const c of ["0", "a", "f"]) {
      const newHash = m[2].slice(0, -1) + c;
      if (newHash === m[2]) continue;
      variants.push(`${m[1]}${newHash}${m[3]}`);
    }
    for (const v of variants.slice(0, 3)) {
      const r = await fetchAnon(v);
      if (r && r.status === 200 && r.body.length > 100) {
        if (/(?:apiKey|secret|token|api_key|API_KEY|sk_live|AIza[A-Za-z0-9_-]{30})/i.test(r.body)) {
          await createNote(scanId, `古い CDN asset から secret 漏洩 [Medium]`, v, "medium",
            `${v} ( hash 1 文字違いで取得した古い bundle ) に secret / API key 痕跡。 古い bundle が CDN に残ったままで、現行版から削除した secret も漏洩。`,
            `oldUrl=${v}, currentUrl=${jsUrl}`,
            `1. ${jsUrl} の hash 部分を 1 文字書き換えで GET\n2. 古い bundle 取得 → secret 抽出`,
            { oldUrl: v, currentUrl: jsUrl, bodyPreview: r.body.slice(0, 800), safetyNote: "GET 3 リクエストのみ ( hash 1 文字違い 3 種 )。 brute force 禁止。" });
          count++;
          break;
        }
      }
    }
  }
  return count;
}

/** scan-runner.ts から呼ばれる統合エントリポイント */
export async function runExternalLowHangingChecks(scanId: string, targetUrl: string): Promise<void> {
  await Promise.allSettled([
    runHtmlCommentExtraction(scanId, targetUrl),
    runSmallPublicConfigCheck(scanId, targetUrl),
    runWellKnownExtended(scanId, targetUrl),
    runLegacyPolicyFiles(scanId, targetUrl),
    runRssFeedMining(scanId, targetUrl),
    runCspReportUriMining(scanId, targetUrl),
    runSourcemapCommentCheck(scanId, targetUrl),
    runPublicCmsRestCheck(scanId, targetUrl),
    runGraphqlUiDetection(scanId, targetUrl),
    runUrlTokenFormatReview(scanId, targetUrl),
    runFaviconAndMetaFingerprint(scanId, targetUrl),
    runWaybackImport(scanId, targetUrl),
    runCdnOldAssetLeakage(scanId, targetUrl),
  ]);
}
