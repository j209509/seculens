// 未ログイン外部観測専用 追加 20 機能
// 制約: GET/HEAD/OPTIONS のみ。brute force / DoS / token 総当たり / package 登録 / exploit 禁止
// 強い証拠のみ Finding 化、弱いものは severity=low + recommendedAction=monitor で保存

import { promises as dns } from "node:dns";
import { chromium } from "playwright";
import { isUrlInScope } from "@/lib/scope";
import { maskBody } from "@/lib/mask";
import { safeJsonParse } from "@/lib/json";
import { isLikelyValidApex } from "@/lib/domain-validity";
import { makeScanCtx, createScanFinding, findExistingScanFinding } from "@/lib/scan-adapter";
import { reportSubStep } from "@/lib/scan-context";

async function fetchAnon(url: string, method: "GET" | "HEAD" | "OPTIONS" = "GET"): Promise<{ status: number; body: string; headers: Record<string, string | string[] | undefined> } | null> {
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

async function createNote(scanId: string, type: string, target: string, severity: "critical" | "high" | "medium" | "low", impact: string, evidence: string, repro: string, payload: object, recommendedAction: "report_now" | "manual_verify" | "monitor" = "monitor") {
  const existing = await findExistingScanFinding(scanId, type, target);
  if (existing) return null;
  await createScanFinding(scanId, {
    type, target, severity, impact,
    inScopeReason: "収集済み許可ドメイン ( 未ログイン外部観測 )",
    evidence,
    requestResponseDiff: maskBody("application/json", JSON.stringify(payload, null, 2)),
    reproductionSteps: repro,
    aiWorthSending: severity === "critical" || severity === "high" ? "高ティア。報告候補。" : "弱い証拠。 monitor 扱い、 補強情報出るまで保留。",
    bountyLikelihood: severity === "critical" ? "very_high" : severity === "high" ? "high" : severity === "medium" ? "medium" : "low",
    recommendedAction
  });
  return true;
}

function getHosts(program: { allowedDomains: string }, targetUrl: string, max = 5): string[] {
  const allowed = safeJsonParse<string[]>(program.allowedDomains, []);
  const hosts = [...new Set(allowed.map((d) => d.replace(/^\*\./, "").replace(/^https?:\/\//, "").split("/")[0]).filter(isLikelyValidApex))].slice(0, max);
  try { hosts.unshift(new URL(targetUrl).host); } catch { /* ignore */ }
  return [...new Set(hosts)].slice(0, max);
}

// === 1. Framework manifest route discovery ===
export async function runFrameworkManifestDiscovery(scanId: string, targetUrl: string) {
  reportSubStep("Next.js _buildManifest 解析中");
  const program = makeScanCtx(scanId, targetUrl);
  let count = 0;
  for (const host of getHosts(program, targetUrl, 5)) {
    if (count >= 4) break;
    // Next.js: /_next/static/[buildId]/_buildManifest.js
    const next = await fetchAnon(`https://${host}/_next/static/`).catch(() => null);
    if (next && next.status === 200) {
      const buildIdMatch = next.body.match(/href="\/_next\/static\/([^"\/]+)\//);
      if (buildIdMatch) {
        const bm = await fetchAnon(`https://${host}/_next/static/${buildIdMatch[1]}/_buildManifest.js`);
        if (bm && bm.status === 200 && /sortedPages/.test(bm.body)) {
          const pages = bm.body.match(/"\/[^"]+"/g)?.slice(0, 50) ?? [];
          const adminLikePages = pages.filter((p) => /admin|internal|private|debug|backoffice|console|dashboard\/(?!\?)/i.test(p));
          if (adminLikePages.length > 0) {
            await createNote(scanId, `Next.js manifest 隠し管理 route ${adminLikePages.length} 件 [Medium]`, `https://${host}/`, "medium",
              `Next.js _buildManifest.js から隠し route ${adminLikePages.length} 件抽出: ${adminLikePages.slice(0, 5).join(", ")}。 認証なしで一覧化可能 = 攻撃面マップ提供 + 後段 endpoint probe の起点。`,
              `host=${host}, buildId=${buildIdMatch[1]}, adminPages=${adminLikePages.length}`,
              `1. GET https://${host}/_next/static/${buildIdMatch[1]}/_buildManifest.js\n2. sortedPages から admin/internal/private 系を抽出`,
              { host, buildId: buildIdMatch[1], adminLikePages, allPagesCount: pages.length, safetyNote: "GET 2 リクエストのみ。" });
            count++;
          }
        }
      }
    }
    // SvelteKit
    const svelte = await fetchAnon(`https://${host}/_app/version.json`);
    if (svelte && svelte.status === 200 && /"version"\s*:/.test(svelte.body)) {
      try {
        const j = JSON.parse(svelte.body);
        await createNote(scanId, `SvelteKit version.json 公開 [Low]`, `https://${host}/_app/version.json`, "low",
          `SvelteKit の version.json が公開されてビルドバージョン (${j.version}) が漏洩。 単独では low だが新ビルド検知 + 既知 CVE 突合せ可能。`,
          `host=${host}, version=${j.version}`,
          `1. GET https://${host}/_app/version.json`,
          { host, version: j.version, safetyNote: "GET 1 リクエストのみ。" });
        count++;
      } catch { /* ignore */ }
    }
  }
  return count;
}

// === 2. Client-side feature flag leakage ===
export async function runFeatureFlagLeakage(scanId: string, targetUrl: string) {
  reportSubStep("クライアント側 feature flag 検出");
  const program = makeScanCtx(scanId, targetUrl);
  let count = 0;
  // Fetch main page and extract JS bundle URLs
  const browser = await chromium.launch({ headless: true });
  const jsBundles: Array<{ url: string; body: string }> = [];
  try {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    const res = await page.request.fetch(targetUrl, { method: "GET", failOnStatusCode: false, timeout: 12000 });
    const htmlBody = await res.text().catch(() => "");
    const baseUrl = new URL(targetUrl);
    const jsSrcs = [...htmlBody.matchAll(/src=["']([^"']+\.js)["']/gi)].map((m) => m[1]);
    for (const src of jsSrcs.slice(0, 8)) {
      const jsUrl = src.startsWith("http") ? src : `${baseUrl.origin}${src.startsWith("/") ? src : "/" + src}`;
      if (!isUrlInScope(program, jsUrl).allowed) continue;
      try {
        const jsRes = await page.request.fetch(jsUrl, { method: "GET", failOnStatusCode: false, timeout: 8000 });
        const jsBody = await jsRes.text().catch(() => "");
        if (jsBody && jsBody.length >= 200) jsBundles.push({ url: jsUrl, body: jsBody });
      } catch { /* skip */ }
    }
    await ctx.close();
  } finally { await browser.close().catch(() => undefined); }

  for (const bundle of jsBundles) {
    if (count >= 4) break;
    const flagPatterns = [
      /['"`](beta|alpha|admin|internal|preview|debug|vip|premium|enterprise|paid|trial|legacy|new[-_]?ui|new[-_]?dashboard|maintenance[-_]?mode|kill[-_]?switch|feature[-_]?flag)[-_a-z0-9]*['"`]/gi,
      /isEnabled\s*\(\s*['"`]([a-z0-9_\-]{4,40})['"`]/gi,
      /useFlag\s*\(\s*['"`]([a-z0-9_\-]{4,40})['"`]/gi,
      /variation\s*\(\s*['"`]([a-z0-9_\-]{4,40})['"`]/gi,
    ];
    const flags = new Set<string>();
    for (const re of flagPatterns) {
      let m: RegExpExecArray | null;
      const r = new RegExp(re.source, re.flags);
      while ((m = r.exec(bundle.body)) !== null) {
        const name = m[1] ?? m[0];
        if (name.length >= 4 && name.length <= 60) flags.add(name);
        if (flags.size >= 30) break;
      }
    }
    const sensitive = [...flags].filter((f) => /admin|internal|debug|kill|maintenance|vip|premium|paid|enterprise/i.test(f));
    if (sensitive.length === 0) continue;
    await createNote(scanId, `Client-side feature flag 漏洩 (${sensitive.length} 件) [Low]`, bundle.url, "low",
      `JS バンドル ${bundle.url} に sensitive feature flag 名が ${sensitive.length} 件: ${sensitive.slice(0, 8).join(", ")}。 隠れた admin / debug / premium 機能の存在を示唆。 単独では low だが後段 endpoint 探索の hint。`,
      `jsUrl=${bundle.url}, sensitiveFlags=${sensitive.length}`,
      `1. GET ${bundle.url} → JS body に flag 名混入`,
      { jsUrl: bundle.url, sensitiveFlags: sensitive, allFlags: [...flags], safetyNote: "GET 1 リクエストのみ。" });
    count++;
  }
  return count;
}

// === 3. Public build metadata exposure ===
export async function runBuildMetadataExposure(scanId: string, targetUrl: string) {
  reportSubStep("ビルド commit / version 露出確認");
  const program = makeScanCtx(scanId, targetUrl);
  const paths = ["/version.json", "/.well-known/version", "/api/version", "/version", "/BUILD_INFO", "/build-info.json", "/api/build-info", "/_app/version.json", "/version.txt", "/healthz?verbose"];
  let count = 0;
  for (const host of getHosts(program, targetUrl, 4)) {
    if (count >= 4) break;
    for (const p of paths) {
      if (count >= 4) break;
      const url = `https://${host}${p}`;
      if (!isUrlInScope(program, url).allowed) continue;
      const r = await fetchAnon(url);
      if (!r || r.status !== 200) continue;
      const m = r.body.match(/(?:commit|sha|build|version|branch|hash)[\s"':=]+([a-f0-9]{7,40}|\d+\.\d+\.\d+[\w.-]*)/i);
      if (!m) continue;
      await createNote(scanId, `Build metadata 漏洩 (${m[1].slice(0, 20)}) [Low]`, url, "low",
        `${url} で build commit hash / version (${m[0]}) が漏洩。 単独では low だが、 Public GitHub の commit log と突き合わせて未公開機能 / 内部 path / WIP コードが特定可能。`,
        `host=${host}, path=${p}, hashOrVersion=${m[1].slice(0, 30)}`,
        `1. GET ${url}\n2. レスポンスから commit hash / version を抽出`,
        { url, bodyPreview: r.body.slice(0, 800), extractedSignature: m[0], safetyNote: "GET 1 リクエストのみ。" });
      count++;
    }
  }
  return count;
}

// === 4. Public error page fingerprinting ===
export async function runErrorPageFingerprinting(scanId: string, targetUrl: string) {
  reportSubStep("エラーページ fingerprint 解析");
  const program = makeScanCtx(scanId, targetUrl);
  let count = 0;
  for (const host of getHosts(program, targetUrl, 4)) {
    if (count >= 3) break;
    const url = `https://${host}/asdf-NONEXISTENT-9999-bb-probe/`;
    if (!isUrlInScope(program, url).allowed) continue;
    const r = await fetchAnon(url);
    if (!r) continue;
    const fingerprints: Array<{ pattern: RegExp; tech: string }> = [
      { pattern: /Cannot GET \/asdf-NONEXISTENT/, tech: "Express.js" },
      { pattern: /<title>Whitelabel Error Page<\/title>/, tech: "Spring Boot" },
      { pattern: /Page not found.*?Django/i, tech: "Django ( DEBUG=True で stack trace 漏洩リスク )" },
      { pattern: /Werkzeug Debugger|Werkzeug\/[\d.]+/i, tech: "Flask + Werkzeug" },
      { pattern: /Routing Error|ActionController::RoutingError/i, tech: "Ruby on Rails" },
      { pattern: /<h1>Not Found<\/h1>.*?Apache/i, tech: "Apache" },
      { pattern: /<title>Tomcat<\/title>|HTTP Status 404 – Not Found.*?Apache Tomcat/, tech: "Apache Tomcat" },
      { pattern: /Microsoft-IIS|IIS \d+\.\d+/i, tech: "Microsoft IIS" },
      { pattern: /Phoenix Framework/i, tech: "Phoenix ( Elixir )" },
      { pattern: /Laravel|Whoops, looks like something went wrong/i, tech: "Laravel" },
      { pattern: /<!--Application Error-->/i, tech: "Heroku ( app crashed )" }
    ];
    const matched = fingerprints.find((f) => f.pattern.test(r.body));
    if (!matched) continue;
    await createNote(scanId, `Error page fingerprint: ${matched.tech} [Low]`, `https://${host}/`, "low",
      `${host} で意図的に存在しない URL を叩いたところ "${matched.tech}" のエラーページが返却。 framework / バージョン特定 = CVE 突合せの起点。`,
      `host=${host}, framework=${matched.tech}, status=${r.status}`,
      `1. GET https://${host}/asdf-NONEXISTENT-9999-bb-probe/\n2. レスポンス本体に ${matched.tech} の特徴的フィンガープリント`,
      { host, framework: matched.tech, status: r.status, bodyPreview: r.body.slice(0, 500), safetyNote: "存在しない URL に GET 1 回のみ。" });
    count++;
  }
  return count;
}

// === 5. Trace ID / Request ID correlation ===
export async function runTraceIdCorrelation(scanId: string, targetUrl: string) {
  reportSubStep("Trace / Request ID ヘッダー観察");
  const program = makeScanCtx(scanId, targetUrl);
  let count = 0;
  for (const host of getHosts(program, targetUrl, 3)) {
    if (count >= 2) break;
    const ids: Array<{ name: string; value: string }> = [];
    for (let i = 0; i < 5; i++) {
      const r = await fetchAnon(`https://${host}/?bb_corr=${i}`);
      if (!r) continue;
      for (const k of ["x-request-id", "x-trace-id", "x-amzn-trace-id", "x-correlation-id", "request-id", "trace-id", "x-server", "x-served-by", "x-pod"]) {
        const v = r.headers[k];
        if (v) ids.push({ name: k, value: Array.isArray(v) ? v.join(",") : v as string });
      }
    }
    if (ids.length === 0) continue;
    const reqIds = ids.filter((x) => /request|correlation/i.test(x.name)).map((x) => x.value);
    const sequential = reqIds.length >= 2 && reqIds.every((v) => /^\d+$/.test(v)) && reqIds.every((v, i, arr) => i === 0 || Number(v) > Number(arr[i - 1]));
    const exposesHostname = ids.some((x) => /pod|server|host|node/i.test(x.name) && /(?:[a-z0-9-]+\.(?:internal|local|cluster|svc|ec2)|i-[a-f0-9]+|ip-\d+-\d+)/i.test(x.value));
    if (!sequential && !exposesHostname) continue;
    const sev: "high" | "medium" | "low" = exposesHostname ? "medium" : "low";
    await createNote(scanId, `Trace/Request ID 情報漏洩 (${exposesHostname ? "internal hostname" : "sequential id"}) [${sev === "medium" ? "Medium" : "Low"}]`, `https://${host}/`, sev,
      `${host} のレスポンスヘッダーで ${ids.map((x) => x.name).join(", ")} が観測。${sequential ? " request-id が単調増加 = 列挙経路の hint。" : ""}${exposesHostname ? " 内部 hostname / pod 名 / EC2 instance ID が漏洩。" : ""}`,
      `host=${host}, headers=${ids.length}, sequential=${sequential}, exposesHostname=${exposesHostname}`,
      `1. GET https://${host}/?bb_corr=0 ... 4 ( 5 リクエスト )\n2. ${ids.map((x) => `${x.name}: ${x.value.slice(0, 40)}`).join("\n   ")}`,
      { host, observedHeaders: ids, sequential, exposesHostname, safetyNote: "GET 5 リクエストのみ。" });
    count++;
  }
  return count;
}

// === 6. Public status page correlation ===
export async function runStatusPageCorrelation(scanId: string, targetUrl: string) {
  reportSubStep("公開 status page 解析");
  const program = makeScanCtx(scanId, targetUrl);
  let count = 0;
  for (const host of getHosts(program, targetUrl, 3)) {
    if (count >= 2) break;
    const tld = host.split(".").slice(-2).join(".");
    const candidates = [`status.${tld}`, `${tld.split(".")[0]}.statuspage.io`, `${tld.split(".")[0]}.instatus.com`, `status.${host}`];
    for (const c of candidates) {
      if (count >= 2) break;
      try { await dns.resolve4(c).catch(() => undefined); } catch { continue; }
      const r = await fetchAnon(`https://${c}/`).catch(() => null);
      if (!r || r.status !== 200) continue;
      const componentNames = [...r.body.matchAll(/data-component-id="\d+"[^>]*>[^<]*<span[^>]*>([^<]{3,80})</gi)].map((m) => m[1].trim());
      if (componentNames.length === 0) continue;
      await createNote(scanId, `Public status page 内部システム名漏洩 [Low]`, `https://${c}/`, "low",
        `${c} に公開 status page があり、内部システム / マイクロサービス名が ${componentNames.length} 件確認できました ( 例: ${componentNames.slice(0, 5).join(", ")} )。 単独では low だが攻撃面マップ + 後段 endpoint 探索の hint。`,
        `statusHost=${c}, componentCount=${componentNames.length}`,
        `1. GET https://${c}/`,
        { statusHost: c, componentNames: componentNames.slice(0, 30), safetyNote: "GET 1 リクエストのみ。" });
      count++;
    }
  }
  return count;
}

// === 7. Changelog / release notes mining ===
export async function runChangelogMining(scanId: string, targetUrl: string) {
  reportSubStep("CHANGELOG / リリースノート探索");
  const program = makeScanCtx(scanId, targetUrl);
  const paths = ["/CHANGELOG.md", "/CHANGES.md", "/RELEASE_NOTES.md", "/changelog", "/releases", "/blog/changelog", "/whats-new", "/release-notes"];
  let count = 0;
  for (const host of getHosts(program, targetUrl, 3)) {
    if (count >= 2) break;
    for (const p of paths) {
      if (count >= 2) break;
      const url = `https://${host}${p}`;
      if (!isUrlInScope(program, url).allowed) continue;
      const r = await fetchAnon(url);
      if (!r || r.status !== 200) continue;
      const securityMentions = [...r.body.matchAll(/(?:fixed|patched|resolved|mitigat\w+|CVE-\d{4}-\d+|XSS|SQL injection|RCE|SSRF|CSRF|auth.{0,30}bypass|privilege escalation)\s*[:\-]?\s*([^\n.<]{20,200})/gi)].map((m) => m[0].slice(0, 200));
      if (securityMentions.length === 0) continue;
      await createNote(scanId, `Changelog から security fix 言及 ${securityMentions.length} 件 [Low]`, url, "low",
        `${url} に security fix 言及 ${securityMentions.length} 件: ${securityMentions.slice(0, 3).join(" / ")}。 単独では low だが、 古い endpoint や CVE 該当機能の場所特定 hint。`,
        `url=${url}, mentions=${securityMentions.length}`,
        `1. GET ${url}`,
        { url, securityMentions: securityMentions.slice(0, 10), safetyNote: "GET 1 リクエストのみ。" });
      count++;
    }
  }
  return count;
}

// === 8. Developer docs / SDK endpoint extraction ===
export async function runDeveloperDocsExtraction(scanId: string, targetUrl: string) {
  reportSubStep("Developer docs から endpoint 抽出");
  const program = makeScanCtx(scanId, targetUrl);
  const paths = ["/docs", "/developer", "/developers", "/api-reference", "/reference", "/sdk", "/help/api", "/docs/api", "/api/reference"];
  let count = 0;
  for (const host of getHosts(program, targetUrl, 3)) {
    if (count >= 2) break;
    for (const p of paths) {
      if (count >= 2) break;
      const url = `https://${host}${p}`;
      if (!isUrlInScope(program, url).allowed) continue;
      const r = await fetchAnon(url);
      if (!r || r.status !== 200) continue;
      const endpoints = [...new Set((r.body.match(/(?:GET|POST|PUT|PATCH|DELETE)\s+\/[a-zA-Z0-9_\-\/\{\}\.:]+/g) ?? []).slice(0, 50))];
      if (endpoints.length < 5) continue;
      const sensitive = endpoints.filter((e) => /admin|internal|export|download|users?|invoices?|files?|secret|token|webhook/i.test(e));
      if (sensitive.length === 0) continue;
      await createNote(scanId, `Developer docs から sensitive endpoint ${sensitive.length} 件 [Low]`, url, "low",
        `${url} の dev docs に sensitive 系 endpoint ${sensitive.length} 件確認: ${sensitive.slice(0, 5).join(", ")}。 認証要件は doc 別。 anon-api / openapi-deep モジュールで個別検証推奨。`,
        `url=${url}, endpointCount=${endpoints.length}, sensitiveCount=${sensitive.length}`,
        `1. GET ${url}\n2. 抽出 endpoint: ${sensitive.slice(0, 3).join(" / ")}`,
        { url, sensitiveEndpoints: sensitive, allEndpoints: endpoints, safetyNote: "GET 1 リクエストのみ。" });
      count++;
    }
  }
  return count;
}

// === 9. Public webhook receiver misconfig ===
export async function runWebhookReceiverCheck(scanId: string, targetUrl: string) {
  reportSubStep("Webhook receiver 設定漏洩確認");
  const program = makeScanCtx(scanId, targetUrl);
  const paths = ["/webhooks", "/webhook", "/hook", "/api/webhooks", "/api/webhook", "/integrations/webhooks", "/v1/webhooks"];
  let count = 0;
  for (const host of getHosts(program, targetUrl, 3)) {
    if (count >= 2) break;
    for (const p of paths) {
      if (count >= 2) break;
      const url = `https://${host}${p}`;
      if (!isUrlInScope(program, url).allowed) continue;
      const r = await fetchAnon(url);
      if (!r) continue;
      if (r.status === 200 && /(?:webhook[_-]?secret|signing[_-]?secret|hmac[_-]?key|x-hub-signature|x-signature)/i.test(r.body)) {
        await createNote(scanId, `Webhook receiver 設定漏洩 [Medium]`, url, "medium",
          `${url} に GET したところ webhook secret / signature 関連の設定情報が漏洩。 攻撃者は webhook 偽装 / replay 攻撃の経路を得る。`,
          `url=${url}, status=${r.status}`,
          `1. GET ${url}`,
          { url, bodyPreview: r.body.slice(0, 1000), safetyNote: "GET 1 リクエストのみ。POST は実施していない。" });
        count++;
      } else if (r.status === 405 || r.status === 200) {
        await createNote(scanId, `Webhook endpoint 存在 ( 認証要件未確認 ) [Low]`, url, "low",
          `${url} で webhook endpoint の存在を確認 ( status=${r.status} )。 POST + 偽 signature でテスト推奨 ( 本ツールは POST 試行しない )。`,
          `url=${url}, status=${r.status}`,
          `1. GET ${url} → ${r.status === 405 ? "Method Not Allowed = POST 専用 webhook 確認" : "200"}`,
          { url, status: r.status, safetyNote: "GET 1 リクエストのみ。" });
        count++;
      }
    }
  }
  return count;
}

// === 10. CORS preflight policy inventory ===
export async function runCorsPreflightInventory(scanId: string, targetUrl: string) {
  reportSubStep("CORS preflight policy 棚卸し");
  const program = makeScanCtx(scanId, targetUrl);
  const apiPaths = ["/api", "/api/v1", "/api/user", "/api/me", "/graphql", "/v1/api"];
  const hosts = getHosts(program, targetUrl, 3);
  const endpoints = new Set<string>();
  for (const host of hosts) {
    for (const p of apiPaths) {
      const ep = `https://${host}${p}`;
      if (isUrlInScope(program, ep).allowed) endpoints.add(ep);
    }
  }
  let count = 0;
  const inventory: Array<{ url: string; allowOrigin: string | null; allowMethods: string | null; allowCredentials: string | null }> = [];
  for (const ep of [...endpoints].slice(0, 12)) {
    const r = await fetchAnon(ep, "OPTIONS");
    if (!r) continue;
    inventory.push({
      url: ep,
      allowOrigin: (Array.isArray(r.headers["access-control-allow-origin"]) ? r.headers["access-control-allow-origin"].join(",") : r.headers["access-control-allow-origin"] as string) ?? null,
      allowMethods: (Array.isArray(r.headers["access-control-allow-methods"]) ? r.headers["access-control-allow-methods"].join(",") : r.headers["access-control-allow-methods"] as string) ?? null,
      allowCredentials: (Array.isArray(r.headers["access-control-allow-credentials"]) ? r.headers["access-control-allow-credentials"].join(",") : r.headers["access-control-allow-credentials"] as string) ?? null
    });
  }
  if (inventory.length === 0) return 0;
  const inconsistent = inventory.filter((i) => i.allowOrigin && i.allowOrigin !== "null" && i.allowOrigin !== "*").length > 0 &&
                       inventory.filter((i) => i.allowOrigin === "*").length > 0;
  if (inconsistent) {
    await createNote(scanId, `CORS preflight policy 不整合 inventory [Low]`, [...endpoints][0] ?? "(unknown)", "low",
      `同一プログラム内で CORS preflight policy が endpoint ごとに不整合 ( wildcard と reflection が混在 )。 設定一貫性の欠如 = 設計レビュー推奨。 単独では low。`,
      `endpoints=${inventory.length}, inconsistent=true`,
      `1. OPTIONS 各 endpoint → Access-Control-Allow-Origin の値が一貫してない`,
      { inventory: inventory.slice(0, 10), safetyNote: "OPTIONS リクエストのみ。" });
    count++;
  }
  return count;
}

// === 11. Static asset access-control drift ===
export async function runStaticAssetDrift(scanId: string, targetUrl: string) {
  reportSubStep("静的アセット access-control 検査");
  const program = makeScanCtx(scanId, targetUrl);
  // Fetch main page to find static asset URLs
  let count = 0;
  const staticUrls: string[] = [];
  try {
    const browser = await chromium.launch({ headless: true });
    try {
      const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
      const page = await ctx.newPage();
      const res = await page.request.fetch(targetUrl, { method: "GET", failOnStatusCode: false, timeout: 12000 });
      const htmlBody = await res.text().catch(() => "");
      const baseUrl = new URL(targetUrl);
      const matches = htmlBody.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css|png|jpg|svg|woff2?))["']/gi);
      for (const m of matches) {
        const src = m[1];
        const jsUrl = src.startsWith("http") ? src : `${baseUrl.origin}${src.startsWith("/") ? src : "/" + src}`;
        if (isUrlInScope(program, jsUrl).allowed && /\/(?:static|assets|public)\//i.test(new URL(jsUrl).pathname)) {
          staticUrls.push(jsUrl);
          if (staticUrls.length >= 10) break;
        }
      }
      await ctx.close();
    } finally { await browser.close().catch(() => undefined); }
  } catch { /* ignore */ }

  for (const url of staticUrls) {
    if (count >= 3) break;
    const base = url.replace(/\.(?:js|css|png|jpg|svg|woff2?)(\?.*)?$/i, "");
    if (base === url) continue;
    const variants = [".json", ".html", ".bak", ".map", ".old"];
    for (const v of variants) {
      const r = await fetchAnon(base + v);
      if (!r || r.status !== 200) continue;
      if (r.body.length < 50) continue;
      await createNote(scanId, `Static asset access-control drift (${v}) [Low]`, base + v, "low",
        `${base + v} は本来 404 のはずだが 200 で返却 ( ${r.body.length} bytes )。 access-control の drift = 想定外 file 公開リスク。`,
        `path=${base + v}, status=${r.status}, bodyLen=${r.body.length}`,
        `1. GET ${base + v} → ${r.status}`,
        { url: base + v, bodyPreview: r.body.slice(0, 500), safetyNote: "GET 1 リクエストのみ。" });
      count++;
      break;
    }
  }
  return count;
}

// === 12. PDF / Office metadata leakage ===
export async function runPdfOfficeMetadataLeakage(scanId: string, targetUrl: string) {
  reportSubStep("PDF / Office metadata 漏洩探索");
  const program = makeScanCtx(scanId, targetUrl);
  // Probe known document paths
  const hosts = getHosts(program, targetUrl, 3);
  const docPaths = ["/docs/report.pdf", "/files/presentation.pptx", "/documents/overview.docx", "/export.pdf"];
  let count = 0;
  for (const host of hosts) {
    if (count >= 3) break;
    for (const p of docPaths) {
      if (count >= 3) break;
      const url = `https://${host}${p}`;
      if (!isUrlInScope(program, url).allowed) continue;
      const r = await fetchAnon(url);
      if (!r || r.status !== 200) continue;
      const author = r.body.match(/\/Author\s*\(([^)]{1,80})\)/)?.[1];
      const producer = r.body.match(/\/Producer\s*\(([^)]{1,80})\)/)?.[1];
      const creator = r.body.match(/\/Creator\s*\(([^)]{1,80})\)/)?.[1];
      const internalPath = r.body.match(/[\/\\](?:Users|home|Documents)[\/\\][^\s\/\\]{1,40}/);
      if (!author && !producer && !creator && !internalPath) continue;
      await createNote(scanId, `PDF/Office metadata 漏洩 [Low]`, url, "low",
        `${url} の文書 metadata に作者名 / 内部 path 情報が含まれます: author=${author ?? "-"}, producer=${producer ?? "-"}, creator=${creator ?? "-"}${internalPath ? `, internalPath=${internalPath[0]}` : ""}。 OSINT の hint。`,
        `url=${url}, author=${author}, producer=${producer}, creator=${creator}, internalPath=${internalPath?.[0]}`,
        `1. GET ${url} → metadata 抽出`,
        { url, author, producer, creator, internalPath: internalPath?.[0], safetyNote: "GET 1 リクエストのみ。" });
      count++;
    }
  }
  return count;
}

// === 13. Analytics / tag manager exposure review ===
export async function runAnalyticsTagManagerReview(scanId: string, targetUrl: string) {
  reportSubStep("Analytics / Tag manager ID 抽出");
  const program = makeScanCtx(scanId, targetUrl);
  let count = 0;
  // Fetch main page
  const r = await fetchAnon(targetUrl);
  if (!r || r.status !== 200 || !isUrlInScope(program, targetUrl).allowed) return 0;
  const body = r.body;
  const ids: Array<{ tool: string; id: string }> = [];
  const gtm = body.match(/GTM-[A-Z0-9]{4,8}/);
  if (gtm) ids.push({ tool: "GTM", id: gtm[0] });
  const ga4 = body.match(/G-[A-Z0-9]{8,12}/);
  if (ga4) ids.push({ tool: "GA4", id: ga4[0] });
  const gaUa = body.match(/UA-\d{4,}-\d+/);
  if (gaUa) ids.push({ tool: "GA UA", id: gaUa[0] });
  const hotjar = body.match(/hjid:\s*(\d{6,})/) || body.match(/hotjar\.com\/c\/hotjar-(\d{6,})/);
  if (hotjar) ids.push({ tool: "Hotjar", id: hotjar[1] });
  const mixpanel = body.match(/mixpanel\.init\s*\(\s*['"]([a-f0-9]{32})['"]/);
  if (mixpanel) ids.push({ tool: "Mixpanel", id: mixpanel[1] });
  const segment = body.match(/analytics\.load\s*\(\s*['"]([a-zA-Z0-9]{20,40})['"]/);
  if (segment) ids.push({ tool: "Segment", id: segment[1] });
  if (ids.length === 0) return 0;
  await createNote(scanId, `Analytics / Tag manager exposure (${ids.length} tools) [Low]`, targetUrl, "low",
    `${targetUrl} に分析ツール ID が公開: ${ids.map((i) => `${i.tool}=${i.id}`).join(", ")}。 GTM 等は public 仕様だが、 tag 内部の URL や rule から内部組織情報が見える場合 medium。`,
    `url=${targetUrl}, tools=${ids.map((i) => i.tool).join(",")}`,
    `1. GET ${targetUrl}\n2. 抽出 ID: ${ids.map((i) => `${i.tool}=${i.id}`).join(", ")}`,
    { url: targetUrl, ids, safetyNote: "GET 1 リクエストのみ。" });
  count++;
  return count;
}

// === 14. CSP report / Sentry ingestion abuse classification ===
export async function runCspSentryAbuseRisk(scanId: string, targetUrl: string) {
  reportSubStep("CSP report-uri abuse リスク評価");
  const program = makeScanCtx(scanId, targetUrl);
  let count = 0;
  for (const host of getHosts(program, targetUrl, 3)) {
    if (count >= 2) break;
    const r = await fetchAnon(`https://${host}/`);
    if (!r) continue;
    const csp = (Array.isArray(r.headers["content-security-policy"]) ? r.headers["content-security-policy"].join(",") : r.headers["content-security-policy"] as string) ?? "";
    const reportUri = csp.match(/report-uri\s+(\S+)/i)?.[1];
    const reportTo = csp.match(/report-to\s+(\S+)/i)?.[1];
    if (!reportUri && !reportTo) continue;
    await createNote(scanId, `CSP report endpoint 公開 ( abuse risk ) [Low]`, `https://${host}/`, "low",
      `${host} の CSP report-uri (${reportUri ?? "-"}) / report-to (${reportTo ?? "-"}) が公開されており、 攻撃者は大量 fake report 送信で log 汚染 / storage cost 増 / 真のインシデント埋没を狙える。 単独 low だが OWASP A04 設計上の注意。`,
      `host=${host}, reportUri=${reportUri}, reportTo=${reportTo}`,
      `1. GET https://${host}/\n2. CSP header から report-uri 抽出`,
      { host, csp: csp.slice(0, 500), reportUri, reportTo, safetyNote: "GET 1 リクエストのみ。 report 送信は実施していない。" });
    count++;
  }
  return count;
}

// === 15. Multi-tenant hostname/slug pattern discovery ===
export async function runMultiTenantPatternDiscovery(scanId: string, targetUrl: string) {
  reportSubStep("Multi-tenant subdomain パターン探索");
  const program = makeScanCtx(scanId, targetUrl);
  const allowed = safeJsonParse<string[]>(program.allowedDomains, []);
  let count = 0;
  for (const d of allowed.slice(0, 5)) {
    if (count >= 2) break;
    if (!d.startsWith("*.")) continue;
    const apex = d.slice(2);
    try {
      const res = await fetch(`https://crt.sh/?q=%25.${encodeURIComponent(apex)}&output=json`, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) continue;
      const data = await res.json() as Array<{ name_value?: string }>;
      const tenants = new Set<string>();
      for (const e of data.slice(0, 200)) {
        for (const line of (e.name_value ?? "").split(/\s+/)) {
          const sub = line.replace(/^\*\./, "").toLowerCase();
          if (sub === apex) continue;
          if (!sub.endsWith("." + apex)) continue;
          const parts = sub.replace(`.${apex}`, "").split(".");
          if (parts.length === 1 && /^[a-z0-9-]{3,30}$/.test(parts[0])) tenants.add(parts[0]);
        }
        if (tenants.size >= 200) break;
      }
      if (tenants.size < 5) continue;
      await createNote(scanId, `Multi-tenant tenant 一覧 ${tenants.size} 件抽出 [Low]`, `*.${apex}`, "low",
        `crt.sh から ${apex} の wildcard subdomain ( = tenant slug 候補 ) ${tenants.size} 件を確認: ${[...tenants].slice(0, 10).join(", ")}。 認証が tenant 単位の場合、IDOR / cross-tenant access の探索起点。`,
        `apex=${apex}, tenantCount=${tenants.size}`,
        `1. https://crt.sh/?q=%25.${apex}&output=json → 全 subdomain 取得\n2. 1 段の slug 候補のみ抽出`,
        { apex, tenants: [...tenants].slice(0, 50), safetyNote: "crt.sh への GET 1 回のみ。 tenant への brute force / 認証試行は実施しない。" });
      count++;
    } catch { /* ignore */ }
  }
  return count;
}

// === 16. Invite/share link format analysis without brute force ===
export async function runInviteLinkFormatAnalysis(scanId: string, targetUrl: string): Promise<number> {
  reportSubStep("Invite / share link 形式分析");
  // Without httpTraffic, we can only probe known invite/share paths
  const program = makeScanCtx(scanId, targetUrl);
  const hosts = getHosts(program, targetUrl, 2);
  const invitePaths = ["/invite", "/share", "/join", "/gift", "/claim"];
  const tokens = new Set<string>();
  for (const host of hosts) {
    for (const p of invitePaths) {
      const url = `https://${host}${p}`;
      if (!isUrlInScope(program, url).allowed) continue;
      const r = await fetchAnon(url);
      if (!r || r.status !== 200) continue;
      const m1 = [...r.body.matchAll(/\/(?:invite|share|join|gift|claim)\/([A-Za-z0-9_\-]{6,80})\b/gi)];
      for (const m of m1) tokens.add(m[1]);
    }
  }
  if (tokens.size < 2) return 0;
  const tokenArray = [...tokens];
  const isAllNumeric = tokenArray.every((t) => /^\d+$/.test(t));
  const isShort = tokenArray.every((t) => t.length < 12);
  let weakness = "";
  if (isAllNumeric) weakness = "全 numeric ( 列挙容易 ) ";
  else if (isShort) weakness = `短い token ( 平均 ${Math.round(tokenArray.reduce((a, b) => a + b.length, 0) / tokenArray.length)} 文字、 brute force 余地 )`;
  if (!weakness) return 0;
  await createNote(scanId, `Invite/share link 形式弱性 (${weakness}) [Low]`, "(invite token format)", "low",
    `Invite / share link の token 形式分析: ${weakness}。 ${tokenArray.length} サンプル: ${tokenArray.slice(0, 3).map((t) => t.slice(0, 12)).join(", ")}。 brute force は実施していない ( 形式観察のみ )。`,
    `tokenCount=${tokenArray.length}, isAllNumeric=${isAllNumeric}, isShort=${isShort}`,
    `1. invite/share URL からの token 抽出\n2. token 形式を分析 ( 文字種 / 長さ / UUID パターン )`,
    { tokens: tokenArray.slice(0, 10), isAllNumeric, isShort, safetyNote: "観察のみ。 brute force / 列挙は禁止。" });
  return 1;
}

// === 17. CDN cache key/header audit ===
export async function runCdnCacheKeyAudit(scanId: string, targetUrl: string) {
  reportSubStep("CDN cache-key / Vary 監査");
  const program = makeScanCtx(scanId, targetUrl);
  let count = 0;
  for (const host of getHosts(program, targetUrl, 3)) {
    if (count >= 2) break;
    const r = await fetchAnon(`https://${host}/`);
    if (!r) continue;
    const cdn = r.headers["cf-ray"] ? "Cloudflare" : r.headers["x-served-by"] ? "Fastly" : (r.headers["x-akamai-transformed"] || r.headers["akamai-x-cache-on"]) ? "Akamai" : null;
    if (!cdn) continue;
    const vary = (Array.isArray(r.headers["vary"]) ? r.headers["vary"].join(",") : r.headers["vary"] as string) ?? "";
    const cacheControl = (Array.isArray(r.headers["cache-control"]) ? r.headers["cache-control"].join(",") : r.headers["cache-control"] as string) ?? "";
    const issues: string[] = [];
    if (/private|max-age=\d+/i.test(cacheControl) && !/cookie|authorization/i.test(vary)) {
      issues.push("Cache-Control に max-age があるが Vary に Cookie / Authorization が含まれない ( ユーザー間で cache 共有リスク )");
    }
    const m = cacheControl.match(/max-age=(\d+)/);
    if (m && /public/i.test(cacheControl) && Number(m[1]) > 86400 * 7) issues.push(`max-age=${m[1]} ( ${Math.round(Number(m[1]) / 86400)} 日 ) は過剰`);
    if (issues.length === 0) continue;
    await createNote(scanId, `CDN cache key 設定問題 (${cdn}) [Low]`, `https://${host}/`, "low",
      `${host} ( CDN: ${cdn} ) の cache header 設定: ${issues.join(" / ")}。 cache deception や cross-user cache 漏洩の経路。`,
      `host=${host}, cdn=${cdn}, issues=${issues.length}`,
      `1. GET https://${host}/\n2. response headers 観察: vary=${vary}, cache-control=${cacheControl}`,
      { host, cdn, vary, cacheControl, issues, safetyNote: "GET 1 リクエストのみ。" });
    count++;
  }
  return count;
}

// === 18. Dependency confusion risk without package registration ===
export async function runDependencyConfusionRisk(scanId: string, targetUrl: string) {
  reportSubStep("Dependency confusion 候補チェック");
  const program = makeScanCtx(scanId, targetUrl);
  // Fetch JS bundles from main page to extract scoped package names
  const internalPackages = new Set<string>();
  try {
    const browser = await chromium.launch({ headless: true });
    try {
      const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
      const page = await ctx.newPage();
      const res = await page.request.fetch(targetUrl, { method: "GET", failOnStatusCode: false, timeout: 12000 });
      const htmlBody = await res.text().catch(() => "");
      const baseUrl = new URL(targetUrl);
      const jsSrcs = [...htmlBody.matchAll(/src=["']([^"']+\.js)["']/gi)].map((m) => m[1]);
      for (const src of jsSrcs.slice(0, 6)) {
        const jsUrl = src.startsWith("http") ? src : `${baseUrl.origin}${src.startsWith("/") ? src : "/" + src}`;
        if (!isUrlInScope(program, jsUrl).allowed) continue;
        try {
          const jsRes = await page.request.fetch(jsUrl, { method: "GET", failOnStatusCode: false, timeout: 8000 });
          const jsBody = await jsRes.text().catch(() => "");
          if (!jsBody || jsBody.length < 100) continue;
          const requires = [...jsBody.matchAll(/(?:require|import)\s*[\(\s]+['"](@[a-z0-9\-]+\/[a-z0-9\-_.]+)['"]/g)].map((m) => m[1]);
          for (const r2 of requires) internalPackages.add(r2);
        } catch { /* skip */ }
      }
      await ctx.close();
    } finally { await browser.close().catch(() => undefined); }
  } catch { /* ignore */ }
  if (internalPackages.size === 0) return 0;
  // npm registry に登録があるかチェック ( GET のみ )
  const unregistered: string[] = [];
  for (const pkg of [...internalPackages].slice(0, 12)) {
    try {
      const r = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}`, { signal: AbortSignal.timeout(5000) });
      if (r.status === 404) unregistered.push(pkg);
    } catch { /* ignore */ }
  }
  if (unregistered.length === 0) return 0;
  await createNote(scanId, `Dependency confusion 候補 ( unregistered scoped pkg ${unregistered.length} 件 ) [Medium]`, "(internal packages)", "medium",
    `内部利用 scoped package が npm registry に未登録: ${unregistered.join(", ")}。 攻撃者が同名で publish すると build 時に攻撃 package を install させる経路 ( CVE-2021-44906 系 / Birsan 攻撃 )。 ★ 本ツールは package 登録を行っていない ( 制約遵守 )。`,
    `internalPackages=${internalPackages.size}, unregistered=${unregistered.length}`,
    `1. JS から scoped package 抽出\n2. registry.npmjs.org/<pkg> で 404 確認\n3. 攻撃者は同名で公開可能 = supply chain 攻撃成立`,
    { allInternalPackages: [...internalPackages], unregisteredOnNpm: unregistered, safetyNote: "GET のみ。 package の登録 / publish は実施していない。" });
  return 1;
}

// === 19. Public CI/CD metadata discovery ===
export async function runCicdMetadataDiscovery(scanId: string, targetUrl: string) {
  reportSubStep("CI/CD 設定ファイル公開確認");
  const program = makeScanCtx(scanId, targetUrl);
  const paths = [".github/workflows/", "/.gitlab-ci.yml", "/Jenkinsfile", "/azure-pipelines.yml", "/.circleci/config.yml", "/.travis.yml", "/buildkite/", "/.drone.yml"];
  let count = 0;
  for (const host of getHosts(program, targetUrl, 3)) {
    if (count >= 2) break;
    for (const p of paths) {
      if (count >= 2) break;
      const url = `https://${host}${p}`;
      if (!isUrlInScope(program, url).allowed) continue;
      const r = await fetchAnon(url);
      if (!r || r.status !== 200) continue;
      if (!/(?:on:|jobs:|stages:|pipeline|runs-on:|name:.*?:|FROM\s)/i.test(r.body)) continue;
      const hasSecret = /(?:secret|token|api[_-]?key|password)\s*:\s*[^$\s]/i.test(r.body) && !/secrets\.[A-Z_]+/.test(r.body);
      const sev: "high" | "low" = hasSecret ? "high" : "low";
      await createNote(scanId, `CI/CD config 公開 (${p}) [${sev === "high" ? "High" : "Low"}]`, url, sev,
        `${url} で CI/CD 設定ファイル公開${hasSecret ? " ★ secret 平文混入の疑い" : ""}。 build pipeline / deployment target / 内部ツール特定 = 攻撃面マップ。`,
        `host=${host}, path=${p}, hasSecret=${hasSecret}`,
        `1. GET ${url}\n2. ${hasSecret ? "secret 平文混入確認" : "build steps / deploy target 抽出"}`,
        { url, hasSecret, bodyPreview: r.body.slice(0, 1000), safetyNote: "GET 1 リクエストのみ。" });
      count++;
    }
  }
  return count;
}

// === 20. Passive CVE mapping without exploitation ===
export async function runPassiveCveMapping(scanId: string, targetUrl: string) {
  reportSubStep("Server / X-Powered-By から CVE 突合せ");
  const program = makeScanCtx(scanId, targetUrl);
  let count = 0;
  for (const host of getHosts(program, targetUrl, 4)) {
    if (count >= 4) break;
    const r = await fetchAnon(`https://${host}/`);
    if (!r) continue;
    const server = (Array.isArray(r.headers["server"]) ? r.headers["server"].join(",") : r.headers["server"] as string) ?? "";
    const xpb = (Array.isArray(r.headers["x-powered-by"]) ? r.headers["x-powered-by"].join(",") : r.headers["x-powered-by"] as string) ?? "";
    const fp = `${server} ${xpb}`;
    const m = fp.match(/(nginx|apache|iis|php|asp\.net|express|tomcat|openssl)\/?\s*([\d.]+)/i);
    if (!m) continue;
    const sw = m[1].toLowerCase();
    const ver = m[2];
    const knownCves: Array<{ software: RegExp; versionRange: (v: string) => boolean; cve: string; severity: "critical" | "high" | "medium"; description: string }> = [
      { software: /nginx/, versionRange: (v) => /^1\.(?:1[0-7]|[0-9])\./.test(v), cve: "CVE-2019-9511 (HTTP/2 DoS)", severity: "high", description: "nginx 1.x HTTP/2 DoS" },
      { software: /nginx/, versionRange: (v) => /^1\.(?:[0-9]|1[0-3])\./.test(v), cve: "CVE-2017-7529 (range DoS)", severity: "medium", description: "nginx range request DoS" },
      { software: /apache/, versionRange: (v) => /^2\.4\.(?:[0-9]|[1-3][0-9]|4[0-8])$/.test(v), cve: "CVE-2021-41773 (Path Traversal)", severity: "critical", description: "Apache 2.4.49 path traversal RCE" },
      { software: /apache/, versionRange: (v) => /^2\.4\.(?:[0-9]|[1-3][0-9]|4[0-9]|50)$/.test(v), cve: "CVE-2021-42013 (Path Traversal RCE)", severity: "critical", description: "Apache 2.4.50 path traversal RCE" },
      { software: /openssl/, versionRange: (v) => /^1\.0\.(?:1[a-f]?|0)/.test(v), cve: "CVE-2014-0160 (Heartbleed)", severity: "critical", description: "OpenSSL 1.0.1a-f Heartbleed" },
      { software: /php/, versionRange: (v) => /^[5-7]\./.test(v), cve: "Multiple CVEs ( PHP EOL )", severity: "high", description: "PHP 5.x/7.x EOL = unpatched CVEs" }
    ];
    const matched = knownCves.filter((c) => c.software.test(sw) && c.versionRange(ver));
    if (matched.length === 0) continue;
    const top = matched.sort((a, b) => ({ critical: 3, high: 2, medium: 1 }[b.severity] ?? 0) - ({ critical: 3, high: 2, medium: 1 }[a.severity] ?? 0))[0];
    await createNote(scanId, `Passive CVE mapping: ${sw} ${ver} → ${top.cve} [${top.severity === "critical" ? "Critical" : top.severity === "high" ? "High" : "Medium"}]`, host, top.severity,
      `${host} の ${sw} ${ver} は ${top.cve} (${top.description}) 該当。 exploit は実施していない ( passive mapping のみ )。 nuclei templates と組み合わせて active 検証推奨。`,
      `host=${host}, software=${sw}, version=${ver}, cve=${top.cve}`,
      `1. curl -I https://${host}/ → Server / X-Powered-By から ${sw} ${ver} 判定\n2. NVD CVE DB と突合せ → ${top.cve}\n3. exploit は別途 nuclei / 手動で確認`,
      { host, software: sw, version: ver, matchedCves: matched.map((c) => c.cve), safetyNote: "GET 1 リクエストのみ。 exploit 試行は禁止。" });
    count++;
  }
  return count;
}

/** scan-runner.ts から呼ばれる統合エントリポイント */
export async function runExternalPassiveChecks(scanId: string, targetUrl: string): Promise<void> {
  await Promise.allSettled([
    runFrameworkManifestDiscovery(scanId, targetUrl),
    runFeatureFlagLeakage(scanId, targetUrl),
    runBuildMetadataExposure(scanId, targetUrl),
    runErrorPageFingerprinting(scanId, targetUrl),
    runTraceIdCorrelation(scanId, targetUrl),
    runStatusPageCorrelation(scanId, targetUrl),
    runChangelogMining(scanId, targetUrl),
    runDeveloperDocsExtraction(scanId, targetUrl),
    runWebhookReceiverCheck(scanId, targetUrl),
    runCorsPreflightInventory(scanId, targetUrl),
    runStaticAssetDrift(scanId, targetUrl),
    runPdfOfficeMetadataLeakage(scanId, targetUrl),
    runAnalyticsTagManagerReview(scanId, targetUrl),
    runCspSentryAbuseRisk(scanId, targetUrl),
    runMultiTenantPatternDiscovery(scanId, targetUrl),
    runInviteLinkFormatAnalysis(scanId, targetUrl),
    runCdnCacheKeyAudit(scanId, targetUrl),
    runDependencyConfusionRisk(scanId, targetUrl),
    runCicdMetadataDiscovery(scanId, targetUrl),
    runPassiveCveMapping(scanId, targetUrl),
  ]);
}
