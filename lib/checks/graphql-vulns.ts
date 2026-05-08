/* eslint-disable */
// GraphQL 特化脆弱性検出。
// httpTraffic の代わりに targetUrl から既知 GraphQL パスを probe する

import { chromium } from "playwright";
import { isUrlInScope } from "@/lib/scope";
import { maskBody } from "@/lib/mask";
import { makeScanCtx, createScanFinding, findExistingScanFinding } from "@/lib/scan-adapter";

const GRAPHQL_PATH_RE = /\/(?:graphql|graphiql|gql|graphql-api|api\/graphql|v[0-9]+\/graphql)(\b|\?|$)/i;
const INTROSPECTION_QUERY = `{ __schema { types { name fields { name } } queryType { name } mutationType { name } } }`;
const TYPO_QUERY = `{ usres { id } }`; // typo of "users" - if suggestions enabled, error msg leaks similar field names

async function postGraphql(url: string, query: string, useGet = false): Promise<{ status: number; body: string; ms: number }> {
  const start = Date.now();
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    let res;
    if (useGet) {
      const u = new URL(url);
      u.searchParams.set("query", query);
      res = await page.request.fetch(u.toString(), { method: "GET", failOnStatusCode: false, timeout: 10000 });
    } else {
      res = await page.request.fetch(url, {
        method: "POST",
        data: JSON.stringify({ query }),
        headers: { "content-type": "application/json" },
        failOnStatusCode: false,
        timeout: 10000
      });
    }
    const body = await res.text().catch(() => "");
    await context.close();
    return { status: res.status(), body: body.slice(0, 6000), ms: Date.now() - start };
  } finally {
    await browser.close();
  }
}

async function postGraphqlBatch(url: string): Promise<{ status: number; body: string }> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    const batch = Array(5).fill(0).map((_, i) => ({ query: `query Q${i} { __typename }` }));
    const res = await page.request.fetch(url, {
      method: "POST",
      data: JSON.stringify(batch),
      headers: { "content-type": "application/json" },
      failOnStatusCode: false,
      timeout: 10000
    });
    const body = await res.text().catch(() => "");
    await context.close();
    return { status: res.status(), body: body.slice(0, 4000) };
  } finally {
    await browser.close();
  }
}

