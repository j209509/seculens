/* eslint-disable */
// 残り未ログイン特化 checks の集約 module
// 1. OpenAPI / Swagger deep extraction
// 2. GraphQL schema deep extraction
// 3. Directory Listing 検出
// 4. Backup / config / lockfile 拡張
// 5. DNS / Email security ( SPF / DMARC / DKIM / CAA )
// 6. Web Cache Deception
// 7. Public Error / Debug Surface

import { promises as dns } from "node:dns";
import { chromium } from "playwright";
import { isUrlInScope } from "@/lib/scope";
import { maskBody } from "@/lib/mask";
import { safeJsonParse } from "@/lib/json";
import { isLikelyValidApex } from "@/lib/domain-validity";
import { makeScanCtx, createScanFinding, findExistingScanFinding } from "@/lib/scan-adapter";
import { reportSubStep } from "@/lib/scan-context";

async function fetchAnon(url: string, method: "GET" | "POST" = "GET", body?: string): Promise<{ status: number; body: string; headers: Record<string, string | string[] | undefined> } | null> {
  try {
    const browser = await chromium.launch({ headless: true });
    try {
      const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
      const page = await ctx.newPage();
      const opts: { method: string; failOnStatusCode: boolean; timeout: number; data?: string; headers?: Record<string, string> } = { method, failOnStatusCode: false, timeout: 8000 };
      if (body) { opts.data = body; opts.headers = { "content-type": "application/json" }; }
      const res = await page.request.fetch(url, opts);
      const respBody = await res.text().catch(() => "");
      const headers = res.headers();
      await ctx.close();
      return { status: res.status(), body: respBody.slice(0, 12000), headers };
    } finally { await browser.close().catch(() => undefined); }
  } catch { return null; }
}

async function createFinding(scanId: string, type: string, target: string, severity: "critical" | "high" | "medium" | "low", impact: string, evidence: string, repro: string, payload: object, ai: string) {
  const existing = await findExistingScanFinding(scanId, type, target);
  if (existing) return null;
  await createScanFinding(scanId, {
    type,
    target,
    severity,
    impact,
    inScopeReason: "収集済み許可ドメイン",
    evidence,
    requestResponseDiff: maskBody("application/json", JSON.stringify(payload, null, 2)),
    reproductionSteps: repro,
    aiWorthSending: ai,
    bountyLikelihood: severity === "critical" ? "very_high" : severity === "high" ? "high" : severity === "medium" ? "medium" : "low",
    recommendedAction: severity === "critical" || severity === "high" ? "report_now" : "manual_verify"
  });
  return true;
}

