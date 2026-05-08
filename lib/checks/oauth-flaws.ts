// OAuth / SSO フロー欠陥検出。
// 戦略:
//   1. targetUrl の既知 OAuth パスを probe
//      ( /oauth / /authorize / /authorization / /sso / /openid / /connect/authorize 等 )
//   2. 認可リクエスト URL から query パラメータを解析:
//      a) state パラメータの有無 → 無ければ login CSRF 余地
//      b) PKCE ( code_challenge ) の有無 → モバイル / SPA で無ければ脆弱
//      c) redirect_uri の検証強度 → 攻撃者ホストに変えて 200 を返すか
//      d) scope のバリデーション → 元より広い scope を指定して通るか
//      e) response_type=token ( implicit ) の使用 → 古い不安全な flow

import { chromium } from "playwright";
import { isUrlInScope } from "@/lib/scope";
import { maskBody } from "@/lib/mask";
import { makeScanCtx, createScanFinding, findExistingScanFinding } from "@/lib/scan-adapter";

const OAUTH_PATH_RE = /\/(?:oauth\/?(?:v?[0-9]+\/)?(?:authorize|authorization)|authorize|sso\/authorize|openid|connect\/authorize|saml|sso\/saml)\b/i;
const ATTACKER_REDIRECT = "https://evil-oauth-test-bbagent.example.com/cb";

// Common OAuth/SSO paths to probe
const OAUTH_PATHS = [
  "/oauth/authorize",
  "/oauth2/authorize",
  "/authorize",
  "/sso/authorize",
  "/openid/authorize",
  "/connect/authorize",
  "/auth/authorize",
  "/api/oauth/authorize",
  "/saml/sso",
  "/sso/saml"
];

async function fetchManual(url: string): Promise<{ status: number; location: string | null; body: string }> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    const res = await page.request.fetch(url, { method: "GET", failOnStatusCode: false, timeout: 10000, maxRedirects: 0 });
    const body = await res.text().catch(() => "");
    const headers = res.headers();
    await context.close();
    return { status: res.status(), location: headers["location"] ?? null, body: body.slice(0, 3000) };
  } finally {
    await browser.close();
  }
}