export async function runGraphqlVulnsCheck(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);

  // Probe known GraphQL paths on target + allowed domains
  const base = new URL(targetUrl).origin;
  const gqlPaths = ["/graphql", "/graphiql", "/api/graphql", "/v1/graphql", "/gql", "/query"];
  const endpoints = new Map<string, string>();
  for (const p of gqlPaths) {
    const epUrl = `${base}${p}`;
    if (isUrlInScope(program, epUrl).allowed && GRAPHQL_PATH_RE.test(p)) {
      endpoints.set(epUrl, epUrl);
    }
  }

  let count = 0;
  for (const [_, epUrl] of endpoints) {
    if (count >= 5) break;
    const issues: string[] = [];
    let severity: "critical" | "high" | "medium" | "low" = "low";
    const evidence: Record<string, unknown> = {};
    try {
      // 1. Introspection
      const intro = await postGraphql(epUrl, INTROSPECTION_QUERY);
      const introEnabled = intro.status < 400 && /"__schema"\s*:/.test(intro.body) && /"types"\s*:/.test(intro.body);
      evidence.introspection = { status: intro.status, enabled: introEnabled, bodyPreview: intro.body.slice(0, 400) };
      if (introEnabled) {
        issues.push("Introspection クエリが有効 ( 攻撃者が schema を完全に取得して mutation や hidden field を発見可能 )");
        severity = "medium";
      }
      // 2. Field suggestions ( typo 修正 )
      const typo = await postGraphql(epUrl, TYPO_QUERY);
      const suggestEnabled = typo.status < 500 && /Did you mean ['"]?(?:users|user)['"]?/i.test(typo.body);
      evidence.fieldSuggestions = { status: typo.status, enabled: suggestEnabled, bodyPreview: typo.body.slice(0, 300) };
      if (suggestEnabled) {
        issues.push("Field suggestions が有効 ( typo に対して類似 field 名を返すため schema 構造が推測可能 )");
        if (severity === "low") severity = "medium";
      }
      // 3. Query batching
      const batch = await postGraphqlBatch(epUrl);
      const batchEnabled = batch.status < 400 && (batch.body.startsWith("[") || /"data"\s*:.*"data"\s*:/.test(batch.body));
      evidence.queryBatching = { status: batch.status, enabled: batchEnabled, bodyPreview: batch.body.slice(0, 300) };
      if (batchEnabled) {
        issues.push("Query batching が有効 ( 1 リクエストで複数クエリ実行可能、rate limit / brute-force 軽減策の bypass に利用可能 )");
        if (severity === "low") severity = "medium";
      }
      // 4. GET method での query 実行 ( CSRF 経路化リスク )
      const getMethod = await postGraphql(epUrl, "{ __typename }", true);
      const getEnabled = getMethod.status < 400 && /__typename/.test(getMethod.body);
      evidence.getMethodEnabled = { status: getMethod.status, enabled: getEnabled };
      if (getEnabled) {
        issues.push("GET メソッドでクエリ受け入れ ( ブラウザ image / link 経由で発火可能、CSRF 化リスク。mutation も GET で動けば critical )");
        if (severity === "low") severity = "medium";
      }
    } catch (e) {
      evidence.error = String(e);
    }
    if (issues.length === 0) continue;
    const sev: string = severity;
    const sevLabel = sev === "critical" ? "Critical" : sev === "high" ? "High" : sev === "medium" ? "Medium" : "Low";
    const taggedType = `GraphQL 設定問題 (${issues.length} 項目) [${sevLabel}]`;
    const target = epUrl;
    const existing = await findExistingScanFinding(scanId, taggedType, target);
    if (existing) continue;
    await createScanFinding(scanId, {
      type: taggedType,
      target,
      severity,
      impact: `${epUrl} は GraphQL エンドポイントで、以下の本番環境では推奨されない設定が確認されました: ${issues.join(" / ")}。これらは単独で High バグになることは少ないですが、組み合わせ ( introspection + field suggestions ) で hidden mutation や非公開 query を発見されると authn / authz バイパスや mass assignment 等の致命的バグの土台になります。`,
      inScopeReason: `収集済み許可ドメイン内の GraphQL エンドポイント`,
      evidence: `endpoint=${epUrl}, issuesCount=${issues.length}, items=${issues.map((i) => i.split("(")[0].trim()).join(",")}`,
      requestResponseDiff: maskBody("application/json", JSON.stringify({
        endpoint: epUrl,
        issues,
        ...evidence,
        safetyNote: "mutation は試行していない。深い nested query での DoS も試行していない。各 issue 確認に 1 リクエストずつのみ。"
      }, null, 2)),
      reproductionSteps: `1. POST ${epUrl} に { __schema { types { name } } } を送信 → Introspection 結果確認\n2. POST ${epUrl} に { usres { id } } を送信 → Did you mean suggestion 確認\n3. POST ${epUrl} に [{ query: "{ __typename }" }, ...] を送信 → batch 受け入れ確認\n4. GET ${epUrl}?query={__typename} → GET method 受け入れ確認`,
      aiWorthSending: "GraphQL 設定問題は単独では Low-Medium だが、schema 漏洩 + hidden mutation 発見の組み合わせで High に化ける典型。schema を頂いた後の手動探索が High バグの起点になる。",
      bountyLikelihood: sev === "critical" ? "very_high" : sev === "high" ? "high" : "medium",
      recommendedAction: sev === "high" ? "report_now" : "manual_verify"
    });
    count++;
  }
  return count;
}
