// 外部からログイン無しで発見できる脆弱性パターンの大規模 probe。
// 検出カテゴリ:
//   A. CMS / Framework specific endpoint (wp-admin / actuator / telescope 等)
//   B. WordPress user enumeration (?author=1 / wp-json/wp/v2/users)
//   C. Backup / source code archive (/backup.zip / /db.sql 等)
//   D. Source map exposure (/static/js/*.map)
//   E. API documentation exposure (/swagger / /api-docs / /openapi.json)
//   F. Verbose debug parameter (?debug=1 で baseline と diff )
//   G. HTTP method testing (TRACE / OPTIONS で許可メソッド漏洩)

import { chromium } from "playwright";
import { isUrlInScope } from "@/lib/scope";
import { maskBody } from "@/lib/mask";
import { safeJsonParse } from "@/lib/json";
import { isLikelyValidApex } from "@/lib/domain-validity";
import { makeScanCtx, createScanFinding, findExistingScanFinding } from "@/lib/scan-adapter";

const SENSITIVE_PATHS: Array<{ path: string; signature: RegExp; severity: "critical" | "high" | "medium" | "low"; label: string; description: string }> = [
  // Spring Boot Actuator
  { path: "/actuator", signature: /"_links"\s*:|"actuator"\s*:|"href"\s*:\s*"https?:\/\/[^"]*\/actuator/i, severity: "high", label: "Spring Actuator 公開", description: "Spring Boot Actuator が公開されている。/actuator/env で環境変数 / DB password 漏洩可能性" },
  { path: "/actuator/env", signature: /"propertySources"|"systemEnvironment"|"applicationConfig"/i, severity: "critical", label: "Spring Actuator env 漏洩", description: "/actuator/env で全環境変数 ( DB password / API key 含む ) が漏洩" },
  { path: "/actuator/heapdump", signature: /^.{0,4}HPROF/i, severity: "critical", label: "Spring Actuator heapdump", description: "JVM heap dump 漏洩" },
  { path: "/actuator/configprops", signature: /"contexts"|"prefix"\s*:/i, severity: "high", label: "Spring Actuator configprops", description: "全設定値の出力" },
  { path: "/actuator/mappings", signature: /"mappings"|"requestMappings"|"dispatcherServlet"/i, severity: "medium", label: "Spring Actuator mappings", description: "全エンドポイントのマッピング情報" },
  { path: "/env", signature: /"propertySources"|"systemEnvironment"/i, severity: "critical", label: "Spring env (旧 endpoint)", description: "Spring Boot 旧 /env で環境変数漏洩" },
  // Laravel
  { path: "/telescope", signature: /Telescope|telescope-tabs|var Telescope/i, severity: "high", label: "Laravel Telescope 公開", description: "Laravel Telescope dashboard 公開 = 全リクエスト / クエリ / メール内容閲覧可能" },
  { path: "/horizon", signature: /Horizon|horizon-tabs|var Horizon/i, severity: "medium", label: "Laravel Horizon 公開", description: "Laravel Horizon キュー監視画面公開" },
  { path: "/_ignition/health-check", signature: /"can_execute_commands"|"runnable"\s*:\s*true/i, severity: "critical", label: "Laravel Ignition 公開", description: "Laravel Ignition ( CVE-2021-3129 RCE 経路 )" },
  // Symfony
  { path: "/_profiler", signature: /<title>[^<]*Profiler|Symfony Profiler|profiler-search/i, severity: "high", label: "Symfony Profiler 公開", description: "Symfony Profiler 公開 = 全 request / query / cookie 閲覧可" },
  // Rails / Django / Express debug pages
  { path: "/rails/info/properties", signature: /Rails::Info|Ruby version|Rails version/i, severity: "high", label: "Rails info pages", description: "Rails の ENV / version / app info 漏洩" },
  { path: "/__debugger__/", signature: /Werkzeug Debugger|<title>.*Werkzeug|werkzeug debugger PIN/i, severity: "critical", label: "Werkzeug Debugger ( RCE )", description: "Flask / Django の debug=True で Werkzeug Debugger が有効 = 任意コード実行" },
  // API documentation 公開
  { path: "/swagger", signature: /<title>Swagger|swagger-ui|swagger-initializer|"swagger"\s*:\s*"/i, severity: "medium", label: "Swagger UI 公開", description: "Swagger UI で全 API エンドポイント + パラメータ仕様が見える" },
  { path: "/swagger-ui/index.html", signature: /swagger-ui/i, severity: "medium", label: "Swagger UI 公開", description: "Swagger UI" },
  { path: "/api-docs", signature: /"swagger"|"openapi"|"info"\s*:.*"version"/i, severity: "medium", label: "API docs 公開", description: "API 仕様書 ( Swagger/OpenAPI ) 公開" },
  { path: "/openapi.json", signature: /"openapi"\s*:\s*"3|"swagger"\s*:\s*"2/i, severity: "medium", label: "OpenAPI 仕様公開", description: "OpenAPI 仕様 = 内部 API 全列挙" },
  { path: "/graphiql", signature: /<title>GraphiQL|graphiql/i, severity: "medium", label: "GraphiQL 公開", description: "GraphiQL Web IDE 公開 = 任意 GraphQL クエリ実行可" },
  // Backup / archive files
  { path: "/backup.sql", signature: /CREATE TABLE|INSERT INTO|--\s*MySQL dump|PostgreSQL database dump/i, severity: "critical", label: "DB backup ( SQL dump )", description: "/backup.sql に DB ダンプ漏洩" },
  { path: "/database.sql", signature: /CREATE TABLE|INSERT INTO|MySQL dump/i, severity: "critical", label: "database.sql 漏洩", description: "DB dump 漏洩" },
  { path: "/backup.zip", signature: /^PK\x03\x04|^PK\x05\x06/, severity: "critical", label: "/backup.zip 漏洩", description: "プロジェクト全体 ZIP 漏洩" },
  { path: "/web.config.bak", signature: /<configuration|<system\.web|<connectionStrings/i, severity: "critical", label: "/web.config.bak 漏洩", description: "IIS web.config backup ( DB connection string 含む )" },
  { path: "/config.php.bak", signature: /<\?php|define\s*\(/i, severity: "critical", label: "/config.php.bak 漏洩", description: "PHP config backup ( DB password 含む )" },
  // WordPress
  { path: "/wp-admin/", signature: /<title>[^<]*WordPress|wp-login\.php|wp-admin/i, severity: "medium", label: "WordPress wp-admin", description: "WordPress 管理画面の存在" },
  { path: "/xmlrpc.php", signature: /XML-RPC server accepts POST requests only|<methodCall>|xmlrpc/i, severity: "high", label: "WordPress xmlrpc.php", description: "xmlrpc.php 有効 = ブルートフォース増幅 / pingback SSRF / DoS" },
  { path: "/wp-json/wp/v2/users", signature: /^\s*\[\s*\{[^}]*"id"\s*:\s*\d+[^}]*"name"/i, severity: "high", label: "WP REST API user 列挙", description: "/wp-json/wp/v2/users で全 user の id / name / slug が漏洩" },
  // Dangerous credentials / config files
  { path: "/.aws/credentials", signature: /aws_access_key_id|aws_secret_access_key/i, severity: "critical", label: ".aws/credentials 漏洩", description: "AWS credentials ファイル直接漏洩" },
  { path: "/.npmrc", signature: /_authToken=|registry=|always-auth/i, severity: "critical", label: "/.npmrc 漏洩", description: "npm publish 用 token 漏洩" },
  { path: "/.htpasswd", signature: /:\$apr1\$|:\$2y\$|:\$1\$/i, severity: "high", label: "/.htpasswd 漏洩", description: "Apache basic auth password hash 漏洩" },
  // Misc dangerous
  { path: "/info.php", signature: /<title>phpinfo\(\)<\/title>|PHP Version/i, severity: "high", label: "/info.php phpinfo", description: "/info.php に phpinfo() 漏洩" },
  { path: "/.docker/config.json", signature: /"auths"\s*:|"credsStore"|"credHelpers"/i, severity: "critical", label: ".docker config.json 漏洩", description: "Docker Hub / ECR の認証情報漏洩" },
  // Source maps
  { path: "/static/js/main.js.map", signature: /"version"\s*:\s*3,\s*"file"|"sources"\s*:\s*\[|sourceMappingURL/i, severity: "medium", label: "Source map 漏洩", description: "main.js.map で TypeScript / Vue / React 元コード復元可能" },
  { path: "/_next/static/chunks/main.js.map", signature: /"version"\s*:\s*3/i, severity: "medium", label: "Next.js source map", description: "Next.js source map 漏洩 = 元 React コード復元可" },
  // Server status
  { path: "/server-status?auto", signature: /Total Accesses|CPULoad|Uptime|ReqPerSec/i, severity: "high", label: "Apache server-status auto", description: "Apache mod_status auto 形式" },
  { path: "/nginx_status", signature: /Active connections|server accepts handled|Reading:|Writing:/i, severity: "medium", label: "Nginx stub_status", description: "nginx stub_status エンドポイント" },
  // ASP.NET
  { path: "/Trace.axd", signature: /<title>Trace Information|<h1>Application Trace/i, severity: "high", label: "ASP.NET Trace.axd", description: "/Trace.axd 公開 = 全リクエストの詳細トレース" }
];

async function fetchPath(host: string, path: string, scheme: "https" | "http" = "https"): Promise<{ status: number; bodyPreview: string; headers: Record<string, string | string[] | undefined> } | null> {
  try {
    const browser = await chromium.launch({ headless: true });
    try {
      const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
      const page = await ctx.newPage();
      const res = await page.request.fetch(`${scheme}://${host}${path}`, { method: "GET", failOnStatusCode: false, timeout: 8000, maxRedirects: 2 });
      const body = await res.text().catch(() => "");
      const headers = res.headers();
      await ctx.close();
      return { status: res.status(), bodyPreview: body.slice(0, 8000), headers };
    } finally { await browser.close().catch(() => undefined); }
  } catch { return null; }
}

export async function runExternalAttackSurfaceProbe(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  const allowed = safeJsonParse<string[]>(program.allowedDomains, []);
  const hosts = [...new Set(allowed.map((d) => d.replace(/^\*\./, "").replace(/^https?:\/\//, "").split("/")[0]))].filter(isLikelyValidApex).slice(0, 12);
  // Add target host
  try { const th = new URL(targetUrl).host; if (!hosts.includes(th)) hosts.unshift(th); } catch { /* ignore */ }

  let count = 0;
  const reportedSet = new Set<string>();
  for (const host of hosts.slice(0, 12)) {
    if (count >= 15) break;
    for (const probe of SENSITIVE_PATHS) {
      if (count >= 15) break;
      const targetPathUrl = `https://${host}${probe.path}`;
      if (!isUrlInScope(program, targetPathUrl).allowed) continue;
      const r = await fetchPath(host, probe.path, "https");
      if (!r) continue;
      if (r.status !== 200) continue;
      if (!probe.signature.test(r.bodyPreview)) continue;
      const dedupKey = `${host}|${probe.path}`;
      if (reportedSet.has(dedupKey)) continue;
      reportedSet.add(dedupKey);
      const sevLabel = probe.severity === "critical" ? "Critical" : probe.severity === "high" ? "High" : probe.severity === "medium" ? "Medium" : "Low";
      const taggedType = `External Probe: ${probe.label} [${sevLabel}]`;
      const target = `${host}${probe.path}`;
      const existing = await findExistingScanFinding(scanId, taggedType, target);
      if (existing) continue;
      await createScanFinding(scanId, {
        type: taggedType,
        target,
        severity: probe.severity,
        impact: `${target} に GET アクセスしたところ、${probe.description}。\nレスポンス特徴: ${probe.signature.source.slice(0, 100)} に一致。`,
        inScopeReason: `収集済み許可ドメイン上のホスト`,
        evidence: `host=${host}, path=${probe.path}, status=${r.status}, signature_matched=true`,
        requestResponseDiff: maskBody("application/json", JSON.stringify({
          host,
          path: probe.path,
          status: r.status,
          bodyPreview: r.bodyPreview.slice(0, 1500),
          signatureSource: probe.signature.source,
          safetyNote: "GET 1 リクエストのみ。exploit / 認証情報の収集は実施していない。"
        }, null, 2)),
        reproductionSteps: `1. curl https://${host}${probe.path}\n2. レスポンス本体に "${probe.signature.source.slice(0, 80)}" 形式の signature を確認\n3. ${probe.description}`,
        aiWorthSending: probe.severity === "critical" ? "確実に Critical 級。即報告候補。" : probe.severity === "high" ? "高確度の漏洩。報告候補。" : "Medium。 program の policy で informational / out-of-scope の可能性あり、ポリシー確認後判断。",
        bountyLikelihood: probe.severity === "critical" ? "very_high" : probe.severity === "high" ? "high" : "medium",
        recommendedAction: probe.severity === "critical" ? "report_now" : probe.severity === "high" ? "report_now" : "manual_verify"
      });
      count++;
    }
  }
  return count;
}

const DEBUG_PARAMS = ["debug", "test", "dev", "trace", "verbose", "showerrors", "show_errors", "phpinfo", "XDEBUG_PROFILE"];

export async function runDebugParamProbe(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);

  // Collect candidate GET URLs
  const candidateUrls: string[] = [targetUrl];
  try {
    const browser = await chromium.launch({ headless: true });
    try {
      const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
      const page = await ctx.newPage();
      const mainRes = await page.request.fetch(targetUrl, { failOnStatusCode: false, timeout: 8000 }).catch(() => null);
      if (mainRes) {
        const body = await mainRes.text().catch(() => "");
        const linkMatches = body.matchAll(/href=["']([^"']*\?[^"']*)["']/gi);
        for (const m of linkMatches) {
          try {
            const u = new URL(m[1], targetUrl);
            if (isUrlInScope(program, u.toString()).allowed) {
              candidateUrls.push(u.toString());
              if (candidateUrls.length >= 10) break;
            }
          } catch { /* ignore */ }
        }
      }
      await ctx.close();
    } finally { await browser.close().catch(() => undefined); }
  } catch { /* ignore */ }

  let count = 0;
  const tested = new Set<string>();

  for (const candidateUrl of candidateUrls.slice(0, 10)) {
    if (count >= 5) break;
    if (!isUrlInScope(program, candidateUrl).allowed) continue;
    let u: URL;
    try { u = new URL(candidateUrl); } catch { continue; }
    const key = `${u.origin}${u.pathname}`;
    if (tested.has(key)) continue;
    tested.add(key);

    const browser = await chromium.launch({ headless: true });
    try {
      const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
      const page = await ctx.newPage();
      const baseline = await page.request.fetch(candidateUrl, { failOnStatusCode: false, timeout: 8000 }).catch(() => null);
      const baselineBody = baseline ? await baseline.text().catch(() => "") : "";
      const baselineLen = baselineBody.length;
      let foundParam: string | null = null;
      let probeBodyPreview = "";
      let probeStatus = 0;
      for (const param of DEBUG_PARAMS) {
        const probeUrl = new URL(candidateUrl);
        probeUrl.searchParams.set(param, "1");
        const probe = await page.request.fetch(probeUrl.toString(), { failOnStatusCode: false, timeout: 8000 }).catch(() => null);
        if (!probe) continue;
        const body = await probe.text().catch(() => "");
        if (body.length > baselineLen + 1000 && /(?:phpinfo|stack trace|backtrace|debug|profiler|exception|var_dump|print_r|console\.log|<title>phpinfo)/i.test(body)) {
          foundParam = param;
          probeBodyPreview = body.slice(0, 2000);
          probeStatus = probe.status();
          break;
        }
      }
      await ctx.close();
      if (!foundParam) continue;
      const taggedType = `Debug Parameter Verbose Output (?${foundParam}=1) [Medium-High]`;
      const target = `GET ${u.origin}${u.pathname}`;
      const existing = await findExistingScanFinding(scanId, taggedType, target);
      if (existing) continue;
      await createScanFinding(scanId, {
        type: taggedType,
        target,
        severity: "high",
        impact: `${target} に ?${foundParam}=1 を追加したところ、ベースラインの ${baselineLen} bytes に対し ${probeBodyPreview.length} 文字超のレスポンスが返り、その中に debug / stack trace / phpinfo / exception 等の信号が含まれていました。本番環境で debug モードが有効化されており、内部情報 ( SQL クエリ / 環境変数 / スタックトレース ) が漏洩している可能性があります。`,
        inScopeReason: `収集済み許可ドメイン内のエンドポイント`,
        evidence: `endpoint=${target}, debugParam=${foundParam}, baselineLen=${baselineLen}, probeStatus=${probeStatus}`,
        requestResponseDiff: maskBody("application/json", JSON.stringify({
          endpoint: target,
          debugParam: foundParam,
          baselineLen,
          probeStatus,
          probeBodyPreview: probeBodyPreview.slice(0, 1500),
          safetyNote: "baseline 1 + probe ( 各 debug param 1 ) のリクエストのみ。"
        }, null, 2)),
        reproductionSteps: `1. baseline: curl '${candidateUrl}' → ${baselineLen} bytes\n2. probe: curl '${candidateUrl}${u.search ? "&" : "?"}${foundParam}=1' → 大幅情報追加\n3. レスポンスに debug / stack trace / phpinfo 等の信号`,
        aiWorthSending: "Medium-High。 漏洩内容の機密性で評価変動。 stack trace に DB credentials があれば Critical。",
        bountyLikelihood: "high",
        recommendedAction: "manual_verify"
      });
      count++;
    } finally { await browser.close().catch(() => undefined); }
  }
  return count;
}

export async function runHttpMethodProbe(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  const allowed = safeJsonParse<string[]>(program.allowedDomains, []);
  const hosts = [...new Set(allowed.map((d) => d.replace(/^\*\./, "").replace(/^https?:\/\//, "").split("/")[0]))].filter(isLikelyValidApex).slice(0, 8);
  try { const th = new URL(targetUrl).host; if (!hosts.includes(th)) hosts.unshift(th); } catch { /* ignore */ }

  let count = 0;
  for (const host of hosts.slice(0, 8)) {
    if (count >= 4) break;
    if (!isUrlInScope(program, `https://${host}/`).allowed) continue;
    const browser = await chromium.launch({ headless: true });
    try {
      const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
      const page = await ctx.newPage();
      const opt = await page.request.fetch(`https://${host}/`, { method: "OPTIONS", failOnStatusCode: false, timeout: 8000 }).catch(() => null);
      let allow: string | null = null;
      if (opt && opt.status() < 500) {
        const headers = opt.headers();
        allow = headers["allow"] || headers["access-control-allow-methods"] || null;
      }
      const tr = await page.request.fetch(`https://${host}/`, { method: "TRACE", failOnStatusCode: false, timeout: 8000 }).catch(() => null);
      let traceEnabled = false;
      if (tr) {
        const body = await tr.text().catch(() => "");
        if (tr.status() === 200 && /^TRACE\s+\/|HTTP\/1\.[01]/.test(body) && body.length < 2000) traceEnabled = true;
      }
      await ctx.close();
      if (!traceEnabled && !(allow && /\bPUT\b|\bDELETE\b|\bPATCH\b/i.test(allow))) continue;
      const taggedType = traceEnabled ? `HTTP TRACE Enabled ( XST / Cross-Site Tracing ) [Medium]` : `HTTP Allow header に書込みメソッド ( ${allow} ) [Low-Medium]`;
      const target = host;
      const existing = await findExistingScanFinding(scanId, taggedType, target);
      if (existing) continue;
      await createScanFinding(scanId, {
        type: taggedType,
        target,
        severity: "medium",
        impact: traceEnabled ? `${host} で TRACE メソッドが有効。古い XSS 経路 ( XST: Cross-Site Tracing ) で HttpOnly cookie が漏洩する可能性。` : `${host} の OPTIONS レスポンスで Allow に ${allow} が宣言されている。書込みメソッド ( PUT / DELETE / PATCH ) が unintended に許可されてる可能性。`,
        inScopeReason: `収集済み許可ドメイン上のホスト`,
        evidence: `host=${host}, traceEnabled=${traceEnabled}, allow=${allow ?? "(none)"}`,
        requestResponseDiff: maskBody("application/json", JSON.stringify({ host, traceEnabled, allow, safetyNote: "OPTIONS / TRACE 各 1 リクエストのみ。" }, null, 2)),
        reproductionSteps: `1. curl -X TRACE https://${host}/ → ${traceEnabled ? "200 で request echo 確認" : "TRACE は無効"}\n2. curl -X OPTIONS https://${host}/ → Allow: ${allow ?? "(none)"}\n3. ${traceEnabled ? "TRACE の無効化推奨" : "Allow ヘッダーで PUT/DELETE 不要なら制限推奨"}`,
        aiWorthSending: traceEnabled ? "Medium。 XST は古い問題で modern ブラウザで exploit 限定的。Informational として報告。" : "Low-Medium。設計レビュー対象。",
        bountyLikelihood: "low",
        recommendedAction: "manual_verify"
      });
      count++;
    } finally { await browser.close().catch(() => undefined); }
  }
  return count;
}