export async function runOauthFlawsCheck(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  const base = new URL(targetUrl).origin;

  const tested = new Set<string>();
  let count = 0;

  for (const path of OAUTH_PATHS) {
    if (count >= 4) break;
    const epUrl = `${base}${path}`;
    if (!isUrlInScope(program, epUrl).allowed) continue;
    if (!OAUTH_PATH_RE.test(path)) continue;
    if (tested.has(epUrl)) continue;
    tested.add(epUrl);

    try {
      // Fetch the OAuth endpoint to see if it responds
      const initial = await fetchManual(epUrl);
      // Skip if totally unreachable
      if (initial.status === 404) continue;

      const u = new URL(epUrl);
      const issues: string[] = [];
      let severity: "critical" | "high" | "medium" | "low" = "low";
      const evidence: Record<string, unknown> = {};

      // a) Test state param requirement - probe without state
      const noStateUrl = new URL(epUrl);
      noStateUrl.searchParams.set("response_type", "code");
      noStateUrl.searchParams.set("client_id", "test-client");
      noStateUrl.searchParams.set("redirect_uri", `${base}/callback`);
      const noStateRes = await fetchManual(noStateUrl.toString());
      evidence.noStateProbe = { status: noStateRes.status, location: noStateRes.location };
      if (noStateRes.status >= 200 && noStateRes.status < 500 &&
          !/(invalid_request|missing.*state|state.*required)/i.test(noStateRes.body)) {
        issues.push("state パラメータ無し ( login CSRF 攻撃可能、被害者を攻撃者の OAuth セッションに紐付けられる )");
        severity = "high";
      }

      // b) PKCE check - probe without code_challenge
      const noPkceUrl = new URL(epUrl);
      noPkceUrl.searchParams.set("response_type", "code");
      noPkceUrl.searchParams.set("client_id", "test-client");
      noPkceUrl.searchParams.set("redirect_uri", `${base}/callback`);
      noPkceUrl.searchParams.set("state", "teststate123");
      const noPkceRes = await fetchManual(noPkceUrl.toString());
      evidence.noPkceProbe = { status: noPkceRes.status };
      if (noPkceRes.status >= 200 && noPkceRes.status < 400 &&
          !/(pkce|code_challenge.*required)/i.test(noPkceRes.body)) {
        issues.push("PKCE ( code_challenge ) 無し ( モバイル / SPA で authorization code interception の余地 )");
        if (severity === "low") severity = "medium";
      }

      // c) implicit flow check
      const implicitUrl = new URL(epUrl);
      implicitUrl.searchParams.set("response_type", "token");
      implicitUrl.searchParams.set("client_id", "test-client");
      implicitUrl.searchParams.set("redirect_uri", `${base}/callback`);
      const implicitRes = await fetchManual(implicitUrl.toString());
      evidence.implicitProbe = { status: implicitRes.status };
      if (implicitRes.status >= 200 && implicitRes.status < 400 &&
          !/(unsupported_response_type|invalid)/i.test(implicitRes.body)) {
        issues.push("response_type=token ( implicit flow / token leak の余地、URL fragment にトークンが残留 )");
        if (severity === "low") severity = "medium";
      }

      // d) redirect_uri validation probe
      const redirectProbeUrl = new URL(epUrl);
      redirectProbeUrl.searchParams.set("response_type", "code");
      redirectProbeUrl.searchParams.set("client_id", "test-client");
      redirectProbeUrl.searchParams.set("redirect_uri", ATTACKER_REDIRECT);
      redirectProbeUrl.searchParams.set("state", "teststate123");
      try {
        const probe = await fetchManual(redirectProbeUrl.toString());
        evidence.redirectUriProbe = { probedTo: ATTACKER_REDIRECT, status: probe.status, location: probe.location };
        if (probe.status >= 200 && probe.status < 300 && /(login|authorize|consent|sign[-_]?in)/i.test(probe.body)) {
          issues.push(`redirect_uri を ${ATTACKER_REDIRECT} に変えても認可画面が表示される ( ホワイトリスト検証が緩い、攻撃者ホストへの code/token 漏洩可能性 )`);
          severity = "critical";
        } else if (probe.status >= 300 && probe.status < 400 && probe.location?.includes("evil-oauth-test")) {
          issues.push(`redirect_uri を ${ATTACKER_REDIRECT} に変えると ${probe.status} で攻撃者ホストにリダイレクト ( 完全なホワイトリスト不備、認証 token を窃取可能 )`);
          severity = "critical";
        }
      } catch (e) {
        evidence.redirectUriProbeError = String(e);
      }

      if (issues.length === 0) continue;
      const sev: string = severity;
      const sevLabel = sev === "critical" ? "Critical" : sev === "high" ? "High" : sev === "medium" ? "Medium" : "Low";
      const taggedType = `OAuth フロー欠陥 (${issues.length} 項目) [${sevLabel}]`;
      const target = `${u.origin}${u.pathname}`;
      const existing = await findExistingScanFinding(scanId, taggedType, target);
      if (existing) continue;

      await createScanFinding(scanId, {
        type: taggedType,
        target,
        severity: severity === "critical" ? "critical" : severity === "high" ? "high" : "medium",
        impact: `${target} は OAuth / SSO 認可エンドポイントで以下の問題が確認されました: ${issues.join(" / ")}。OAuth flow の不備は account takeover / 認証トークン窃取に直結し、ターゲットが SSO で他サービス連携してる場合は被害が広範囲に及びます。`,
        inScopeReason: `収集済み許可ドメイン内の OAuth / SSO エンドポイント`,
        evidence: `endpoint=${target}, issues=${issues.length}, severity=${severity}`,
        requestResponseDiff: maskBody("application/json", JSON.stringify({
          endpoint: target,
          issues,
          ...evidence,
          safetyNote: "redirect_uri probe は 1 リクエストのみ。実 OAuth code / token の交換 / 詐取は実施していない。"
        }, null, 2)),
        reproductionSteps: `1. ${target} の認可リクエストを観察\n2. ${issues.join("\n3. ")}\n4. attacker は redirect_uri ホワイトリスト不備を悪用してフィッシング → token 窃取 → account takeover`,
        aiWorthSending: sev === "critical" ? "Critical: redirect_uri 検証不備は典型的 account takeover の起点。$1000-10000 級の bounty 対象。" : sev === "high" ? "High: state 欠落 / login CSRF は中位 bounty。" : "Medium: 設計レビュー寄り。",
        bountyLikelihood: sev === "critical" ? "very_high" : sev === "high" ? "high" : "medium",
        recommendedAction: sev === "critical" ? "report_now" : "manual_verify"
      });
      count++;
    } catch { /* skip */ }
  }
  return count;
}
