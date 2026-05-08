// robots.txt / sitemap.xml / .well-known/* から攻撃面を拡大 + 設定ミス検出
// 取得した URL から admin / preview / staging / download 系の sensitive endpoint を抽出して
// 匿名 GET で確認、 200 + 機密データなら Finding。

import { chromium } from "playwright";
import { isUrlInScope } from "@/lib/scope";
import { maskBody } from "@/lib/mask";
import { safeJsonParse } from "@/lib/json";
import { isLikelyValidApex } from "@/lib/domain-validity";
import { makeScanCtx, createScanFinding, findExistingScanFinding } from "@/lib/scan-adapter";
import { reportSubStep } from "@/lib/scan-context";

const WELL_KNOWN_PATHS = [
  "/.well-known/openid-configuration",
  "/.well-known/oauth-authorization-server",
  "/.well-known/change-password",
  "/.well-known/assetlinks.json",
  "/.well-known/apple-app-site-association",
  "/.well-known/dnt-policy.txt",
  "/.well-known/host-meta",
  "/.well-known/webfinger",
  "/.well-known/nodeinfo"
];

async function fetchAnon(url: string): Promise<{ status: number; body: string; contentType: string } | null> {
  try {
    const browser = await chromium.launch({ headless: true });
    try {
      const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
      const page = await ctx.newPage();
      const res = await page.request.fetch(url, { method: "GET", failOnStatusCode: false, timeout: 8000, maxRedirects: 2 });
      const body = await res.text().catch(() => "");
      const headers = res.headers();
      await ctx.close();
      return { status: res.status(), body: body.slice(0, 12000), contentType: headers["content-type"] ?? "" };
    } finally { await browser.close().catch(() => undefined); }
  } catch { return null; }
}

