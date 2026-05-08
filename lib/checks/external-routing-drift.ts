// 未ログイン外部観測 / HTTP negotiation / routing drift / metadata leak 系 10 機能
// 制約: GET/HEAD/OPTIONS のみ。 brute force / traversal でのファイル取得 / 大容量 DL 禁止
// 強い証拠のみ Finding 化、 弱いものは severity=low + recommendedAction=monitor

import { chromium } from "playwright";
import { isUrlInScope } from "@/lib/scope";
import { maskBody } from "@/lib/mask";
import { safeJsonParse } from "@/lib/json";
import { makeScanCtx, createScanFinding, findExistingScanFinding } from "@/lib/scan-adapter";
import { isLikelyValidApex } from "@/lib/domain-validity";

async function fetchWith(url: string, opts: { method?: "GET" | "HEAD" | "OPTIONS"; headers?: Record<string, string>; redirect?: "manual" | "follow" } = {}): Promise<{ status: number; body: string; headers: Record<string, string | string[] | undefined>; ms: number } | null> {
  const t0 = Date.now();
  try {
    const browser = await chromium.launch({ headless: true });
    try {
      const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
      const page = await ctx.newPage();
      const res = await page.request.fetch(url, { method: opts.method ?? "GET", headers: opts.headers ?? {}, failOnStatusCode: false, timeout: 8000, maxRedirects: opts.redirect === "manual" ? 0 : 2 });
      const body = await res.text().catch(() => "");
      const headers = res.headers();
      await ctx.close();
      return { status: res.status(), body: body.slice(0, 8000), headers, ms: Date.now() - t0 };
    } finally { await browser.close().catch(() => undefined); }
  } catch { return null; }
}

async function createNote(scanId: string, type: string, target: string, severity: "high" | "medium" | "low", impact: string, evidence: string, repro: string, payload: object, action: "report_now" | "manual_verify" | "monitor" = "monitor") {
  const existing = await findExistingScanFinding(scanId, type, target);
  if (existing) return null;
  await createScanFinding(scanId, {
    type, target, severity, impact,
    inScopeReason: "収集済み許可ドメイン ( routing drift / negotiation )",
    evidence,
    requestResponseDiff: maskBody("application/json", JSON.stringify(payload, null, 2)),
    reproductionSteps: repro,
    aiWorthSending: severity === "high" ? "報告候補。" : severity === "medium" ? "影響範囲確認後判断。" : "弱い証拠 ( monitor )。",
    bountyLikelihood: severity === "high" ? "high" : severity === "medium" ? "medium" : "low",
    recommendedAction: action
  });
  return true;
}