// === 1. OpenAPI / Swagger deep extraction ===
export async function runOpenapiDeepExtraction(scanId: string, targetUrl: string) {
  reportSubStep("OpenAPI / Swagger schema 深堀り");
  const program = makeScanCtx(scanId, targetUrl);
  const allowed = safeJsonParse<string[]>(program.allowedDomains, []);
  const hosts = [...new Set(allowed.map((d) => d.replace(/^\*\./, "").replace(/^https?:\/\//, "").split("/")[0]))].filter(isLikelyValidApex).slice(0, 6);
  // Also add target host
  try { hosts.unshift(new URL(targetUrl).host); } catch { /* ignore */ }
  const openapiPaths = ["/openapi.json", "/swagger.json", "/api-docs", "/api/swagger.json", "/v1/openapi.json", "/v2/openapi.json", "/api/v1/swagger.json"];
  let count = 0;
  for (const host of [...new Set(hosts)]) {
    if (count >= 5) break;
    for (const op of openapiPaths) {
      if (count >= 5) break;
      const url = `https://${host}${op}`;
      if (!isUrlInScope(program, url).allowed) continue;
      const r = await fetchAnon(url);
      if (!r || r.status !== 200) continue;
      let cfg: any;
      try { cfg = JSON.parse(r.body); } catch { continue; }
      if (!cfg.paths || typeof cfg.paths !== "object") continue;
      // security: [] ( 認証不要 ) の endpoint を抽出
      const unauthEndpoints: Array<{ path: string; method: string }> = [];
      for (const [pathKey, pathDef] of Object.entries(cfg.paths)) {
        if (typeof pathDef !== "object" || !pathDef) continue;
        for (const method of ["get", "post", "put", "delete", "patch"]) {
          const op2 = (pathDef as any)[method];
          if (!op2) continue;
          const sec = op2.security ?? cfg.security;
          const noAuth = Array.isArray(sec) && sec.length === 0;
          if (noAuth || !sec) {
            if (/admin|internal|export|download|users?|invoices?|files?|secret|key|token|payment|orders?|customer/i.test(pathKey)) {
              unauthEndpoints.push({ path: pathKey, method: method.toUpperCase() });
            }
          }
        }
        if (unauthEndpoints.length >= 15) break;
      }
      if (unauthEndpoints.length === 0) continue;
      // 上位 3 件を実 GET で確認
      const verified: Array<{ url: string; status: number; bodyPreview: string }> = [];
      for (const ep of unauthEndpoints.slice(0, 3)) {
        if (ep.method !== "GET") continue;
        const probeUrl = `https://${host}${ep.path.replace(/\{[^}]+\}/g, "1")}`;
        const probe = await fetchAnon(probeUrl);
        if (probe && probe.status === 200 && /[\[\{]/.test(probe.body)) {
          verified.push({ url: probeUrl, status: probe.status, bodyPreview: probe.body.slice(0, 500) });
        }
      }
      const sev: "critical" | "high" | "medium" = verified.length > 0 ? "high" : "medium";
      await createFinding(scanId, `OpenAPI 仕様公開 + 未認証 endpoint ${unauthEndpoints.length} 個 [${sev === "high" ? "High" : "Medium"}]`, url, sev,
        `${url} で OpenAPI/Swagger 仕様が公開されており、その中に security:[] ( 認証不要 ) の sensitive endpoint が ${unauthEndpoints.length} 個確認されました ( ${unauthEndpoints.slice(0, 5).map((e) => `${e.method} ${e.path}`).join(", ")} 等 )${verified.length > 0 ? `。 さらに ${verified.length} 件は実 GET で 200 + JSON 返却を確認済。` : ""}`,
        `host=${host}, openapiUrl=${url}, unauthEndpointCount=${unauthEndpoints.length}, verifiedCount=${verified.length}`,
        `1. curl ${url} → OpenAPI JSON 取得\n2. security:[] の endpoint 抽出: ${unauthEndpoints.slice(0, 3).map((e) => e.method + " " + e.path).join(" / ")}\n3. ${verified.length > 0 ? `verified GET: ${verified[0].url} → 200 + JSON` : "実 GET で本当に未認証で読めるか確認"}`,
        { openapiUrl: url, unauthEndpoints, verified, safetyNote: "OpenAPI 取得 + 上位 3 件 GET probe のみ。POST/PUT/DELETE は実施していない。" },
        sev === "high" ? "High。 verified endpoint の機密性次第で Critical 化。" : "Medium。 実 endpoint で本当にデータが読めるか手動確認推奨。"
      );
      count++;
    }
  }
  return count;
}

// === 2. GraphQL schema deep extraction ===
export async function runGraphqlSchemaDeep(scanId: string, targetUrl: string) {
  reportSubStep("GraphQL schema 深堀り解析");
  const program = makeScanCtx(scanId, targetUrl);
  const allowed = safeJsonParse<string[]>(program.allowedDomains, []);
  const hosts = [...new Set(allowed.map((d) => d.replace(/^\*\./, "").replace(/^https?:\/\//, "").split("/")[0]))].filter(isLikelyValidApex).slice(0, 4);
  try { hosts.unshift(new URL(targetUrl).host); } catch { /* ignore */ }

  const gqlPaths = ["/graphql", "/api/graphql", "/v1/graphql", "/query"];
  const gqlEndpoints = new Set<string>();
  for (const host of [...new Set(hosts)].slice(0, 4)) {
    for (const p of gqlPaths) {
      const ep = `https://${host}${p}`;
      if (isUrlInScope(program, ep).allowed) gqlEndpoints.add(ep);
    }
  }

  let count = 0;
  const introQuery = `{ __schema { types { name fields { name type { name } } } queryType { name } mutationType { name } } }`;
  for (const ep of [...gqlEndpoints].slice(0, 4)) {
    if (count >= 3) break;
    const r = await fetchAnon(ep, "POST", JSON.stringify({ query: introQuery }));
    if (!r || r.status !== 200) continue;
    let json: any;
    try { json = JSON.parse(r.body); } catch { continue; }
    const types = json?.data?.__schema?.types ?? [];
    if (!Array.isArray(types) || types.length === 0) continue;
    // 興味深い type / field を抽出
    const interestingFields: string[] = [];
    for (const t of types) {
      if (!t.fields) continue;
      for (const f of t.fields) {
        if (/users?|viewer|node|admin|invoices?|files?|organization|workspace|secret|token|api_?key/i.test(f.name)) {
          interestingFields.push(`${t.name}.${f.name}`);
          if (interestingFields.length >= 20) break;
        }
      }
      if (interestingFields.length >= 20) break;
    }
    if (interestingFields.length === 0) continue;
    // 実 query 試行
    let dataQueryHit = false;
    let dataPreview = "";
    if (interestingFields.some((f) => /users|viewer|me/.test(f))) {
      const q = `{ users { id email } }`;
      const probe = await fetchAnon(ep, "POST", JSON.stringify({ query: q }));
      if (probe && probe.status === 200) {
        try {
          const j = JSON.parse(probe.body);
          if (j.data && (Array.isArray(j.data.users) || j.data.viewer || j.data.me)) {
            dataQueryHit = true;
            dataPreview = probe.body.slice(0, 500);
          }
        } catch { /* ignore */ }
      }
    }
    const sev: "critical" | "high" | "medium" = dataQueryHit ? "critical" : "medium";
    await createFinding(scanId, `GraphQL Introspection + sensitive field 抽出 (${interestingFields.length}件)${dataQueryHit ? " + 未認証 data query 通過" : ""} [${sev === "critical" ? "Critical" : "Medium"}]`, ep, sev,
      `${ep} で introspection が有効 + sensitive field ( ${interestingFields.slice(0, 5).join(", ")} ) を抽出。${dataQueryHit ? " ★ 未認証で実 data query ( users / viewer ) が通り、ユーザーデータ等が返却されました ( Critical )。" : " 実 data query は未確認 ( introspection のみで Medium )。"}`,
      `endpoint=${ep}, fieldCount=${interestingFields.length}, dataQueryHit=${dataQueryHit}`,
      `1. POST ${ep} に introspection query → schema 取得\n2. sensitive field: ${interestingFields.slice(0, 3).join(", ")}\n${dataQueryHit ? `3. POST ${ep} に { users { id email } } → 200 + データ返却` : "3. 各 field を query して 200 + 機密データ返るか手動確認"}`,
      { endpoint: ep, interestingFields, dataQueryHit, dataPreview, safetyNote: "introspection + 1 query のみ。 mutation は実施していない。" },
      dataQueryHit ? "Critical 確定。即報告候補。" : "Medium。 sensitive query を手動で試す価値あり。"
    );
    count++;
  }
  return count;
}

// === 3. Directory Listing 検出 ===
export async function runDirectoryListingCheck(scanId: string, targetUrl: string) {
  reportSubStep("ディレクトリリスティング検出");
  const program = makeScanCtx(scanId, targetUrl);
  const allowed = safeJsonParse<string[]>(program.allowedDomains, []);
  const hosts = [...new Set(allowed.map((d) => d.replace(/^\*\./, "").replace(/^https?:\/\//, "").split("/")[0]))].filter(isLikelyValidApex).slice(0, 6);
  try { hosts.unshift(new URL(targetUrl).host); } catch { /* ignore */ }
  const dirPaths = ["/uploads/", "/files/", "/backup/", "/backups/", "/storage/", "/media/", "/exports/", "/logs/", "/tmp/", "/data/", "/dump/", "/static/uploads/"];
  let count = 0;
  for (const host of [...new Set(hosts)]) {
    if (count >= 4) break;
    for (const dir of dirPaths) {
      if (count >= 4) break;
      const url = `https://${host}${dir}`;
      if (!isUrlInScope(program, url).allowed) continue;
      const r = await fetchAnon(url);
      if (!r || r.status !== 200) continue;
      if (!/<title>Index of |<h1>Index of |Directory listing for |\[DIR\]\s*<\/a>/i.test(r.body)) continue;
      const fileCount = (r.body.match(/<a\s+href="[^"\/?]+"/gi) ?? []).length;
      await createFinding(scanId, `Directory Listing 公開 (${dir}) [Medium-High]`, url, "high",
        `${url} で directory listing が有効 ( "Index of" ヘッダー検出 )。 ${fileCount} 個のファイル / ディレクトリが匿名で列挙可能。 中に backup / config / log / dump 等の機密ファイルが含まれてないか手動確認推奨。`,
        `host=${host}, path=${dir}, fileCount=${fileCount}`,
        `1. curl ${url} → Index of ${dir} 表示\n2. ${fileCount} 個のファイル列挙\n3. 中の機密ファイル ( .env / .sql / .bak / .log 等 ) を個別 GET で確認`,
        { url, fileCount, bodyPreview: r.body.slice(0, 1500), safetyNote: "GET 1 リクエストのみ。中の個別 file 取得は実施していない。" },
        "High。中身次第で Critical 化。"
      );
      count++;
    }
  }
  return count;
}

// === 4. Backup / config / lockfile 拡張 ===
export async function runBackupAndConfigCheck(scanId: string, targetUrl: string) {
  reportSubStep("バックアップ / config 漏洩確認");
  const program = makeScanCtx(scanId, targetUrl);
  const allowed = safeJsonParse<string[]>(program.allowedDomains, []);
  const hosts = [...new Set(allowed.map((d) => d.replace(/^\*\./, "").replace(/^https?:\/\//, "").split("/")[0]))].filter(isLikelyValidApex).slice(0, 5);
  try { hosts.unshift(new URL(targetUrl).host); } catch { /* ignore */ }
  const paths: Array<{ p: string; sig: RegExp; sev: "critical" | "high" | "medium" | "low"; label: string; description: string }> = [
    { p: "/.env.production", sig: /^[A-Z_][A-Z0-9_]*=.+$/m, sev: "critical", label: ".env.production 漏洩", description: "本番環境変数 ( DB password / API key 等 ) 漏洩" },
    { p: "/config.json", sig: /(?:database|password|secret|api_key|token).*[":]/i, sev: "high", label: "config.json 漏洩", description: "アプリ設定ファイル漏洩 ( credentials 含む可能性 )" },
    { p: "/config.yaml", sig: /(?:database|password|secret|api_key|token):/i, sev: "high", label: "config.yaml 漏洩", description: "YAML 設定ファイル漏洩" },
    { p: "/config.yml", sig: /(?:database|password|secret|api_key|token):/i, sev: "high", label: "config.yml 漏洩", description: "YAML 設定ファイル漏洩" },
    { p: "/appsettings.json", sig: /"ConnectionStrings"|"DefaultConnection"|"Password":/i, sev: "critical", label: ".NET appsettings.json", description: ".NET appsettings.json で DB connection string 漏洩" },
    { p: "/web.config", sig: /<configuration|<system\.web|<connectionStrings/i, sev: "high", label: "web.config", description: "IIS web.config 漏洩" },
    { p: "/composer.lock", sig: /"name":\s*"|"version":/, sev: "low", label: "composer.lock", description: "PHP composer.lock ( ライブラリバージョン情報 = CVE 照合可能 )" },
    { p: "/package-lock.json", sig: /"lockfileVersion":|"packages":/, sev: "low", label: "package-lock.json", description: "npm lockfile ( 依存ライブラリ情報 = supply chain attack 経路の hint )" },
    { p: "/yarn.lock", sig: /^# THIS IS AN AUTOGENERATED FILE/m, sev: "low", label: "yarn.lock", description: "yarn lockfile" },
    { p: "/pnpm-lock.yaml", sig: /lockfileVersion:/, sev: "low", label: "pnpm-lock.yaml", description: "pnpm lockfile" },
    { p: "/database.sqlite", sig: /^SQLite format 3/, sev: "critical", label: "database.sqlite", description: "SQLite DB 漏洩 ( 全データ )" },
    { p: "/dump.tar", sig: /ustar|\x00{2,}/, sev: "high", label: "dump.tar", description: "tar archive 漏洩" },
    { p: "/backup.tar", sig: /ustar|\x00{2,}/, sev: "high", label: "backup.tar", description: "tar archive 漏洩" },
    { p: "/www.tar.gz", sig: /^\x1f\x8b/, sev: "critical", label: "www.tar.gz", description: "サイト全体 tar.gz" },
    { p: "/public.zip", sig: /^PK\x03\x04/, sev: "high", label: "public.zip", description: "public ディレクトリ zip" },
    { p: "/Dockerfile", sig: /^FROM\s|^RUN\s|^COPY\s/m, sev: "low", label: "Dockerfile", description: "Dockerfile 漏洩" },
    { p: "/docker-compose.yml", sig: /services:|version:\s*['"]/i, sev: "medium", label: "docker-compose.yml", description: "docker-compose 漏洩 ( 内部サービス構成 )" }
  ];
  let count = 0;
  for (const host of [...new Set(hosts)]) {
    if (count >= 6) break;
    for (const probe of paths) {
      if (count >= 6) break;
      const url = `https://${host}${probe.p}`;
      if (!isUrlInScope(program, url).allowed) continue;
      const r = await fetchAnon(url);
      if (!r || r.status !== 200) continue;
      if (!probe.sig.test(r.body)) continue;
      await createFinding(scanId, `${probe.label} [${probe.sev === "critical" ? "Critical" : probe.sev === "high" ? "High" : probe.sev === "medium" ? "Medium" : "Low"}]`, url, probe.sev,
        `${url} で ${probe.description}。 anonymous GET で取得可能。`,
        `host=${host}, path=${probe.p}, status=200`,
        `1. curl ${url} → 200 + ${probe.label} 取得`,
        { url, bodyPreview: r.body.slice(0, 1500), safetyNote: "GET 1 リクエストのみ。" },
        probe.sev === "critical" ? "Critical 確定。" : "影響範囲確認後判断。"
      );
      count++;
    }
  }
  return count;
}

// === 5. DNS / Email security ( SPF / DMARC / DKIM / CAA ) ===
export async function runDnsEmailSecurityCheck(scanId: string, targetUrl: string) {
  reportSubStep("SPF / DMARC / DKIM / CAA 検査");
  const program = makeScanCtx(scanId, targetUrl);
  const allowed = safeJsonParse<string[]>(program.allowedDomains, []);
  const apexDomains = [...new Set(allowed.map((d) => d.replace(/^\*\./, "").replace(/^https?:\/\//, "").split("/")[0]).filter(isLikelyValidApex).map((d) => d.split(".").slice(-2).join(".")))].filter(isLikelyValidApex).slice(0, 8);
  // Also add target apex
  try {
    const targetApex = new URL(targetUrl).host.split(".").slice(-2).join(".");
    if (isLikelyValidApex(targetApex)) apexDomains.unshift(targetApex);
  } catch { /* ignore */ }
  let count = 0;
  for (const apex of [...new Set(apexDomains)]) {
    if (count >= 4) break;
    const issues: string[] = [];
    // SPF
    try {
      const txt = await dns.resolveTxt(apex).catch(() => [] as string[][]);
      const spf = txt.flat().find((r) => /^v=spf1/i.test(r));
      if (!spf) issues.push("SPF レコード無し ( email spoofing 可能 )");
      else if (/[?+]all/i.test(spf)) issues.push(`SPF が緩い ( ${spf.slice(0, 80)} ): +all/?all = なりすまし許可 / soft fail`);
    } catch { /* dns error */ }
    // DMARC
    try {
      const dmarcTxt = await dns.resolveTxt(`_dmarc.${apex}`).catch(() => [] as string[][]);
      const dmarc = dmarcTxt.flat().find((r) => /^v=DMARC1/i.test(r));
      if (!dmarc) issues.push("DMARC レコード無し ( email spoofing 検知不可 )");
      else if (/p=none/i.test(dmarc)) issues.push(`DMARC p=none ( monitoring only、 spoofing block しない )`);
    } catch { /* dns error */ }
    // CAA
    try {
      const caa = await (dns as any).resolveCaa?.(apex).catch?.(() => []) ?? [];
      if (Array.isArray(caa) && caa.length === 0) issues.push("CAA レコード無し ( 任意 CA で証明書発行可能、phishing 経路 )");
    } catch { /* ignore */ }
    if (issues.length === 0) continue;
    await createFinding(scanId, `DNS / Email security 不備 (${issues.length} 項目) [Low-Medium]`, apex, "low",
      `${apex} で email / DNS の以下の不備が確認されました: ${issues.join(" / ")}。 email spoofing / phishing 経路 / 証明書任意発行 のリスク。`,
      `apex=${apex}, issues=${issues.length}`,
      `1. dig TXT ${apex} → SPF\n2. dig TXT _dmarc.${apex} → DMARC\n3. dig CAA ${apex} → CAA\n4. ${issues.join("\n5. ")}`,
      { apex, issues, safetyNote: "DNS query のみ。" },
      "Low。 多くの program で informational 扱い。但し phishing が報告 scope なら Medium 化。"
    );
    count++;
  }
  return count;
}

// === 6. Web Cache Deception ===
export async function runWebCacheDeceptionCheck(scanId: string, targetUrl: string) {
  reportSubStep("Web cache deception プローブ");
  const program = makeScanCtx(scanId, targetUrl);
  const allowed = safeJsonParse<string[]>(program.allowedDomains, []);
  const hosts = [...new Set(allowed.map((d) => d.replace(/^\*\./, "").replace(/^https?:\/\//, "").split("/")[0]))].filter(isLikelyValidApex).slice(0, 3);
  try { hosts.unshift(new URL(targetUrl).host); } catch { /* ignore */ }

  const authPaths = ["/account", "/me", "/api/me", "/profile", "/settings", "/api/account"];
  let count = 0;
  const tested = new Set<string>();
  for (const host of [...new Set(hosts)].slice(0, 3)) {
    if (count >= 3) break;
    for (const path of authPaths) {
      if (count >= 3) break;
      const url = `https://${host}${path}`;
      if (!isUrlInScope(program, url).allowed) continue;
      const k = url;
      if (tested.has(k)) continue;
      tested.add(k);
      const probeUrl = url.replace(/\/+$/, "") + "/cd-test.css";
      const r = await fetchAnon(probeUrl);
      if (!r || r.status !== 200) continue;
      const isCacheable = /(?:public|max-age=\d+)/i.test(String(r.headers["cache-control"] ?? ""));
      if (!isCacheable) continue;
      await createFinding(scanId, `Web Cache Deception (${path}/cd-test.css) [Medium]`, probeUrl, "medium",
        `${probeUrl} に末尾 /cd-test.css を付けて GET したところ 200 + Cache-Control: public で返却。 認証必須エンドポイント ( ${path} ) の応答が CSS 拡張子経由でキャッシュされる可能性 → cache deception で他ユーザー情報漏洩リスク。`,
        `endpoint=${path}, probe=/cd-test.css, cacheControl=${r.headers["cache-control"]}`,
        `1. curl ${probeUrl} → 200 + Cache-Control: public\n2. CDN にキャッシュ → 後続未認証ユーザーが取得すると 認証ユーザー応答を読み取り可能`,
        { probeUrl, status: r.status, cacheControl: r.headers["cache-control"], bodyPreview: r.body.slice(0, 500), safetyNote: "GET 1 リクエストのみ。" },
        "Medium。実機でキャッシュ確定 → 他ユーザー応答取得まで再現できれば High。"
      );
      count++;
    }
  }
  return count;
}

// === 7. Public Error / Debug Surface ===
export async function runPublicDebugSurfaceCheck(scanId: string, targetUrl: string) {
  reportSubStep("公開 debug / error surface 確認");
  const program = makeScanCtx(scanId, targetUrl);
  const allowed = safeJsonParse<string[]>(program.allowedDomains, []);
  const hosts = [...new Set(allowed.map((d) => d.replace(/^\*\./, "").replace(/^https?:\/\//, "").split("/")[0]))].filter(isLikelyValidApex).slice(0, 5);
  try { hosts.unshift(new URL(targetUrl).host); } catch { /* ignore */ }
  const probes: Array<{ p: string; sig: RegExp; sev: "critical" | "high" | "medium" | "low"; label: string }> = [
    { p: "/__nextjs_original-stack-frame", sig: /errorMessage|sourceFiles|originalStackFrame/i, sev: "high", label: "Next.js debug overlay 痕跡" },
    { p: "/@vite/client", sig: /vite|hot.*module|HMRPayload/i, sev: "high", label: "Vite dev server 公開" },
    { p: "/_ignition/health-check", sig: /"can_execute_commands"|"runnable":\s*true/i, sev: "critical", label: "Laravel Ignition ( CVE-2021-3129 RCE )" },
    { p: "/?__debug__", sig: /<title>(?:Werkzeug Debugger|Django.*Error|Stack trace)/i, sev: "critical", label: "Python debug overlay" },
    { p: "/console", sig: /Werkzeug Debugger|<title>Console/i, sev: "critical", label: "Werkzeug console" },
    { p: "/?profile=1", sig: /Symfony Profiler|<title>Web Profiler/i, sev: "high", label: "Symfony profiler param" },
    { p: "/__rspc/__panel", sig: /rspc/i, sev: "medium", label: "RSPC panel" }
  ];
  let count = 0;
  for (const host of [...new Set(hosts)]) {
    if (count >= 4) break;
    for (const probe of probes) {
      if (count >= 4) break;
      const url = `https://${host}${probe.p}`;
      if (!isUrlInScope(program, url).allowed) continue;
      const r = await fetchAnon(url);
      if (!r || r.status !== 200) continue;
      if (!probe.sig.test(r.body)) continue;
      await createFinding(scanId, `${probe.label} [${probe.sev === "critical" ? "Critical" : probe.sev === "high" ? "High" : probe.sev === "medium" ? "Medium" : "Low"}]`, url, probe.sev,
        `${url} で ${probe.label} を確認。本番環境で debug が有効 = stack trace / 内部情報漏洩 / RCE 経路の可能性。`,
        `host=${host}, path=${probe.p}, status=200`,
        `1. curl ${url} → 200 + ${probe.label}`,
        { url, bodyPreview: r.body.slice(0, 1200), safetyNote: "GET 1 リクエストのみ。実 RCE は試行していない。" },
        probe.sev === "critical" ? "Critical 確定。即報告候補。" : "影響範囲確認後。"
      );
      count++;
    }
  }
  return count;
}

/** scan-runner.ts から呼ばれる統合エントリポイント */
export async function runExternalMiscChecks(scanId: string, targetUrl: string): Promise<void> {
  await Promise.allSettled([
    runOpenapiDeepExtraction(scanId, targetUrl),
    runGraphqlSchemaDeep(scanId, targetUrl),
    runDirectoryListingCheck(scanId, targetUrl),
    runBackupAndConfigCheck(scanId, targetUrl),
    runDnsEmailSecurityCheck(scanId, targetUrl),
    runWebCacheDeceptionCheck(scanId, targetUrl),
    runPublicDebugSurfaceCheck(scanId, targetUrl),
  ]);
}