function extractInterestingPaths(robotsOrSitemap: string): string[] {
  const out: string[] = [];
  const lines = robotsOrSitemap.split(/\r?\n/);
  for (const line of lines) {
    const m1 = line.match(/(?:Disallow|Allow|Sitemap):\s*([^\s#]+)/i);
    if (m1) out.push(m1[1]);
  }
  const locMatches = robotsOrSitemap.matchAll(/<loc[^>]*>([^<]+)<\/loc>/gi);
  for (const m of locMatches) out.push(m[1]);
  return [...new Set(out)].filter((u) => /(?:admin|staging|preview|internal|private|backup|download|export|debug|dev|sandbox|api|graphql|console|panel|dashboard|backoffice)/i.test(u));
}

export async function runWellKnownAndRobotsCheck(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  const allowed = safeJsonParse<string[]>(program.allowedDomains, []);
  const hosts = [...new Set(allowed.map((d) => d.replace(/^\*\./, "").replace(/^https?:\/\//, "").split("/")[0]).filter((d) => isLikelyValidApex(d)))].slice(0, 8);
  // Add target host
  try { const th = new URL(targetUrl).host; if (!hosts.includes(th)) hosts.unshift(th); } catch { /* ignore */ }

  let count = 0;
  for (const host of hosts.slice(0, 8)) {
    if (count >= 6) break;
    reportSubStep(`robots.txt を取得中... (${host})`);
    const robotsRes = await fetchAnon(`https://${host}/robots.txt`);
    reportSubStep(`sitemap.xml を解析中... (${host})`);
    const sitemapRes = await fetchAnon(`https://${host}/sitemap.xml`);
    const interestingPaths: string[] = [];
    if (robotsRes && robotsRes.status === 200) interestingPaths.push(...extractInterestingPaths(robotsRes.body));
    if (sitemapRes && sitemapRes.status === 200) interestingPaths.push(...extractInterestingPaths(sitemapRes.body));

    if (interestingPaths.length > 0) reportSubStep("robots.txt の隠しパス検証");
    for (const rawPath of interestingPaths.slice(0, 8)) {
      if (count >= 6) break;
      let fullUrl: string;
      try {
        fullUrl = rawPath.startsWith("http") ? rawPath : `https://${host}${rawPath.startsWith("/") ? rawPath : "/" + rawPath}`;
      } catch { continue; }
      if (!isUrlInScope(program, fullUrl).allowed) continue;
      const r = await fetchAnon(fullUrl);
      if (!r || r.status !== 200) continue;
      const bodyShort = r.body.slice(0, 500).toLowerCase();
      const looksSensitive = /admin|dashboard|user list|customer|invoice|secret|api[-_]?key|token|password|export|backup|preview/.test(bodyShort) || /\.json$/i.test(r.contentType);
      if (!looksSensitive) continue;
      const taggedType = `robots/sitemap 経由 sensitive URL 公開 [Medium]`;
      const target = fullUrl;
      const existing = await findExistingScanFinding(scanId, taggedType, target);
      if (existing) continue;
      await createScanFinding(scanId, {
        type: taggedType,
        target,
        severity: "medium",
        impact: `robots.txt or sitemap.xml に記載されてた URL ${fullUrl} に匿名アクセスしたところ、200 OK で sensitive 系 keyword ( admin / dashboard / customer / invoice / secret 等 ) を含むコンテンツが返却されました。本来 disallow / 非公開のはずの URL が外部から閲覧可能。`,
        inScopeReason: `収集済み許可ドメイン上 + robots/sitemap 由来`,
        evidence: `host=${host}, path=${fullUrl}, status=200, contentType=${r.contentType}`,
        requestResponseDiff: maskBody("text/plain", JSON.stringify({ host, fullUrl, status: r.status, contentType: r.contentType, bodyPreview: r.body.slice(0, 1000), safetyNote: "GET 1 リクエストのみ。" }, null, 2)),
        reproductionSteps: `1. curl https://${host}/robots.txt or sitemap.xml\n2. 抽出された URL ${fullUrl} に GET\n3. 200 + sensitive keyword 含む応答`,
        aiWorthSending: "Medium。endpoint の本来の認可要件次第で High 化。",
        bountyLikelihood: "medium",
        recommendedAction: "manual_verify"
      });
      count++;
    }

    // .well-known 系の機密設定チェック
    reportSubStep(".well-known/* メタデータ確認中");
    for (const wkPath of WELL_KNOWN_PATHS) {
      if (count >= 6) break;
      const url = `https://${host}${wkPath}`;
      if (!isUrlInScope(program, url).allowed) continue;
      const r = await fetchAnon(url);
      if (!r || r.status !== 200) continue;
      if (wkPath.endsWith("openid-configuration") || wkPath.endsWith("oauth-authorization-server")) {
        try {
          const cfg = JSON.parse(r.body) as Record<string, unknown>;
          const issues: string[] = [];
          if (typeof cfg.issuer === "string" && typeof cfg.jwks_uri === "string") {
            try {
              const issuerHost = new URL(String(cfg.issuer)).host;
              const jwksHost = new URL(String(cfg.jwks_uri)).host;
              if (issuerHost !== host && !host.endsWith(issuerHost) && !issuerHost.endsWith(host)) issues.push(`issuer (${issuerHost}) と Host (${host}) が一致しない`);
              if (jwksHost !== issuerHost && !issuerHost.endsWith(jwksHost) && !jwksHost.endsWith(issuerHost)) issues.push(`jwks_uri (${jwksHost}) と issuer (${issuerHost}) が別ドメイン`);
            } catch { /* ignore */ }
          }
          const algs = (cfg.id_token_signing_alg_values_supported as string[]) || [];
          if (algs.includes("none") || algs.includes("None")) issues.push(`id_token_signing_alg に "none" が許可されている ( JWT bypass 経路 )`);
          if (cfg.registration_endpoint) issues.push(`registration_endpoint 公開 ( 動的 client 登録可、wildcard redirect_uri 申請可能性 )`);
          if (issues.length === 0) continue;
          const taggedType = `OIDC / OAuth metadata 設定問題 (${issues.length} 項目) [Medium]`;
          const existing = await findExistingScanFinding(scanId, taggedType, url);
          if (existing) continue;
          await createScanFinding(scanId, {
            type: taggedType,
            target: url,
            severity: "medium",
            impact: `${url} の OIDC/OAuth メタデータに以下の問題: ${issues.join(" / ")}。 issuer 不整合 / "none" alg 許可 / 動的 client 登録は Account Takeover 経路の起点になり得ます。`,
            inScopeReason: `OIDC discovery endpoint`,
            evidence: `url=${url}, issues=${issues.length}`,
            requestResponseDiff: maskBody("application/json", JSON.stringify({ url, issues, configPreview: cfg, safetyNote: "GET 1 リクエストのみ。" }, null, 2)),
            reproductionSteps: `1. curl ${url}\n2. ${issues.join("\n3. ")}`,
            aiWorthSending: "Medium。 issue の組み合わせで High 化 ( e.g. wildcard redirect + alg none )。",
            bountyLikelihood: "medium",
            recommendedAction: "manual_verify"
          });
          count++;
        } catch { /* not JSON */ }
      }
    }
  }
  return count;
}