function getHosts(program: { allowedDomains: string }, targetUrl: string, max = 6): string[] {
  const allowed = safeJsonParse<string[]>(program.allowedDomains, []);
  const hosts = [...new Set(allowed.map((d) => d.replace(/^\*\./, "").replace(/^https?:\/\//, "").split("/")[0]).filter(isLikelyValidApex))].slice(0, max);
  try { hosts.unshift(new URL(targetUrl).host); } catch { /* ignore */ }
  return [...new Set(hosts)].slice(0, max);
}

async function getCandidateGetUrls(program: Parameters<typeof isUrlInScope>[0], targetUrl: string, max = 6): Promise<string[]> {
  const out = new Set<string>();
  // Fetch main page and extract internal links
  try {
    const browser = await chromium.launch({ headless: true });
    try {
      const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
      const page = await ctx.newPage();
      const res = await page.request.fetch(targetUrl, { method: "GET", failOnStatusCode: false, timeout: 12000 });
      const htmlBody = await res.text().catch(() => "");
      const baseUrl = new URL(targetUrl);
      const hrefMatches = htmlBody.matchAll(/href=["']([^"'#?]+)["']/gi);
      for (const m of hrefMatches) {
        const href = m[1];
        try {
          const u = href.startsWith("http") ? new URL(href) : new URL(href, baseUrl.origin);
          if (u.pathname === "/" || u.pathname === "") continue;
          if (!isUrlInScope(program, u.toString()).allowed) continue;
          out.add(u.origin + u.pathname);
          if (out.size >= max) break;
        } catch { /* ignore */ }
      }
      await ctx.close();
    } finally { await browser.close().catch(() => undefined); }
  } catch { /* ignore */ }
  // If not enough, add common paths
  try {
    const base = new URL(targetUrl);
    for (const p of ["/api", "/api/v1", "/dashboard", "/profile", "/settings", "/admin"]) {
      if (out.size >= max) break;
      const u = `${base.origin}${p}`;
      if (isUrlInScope(program, u).allowed) out.add(u);
    }
  } catch { /* ignore */ }
  return [...out].slice(0, max);
}

// === 1. Region / Accept-Language response drift ===
export async function runAcceptLanguageDrift(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  let count = 0;
  for (const url of (await getCandidateGetUrls(program, targetUrl, 4)).slice(0, 4)) {
    if (count >= 2) break;
    const en = await fetchWith(url, { headers: { "Accept-Language": "en-US,en;q=0.9" } });
    const ja = await fetchWith(url, { headers: { "Accept-Language": "ja-JP,ja;q=0.9" } });
    const ru = await fetchWith(url, { headers: { "Accept-Language": "ru-RU,ru;q=0.9" } });
    if (!en || !ja || !ru) continue;
    const statuses = [en.status, ja.status, ru.status];
    const uniqStatus = [...new Set(statuses)];
    const sizes = [en.body.length, ja.body.length, ru.body.length];
    const sizeDiff = Math.max(...sizes) - Math.min(...sizes);
    const issues: string[] = [];
    if (uniqStatus.length > 1) issues.push(`status drift: en=${en.status}, ja=${ja.status}, ru=${ru.status}`);
    if (sizeDiff > 2000 && sizes.every((s) => s > 0)) issues.push(`body size drift: en=${en.body.length}, ja=${ja.body.length}, ru=${ru.body.length}`);
    if (issues.length === 0) continue;
    await createNote(scanId, `Accept-Language response drift [Low]`, url, "low",
      `${url} で Accept-Language の値によりレスポンスが drift: ${issues.join(" / ")}。 region 別の表示制御 / 機能差 / コンテンツ漏洩の hint。`,
      `url=${url}, issues=${issues.length}`,
      `1. GET ${url} ( Accept-Language: en-US )\n2. GET ${url} ( Accept-Language: ja-JP )\n3. GET ${url} ( Accept-Language: ru-RU )`,
      { url, en: { status: en.status, size: en.body.length }, ja: { status: ja.status, size: ja.body.length }, ru: { status: ru.status, size: ru.body.length }, issues, safetyNote: "GET 3 リクエストのみ。" });
    count++;
  }
  return count;
}

// === 2. Accept: application/json content negotiation leak ===
export async function runAcceptJsonNegotiation(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  let count = 0;
  for (const url of (await getCandidateGetUrls(program, targetUrl, 6)).slice(0, 6)) {
    if (count >= 3) break;
    const html = await fetchWith(url, { headers: { Accept: "text/html" } });
    const json = await fetchWith(url, { headers: { Accept: "application/json" } });
    if (!html || !json) continue;
    if (html.status !== 200 || json.status !== 200) continue;
    const htmlIsHtml = /text\/html/i.test(String(html.headers["content-type"] ?? ""));
    const jsonIsJson = /application\/json/i.test(String(json.headers["content-type"] ?? ""));
    if (!htmlIsHtml || !jsonIsJson) continue;
    if (!/(?:email|user|api[_-]?key|token|invoice|order|admin|role|secret)/i.test(json.body.slice(0, 500))) continue;
    const sev: "high" | "medium" = /api[_-]?key|secret|token|password/i.test(json.body.slice(0, 1000)) ? "high" : "medium";
    await createNote(scanId, `Content negotiation で JSON API 漏洩 [${sev === "high" ? "High" : "Medium"}]`, url, sev,
      `${url} に Accept: text/html だと HTML、 Accept: application/json だと JSON ( 機密 keyword 含む ) を返却。 同一 URL でも HTML レンダリングと API 応答の認可要件が違うことがあり、 攻撃者は API 形式で認証回避 / データ取得を狙える。`,
      `url=${url}, sev=${sev}`,
      `1. curl -H 'Accept: text/html' ${url} → HTML\n2. curl -H 'Accept: application/json' ${url} → JSON ( 機密 )`,
      { url, htmlStatus: html.status, jsonStatus: json.status, jsonBodyPreview: json.body.slice(0, 800), safetyNote: "GET 2 リクエストのみ。" });
    count++;
  }
  return count;
}

// === 3. Extension negotiation .json / .xml / .txt for known public routes ===
export async function runExtensionNegotiation(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  let count = 0;
  for (const url of (await getCandidateGetUrls(program, targetUrl, 6)).slice(0, 6)) {
    if (count >= 3) break;
    const u = new URL(url);
    if (/\.[a-z]{2,5}$/i.test(u.pathname)) continue;
    for (const ext of [".json", ".xml", ".txt"]) {
      if (count >= 3) break;
      const probeUrl = u.origin + u.pathname + ext;
      const r = await fetchWith(probeUrl);
      if (!r || r.status !== 200) continue;
      if (r.body.length < 50) continue;
      const ct = String(r.headers["content-type"] ?? "");
      const looksValid = (ext === ".json" && /^\s*[\[{]/.test(r.body) && /json/i.test(ct))
                      || (ext === ".xml" && /^\s*<\?xml|^\s*</.test(r.body) && /xml/i.test(ct))
                      || (ext === ".txt" && /text\/plain/i.test(ct));
      if (!looksValid) continue;
      const sev: "medium" | "low" = /(?:email|user|admin|api[_-]?key|token|invoice|secret)/i.test(r.body.slice(0, 1500)) ? "medium" : "low";
      await createNote(scanId, `Extension negotiation: ${ext} 公開 [${sev === "medium" ? "Medium" : "Low"}]`, probeUrl, sev,
        `${url} に拡張子 ${ext} を付けたところ ${ct} で 200 返却。 内部経路で content negotiation が有効、 別 representation が anonymous で取得可能。${sev === "medium" ? " 機密 keyword 含む。" : ""}`,
        `originalUrl=${url}, probeUrl=${probeUrl}, contentType=${ct}`,
        `1. curl ${url} → 通常 HTML\n2. curl ${probeUrl} → ${ext} 形式で別 representation`,
        { originalUrl: url, probeUrl, contentType: ct, bodyPreview: r.body.slice(0, 800), safetyNote: "GET 1 リクエストのみ。" });
      count++;
      break;
    }
  }
  return count;
}

// === 4. Trailing slash and case-sensitivity route drift ===
export async function runTrailingSlashCaseDrift(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  let count = 0;
  for (const url of (await getCandidateGetUrls(program, targetUrl, 4)).slice(0, 4)) {
    if (count >= 2) break;
    const u = new URL(url);
    const base = await fetchWith(url);
    if (!base || base.status !== 200) continue;
    const altSlashPath = u.pathname.endsWith("/") ? u.pathname.replace(/\/$/, "") : u.pathname + "/";
    const altSlash = await fetchWith(u.origin + altSlashPath);
    const altCase = u.pathname.toUpperCase() !== u.pathname ? u.pathname.toUpperCase() : u.pathname.toLowerCase();
    const altCaseRes = altCase === u.pathname ? null : await fetchWith(u.origin + altCase);
    const issues: string[] = [];
    if (altSlash && altSlash.status === 200 && Math.abs(altSlash.body.length - base.body.length) > 500) {
      issues.push(`trailing slash drift: original=${base.body.length}B, alt=${altSlash.body.length}B`);
    }
    if (altCaseRes && altCaseRes.status === 200 && Math.abs(altCaseRes.body.length - base.body.length) > 500) {
      issues.push(`case-sensitivity drift: original=${base.body.length}B, altCase=${altCaseRes.body.length}B`);
    }
    if (issues.length === 0) continue;
    await createNote(scanId, `Trailing slash / case-sensitivity route drift [Low]`, url, "low",
      `${url} で trailing slash / 大小文字違い による応答 drift: ${issues.join(" / ")}。 routing 層と auth 層のミスマッチで認可 bypass 経路の hint。`,
      `url=${url}, issues=${issues.length}`,
      `1. GET ${url}\n2. GET ${u.origin + altSlashPath}\n${altCaseRes ? `3. GET ${u.origin + altCase}` : ""}`,
      { url, baseSize: base.body.length, altSlashSize: altSlash?.body.length, altCaseSize: altCaseRes?.body.length, issues, safetyNote: "GET 2-3 リクエストのみ。" });
    count++;
  }
  return count;
}

// === 5. Semicolon path parameter drift ===
export async function runSemicolonPathDrift(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  let count = 0;
  for (const url of (await getCandidateGetUrls(program, targetUrl, 3)).slice(0, 3)) {
    if (count >= 2) break;
    const u = new URL(url);
    const base = await fetchWith(url);
    if (!base || base.status !== 200) continue;
    const probeUrl = u.origin + u.pathname + ";jsessionid=bbprobe123" + u.search;
    const probe = await fetchWith(probeUrl);
    if (!probe || probe.status !== 200) continue;
    if (Math.abs(probe.body.length - base.body.length) < 200) continue;
    await createNote(scanId, `Semicolon path parameter routing drift [Low]`, url, "low",
      `${url} に ;jsessionid=xxx を追加したところ応答が drift ( base=${base.body.length}B, probe=${probe.body.length}B )。 Tomcat / Spring / Jetty 系で path 解釈が違うと auth bypass 経路。`,
      `url=${url}, baseSize=${base.body.length}, probeSize=${probe.body.length}`,
      `1. GET ${url}\n2. GET ${probeUrl}`,
      { url, probeUrl, sizeDiff: Math.abs(probe.body.length - base.body.length), safetyNote: "GET 2 リクエストのみ。" });
    count++;
  }
  return count;
}

// === 6. Path normalization drift ( ../ / %2e%2e / // ) ===
export async function runPathNormalizationDrift(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  let count = 0;
  for (const url of (await getCandidateGetUrls(program, targetUrl, 3)).slice(0, 3)) {
    if (count >= 2) break;
    const u = new URL(url);
    if (!/\/[a-z0-9]+\/[a-z0-9]+/i.test(u.pathname)) continue;
    const base = await fetchWith(url);
    if (!base || base.status !== 200) continue;
    const probes = [
      u.pathname.replace(/^\/([^\/]+)\//, "/$1/./"),
      u.pathname.replace(/^\/([^\/]+)\//, "/$1//"),
      u.pathname.replace(/^\/([^\/]+)\//, "/$1/foo/../")
    ].filter((p) => p !== u.pathname);
    const issues: string[] = [];
    for (const p of probes) {
      const probe = await fetchWith(u.origin + p + u.search);
      if (!probe) continue;
      if (probe.status === 200 && Math.abs(probe.body.length - base.body.length) > 500) {
        issues.push(`${p}: status=${probe.status}, size=${probe.body.length} ( base=${base.body.length} )`);
      }
      if (probe.status !== base.status) issues.push(`${p}: status drift ${base.status} → ${probe.status}`);
    }
    if (issues.length === 0) continue;
    await createNote(scanId, `Path normalization drift [Low]`, url, "low",
      `${url} で path 正規化のミスマッチ: ${issues.join(" / ")}。 reverse proxy ( CDN / nginx ) と origin で path 解釈が違うと認可 bypass / cache poisoning の経路。`,
      `url=${url}, driftCount=${issues.length}`,
      `1. GET ${url} ( base )\n2. ${probes.map((p) => `GET ${u.origin + p}`).join("\n3. ")}`,
      { url, issues, safetyNote: "../ 系の試行は同階層同等の path のみ ( 上位 traversal でファイル取得はしない )。 GET 4 リクエストまで。" });
    count++;
  }
  return count;
}

// === 7. Encoded slash routing drift ( %2F handling mismatch ) ===
export async function runEncodedSlashDrift(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  let count = 0;
  for (const url of (await getCandidateGetUrls(program, targetUrl, 3)).slice(0, 3)) {
    if (count >= 2) break;
    const u = new URL(url);
    if (!/\/[a-z0-9]+\/[a-z0-9]+/i.test(u.pathname)) continue;
    const base = await fetchWith(url);
    if (!base || base.status !== 200) continue;
    const probePath = u.pathname.replace(/^\/([^\/]+)\//, "/$1%2F");
    const probe = await fetchWith(u.origin + probePath + u.search);
    if (!probe) continue;
    if (probe.status === base.status && Math.abs(probe.body.length - base.body.length) < 200) continue;
    await createNote(scanId, `Encoded slash %2F routing drift [Low]`, url, "low",
      `${url} で %2F 処理のミスマッチ: base=${base.status} (${base.body.length}B), %2F=${probe.status} (${probe.body.length}B)。 nginx と origin / CDN と origin で encoded slash の処理が違うと認可 bypass / SSRF / WAF bypass 経路。`,
      `url=${url}, baseStatus=${base.status}, probeStatus=${probe.status}`,
      `1. GET ${url}\n2. GET ${u.origin + probePath}`,
      { url, baseStatus: base.status, baseSize: base.body.length, probeStatus: probe.status, probeSize: probe.body.length, safetyNote: "GET 2 リクエストのみ。" });
    count++;
  }
  return count;
}

// === 8. HEAD vs GET status inconsistency ===
export async function runHeadVsGetInconsistency(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  let count = 0;
  for (const url of (await getCandidateGetUrls(program, targetUrl, 6)).slice(0, 6)) {
    if (count >= 3) break;
    const get = await fetchWith(url, { method: "GET" });
    const head = await fetchWith(url, { method: "HEAD" });
    if (!get || !head) continue;
    if (get.status >= 400 && head.status === 200) {
      await createNote(scanId, `HEAD vs GET inconsistency ( HEAD bypasses GET 4xx ) [Medium]`, url, "medium",
        `${url} で GET=${get.status} ( 拒否 ) だが HEAD=${head.status} で通る。 WAF / auth middleware が GET のみフィルタしてて HEAD で bypass される設定ミス。 HEAD では body 取れないが、 status / headers から endpoint 存在 / 一部 metadata 漏洩。`,
        `url=${url}, getStatus=${get.status}, headStatus=${head.status}`,
        `1. GET ${url} → ${get.status}\n2. HEAD ${url} → ${head.status}`,
        { url, getStatus: get.status, headStatus: head.status, safetyNote: "GET + HEAD 各 1 リクエストのみ。" }, "manual_verify");
      count++;
      continue;
    }
    if (head.status >= 500 && get.status === 200) {
      await createNote(scanId, `HEAD method 5xx ( method handling 不備 ) [Low]`, url, "low",
        `${url} で GET=200 だが HEAD=${head.status}。 framework が HEAD method を正しく処理してない設計ミス。`,
        `url=${url}, getStatus=${get.status}, headStatus=${head.status}`,
        `1. GET ${url} → ${get.status}\n2. HEAD ${url} → ${head.status}`,
        { url, getStatus: get.status, headStatus: head.status, safetyNote: "GET + HEAD 各 1 リクエストのみ。" });
      count++;
    }
  }
  return count;
}

// === 9. Range request metadata leak ( bytes=0-0 only ) ===
export async function runRangeRequestMetadataLeak(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  let count = 0;
  for (const url of (await getCandidateGetUrls(program, targetUrl, 4)).slice(0, 4)) {
    if (count >= 2) break;
    const r = await fetchWith(url, { headers: { Range: "bytes=0-0" } });
    if (!r) continue;
    const cr = String(r.headers["content-range"] ?? "");
    const cl = Number(String(r.headers["content-length"] ?? "0"));
    const m = cr.match(/bytes\s+\d+-\d+\/(\d+)/);
    const totalSize = m ? Number(m[1]) : 0;
    if (totalSize < 50 * 1024 * 1024 && cl < 50 * 1024 * 1024) continue;
    await createNote(scanId, `Range request で大型 asset metadata 漏洩 (${Math.round(totalSize / 1024 / 1024)} MB) [Low]`, url, "low",
      `${url} に Range: bytes=0-0 を送って Content-Range から元 file size ${Math.round(totalSize / 1024 / 1024)} MB を取得。 大型 file が anonymous でアクセス可能 = データセット / DB dump / archive 漏洩の hint。 ★ 本ツールは 1 byte だけ取得 ( 大容量 DL してない )。`,
      `url=${url}, totalSize=${totalSize}, contentRange=${cr}`,
      `1. GET ${url} ( Range: bytes=0-0 ) → Content-Range で全 size 取得`,
      { url, totalSize, contentRange: cr, contentLength: cl, safetyNote: "Range: bytes=0-0 で 1 byte のみ取得。 大容量 DL は実施していない。" });
    count++;
  }
  return count;
}

// === 10. ETag / Last-Modified correlation for hidden asset existence hints ===
export async function runEtagLastModifiedCorrelation(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  let count = 0;
  const hosts = getHosts(program, targetUrl, 3);
  const tested = new Set<string>();
  for (const host of hosts) {
    if (count >= 2) break;
    if (tested.has(host)) continue;
    tested.add(host);
    const probePaths = ["/admin", "/backup", "/private", "/.git", "/internal"];
    const found: Array<{ path: string; etag: string | null; lastMod: string | null; status: number }> = [];
    for (const p of probePaths) {
      const probeUrl = `https://${host}${p}`;
      if (!isUrlInScope(program, probeUrl).allowed) continue;
      const r = await fetchWith(probeUrl, { method: "HEAD" });
      if (!r) continue;
      const etag = String(r.headers["etag"] ?? "") || null;
      const lastMod = String(r.headers["last-modified"] ?? "") || null;
      if ((r.status === 404 || r.status === 403) && (etag || lastMod)) {
        found.push({ path: p, etag, lastMod, status: r.status });
      }
    }
    if (found.length === 0) continue;
    await createNote(scanId, `ETag/Last-Modified で hidden asset 存在 hint (${found.length} 件) [Low]`, host, "low",
      `${host} で 404/403 でも ETag / Last-Modified が返る path: ${found.map((f) => `${f.path} (status=${f.status}, etag=${f.etag?.slice(0, 30)})`).join(", ")}。 file が物理的に存在するが access denied = 機密 file の存在を示唆 ( Apache の static fall-through 等 )。`,
      `host=${host}, hintCount=${found.length}`,
      `1. HEAD https://${host}/admin / /backup / /private 等\n2. 404/403 でも ETag / Last-Modified が返る = 存在 hint`,
      { host, hints: found, safetyNote: "HEAD リクエストのみ。 file 取得は実施していない。" });
    count++;
  }
  return count;
}
