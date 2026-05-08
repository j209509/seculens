// Rate Limit 欠落検出。
// 戦略 ( 慎重実装 ):
//   1. auth 系 ( login / forgot / reset / verify ) など
//      「人間が短時間に何度も叩かない」エンドポイントを probe
//   2. 「無害化したペイロード」で 20 リクエスト連続送信 ( 並列ではなく 100ms 間隔 )
//      - パスワードフィールドは "x" ( format error 確実 ) に置換
//      - email / username は absolutely-non-existent な testing host 上の値に置換
//   3. 全 20 リクエストの結果を見て:
//      a) 全部 200 / 4xx 応答で 429 / 503 / Retry-After も無く、ブロックされた様子無し → rate limit 欠落
//      b) 途中から 429 / 503 が返る → rate limit 有り ( 安全 )
// 安全策:
//   - 1 endpoint 20 リクエストまで
//   - login の場合は password を "x" 固定 ( 実ブルートフォースじゃない )
//   - 1 program 1 endpoint だけ probe ( 影響最小化 )

import { chromium } from "playwright";
import crypto from "node:crypto";
import { isUrlInScope } from "@/lib/scope";
import { maskBody } from "@/lib/mask";
import { makeScanCtx, createScanFinding, findExistingScanFinding } from "@/lib/scan-adapter";

const RATELIMIT_PATH_RE = /\/(?:login|signin|sign-in|forgot[-_]?password|reset[-_]?password|forgot|reset|recover|verify[-_]?email|verify[-_]?otp|verify-?2fa|otp|tfa|mfa|send[-_]?code|resend[-_]?code|send[-_]?email)\b/i;
const PROBE_COUNT = 20;
const INTER_REQUEST_MS = 100;

// Common auth paths to probe when httpTraffic is unavailable
const AUTH_PATHS = [
  "/api/auth/login",
  "/api/login",
  "/login",
  "/api/signin",
  "/signin",
  "/api/auth/signin",
  "/api/forgot-password",
  "/api/auth/forgot-password",
  "/api/reset-password",
  "/api/verify-email"
];

async function postProbe(url: string, contentType: string): Promise<{ status: number; bodySize: number; retryAfter: string | null; ms: number }> {
  const start = Date.now();
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    const fakeEmail = `rl-${crypto.randomBytes(3).toString("hex")}@bb-rl-test.example.com`;
    const body = JSON.stringify({ email: fakeEmail, password: "x" });
    const res = await page.request.fetch(url, {
      method: "POST",
      data: body,
      headers: { "content-type": contentType },
      failOnStatusCode: false,
      timeout: 8000
    });
    const respBody = await res.text().catch(() => "");
    const headers = res.headers();
    await context.close();
    return {
      status: res.status(),
      bodySize: respBody.length,
      retryAfter: headers["retry-after"] ?? null,
      ms: Date.now() - start
    };
  } finally {
    await browser.close();
  }
}

export async function runRateLimitCheck(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  const base = new URL(targetUrl).origin;
  const tested = new Set<string>();
  let count = 0;

  // 1 program あたり最大 1 endpoint だけ probe ( 影響最小化 )
  for (const path of AUTH_PATHS) {
    if (count >= 1) break;
    const url = `${base}${path}`;
    if (!isUrlInScope(program, url).allowed) continue;
    if (!RATELIMIT_PATH_RE.test(path)) continue;
    if (tested.has(url)) continue;
    tested.add(url);

    const ct = "application/json";
    const results: Array<{ status: number; bodySize: number; retryAfter: string | null; ms: number }> = [];
    let blocked = false;
    let captchaSignal = false;

    try {
      // First check if endpoint exists
      const firstResult = await postProbe(url, ct);
      if (firstResult.status === 404 || firstResult.status === 405) continue;
      results.push(firstResult);
      if (firstResult.status === 429 || firstResult.status === 503 || firstResult.retryAfter) { blocked = true; }

      if (!blocked) {
        for (let i = 1; i < PROBE_COUNT; i++) {
          const r = await postProbe(url, ct);
          results.push(r);
          if (r.status === 429 || r.status === 503 || r.retryAfter) { blocked = true; break; }
          if (results.length >= 5 && Math.abs(r.bodySize - results[0].bodySize) > 500 && !captchaSignal) {
            captchaSignal = true;
          }
          await new Promise((res) => setTimeout(res, INTER_REQUEST_MS));
        }
      }
    } catch (e) {
      console.error(`[rate-limit] probe failed for ${url}: ${e instanceof Error ? e.message : e}`);
      continue;
    }

    if (blocked) continue; // rate limit 有り → 健全
    const statuses = results.map((r) => r.status);
    const uniqStatus = [...new Set(statuses)];
    const allSimilar = uniqStatus.length <= 2 && !captchaSignal;
    if (!allSimilar) continue;

    const severity: "high" | "medium" = captchaSignal ? "medium" : "high";
    const sev: string = severity;
    const sevLabel = sev === "high" ? "High" : "Medium";
    const taggedType = `Rate Limit 欠落候補 (${path}) [${sevLabel}]`;
    const target = `POST ${base}${path}`;
    const existing = await findExistingScanFinding(scanId, taggedType, target);
    if (existing) continue;

    await createScanFinding(scanId, {
      type: taggedType,
      target,
      severity,
      impact: `${target} に ${PROBE_COUNT} リクエストを連続送信 ( 100ms 間隔 ) しましたが、429 / 503 / Retry-After / captcha のいずれも観測されず、全リクエストが正常に処理されました ( ステータス: ${uniqStatus.join(", ")} )。auth / OTP / password reset 系で rate limit が無いと、攻撃者は brute-force / OTP 全数試行 / メール送信 abuse / アカウント列挙の高速化が可能です。`,
      inScopeReason: `収集済み許可ドメイン内の auth 系エンドポイント`,
      evidence: `endpoint=${target}, probeCount=${results.length}, uniqueStatuses=${uniqStatus.join(",")}, captchaSignal=${captchaSignal}, blocked=false`,
      requestResponseDiff: maskBody("application/json", JSON.stringify({
        endpoint: target,
        probeCount: results.length,
        interRequestMs: INTER_REQUEST_MS,
        uniqueStatuses: uniqStatus,
        firstResultStatus: results[0]?.status,
        lastResultStatus: results[results.length - 1]?.status,
        avgMs: Math.round(results.reduce((a, b) => a + b.ms, 0) / results.length),
        captchaSignal,
        retryAfterEverSeen: results.some((r) => r.retryAfter),
        safetyNote: `password は format error 確実な 'x' に置換。実 brute-force は試行していない。 1 endpoint ${PROBE_COUNT} リクエストまで。test 専用 fake email を使用。 1 program あたり 1 endpoint のみ probe。`
      }, null, 2)),
      reproductionSteps: `1. POST ${target} に format error な値 ( password='x' / 存在しないメアド ) で ${PROBE_COUNT} 回連続リクエスト送信\n2. 全 ${PROBE_COUNT} リクエストが正常応答 ( ${uniqStatus.join(", ")} ) で 429 / Retry-After / captcha 出現せず\n3. 攻撃者は brute-force / OTP 全数 / メール abuse / 列挙等を阻止されず実行可能`,
      aiWorthSending: severity === "high" ? "Rate limit 欠落は単独で Medium-High。OTP / 2FA / login と組み合わせると account takeover 連鎖の起点になる。報告候補。" : "captcha が途中で出現した可能性あり。実機で挙動確認推奨。",
      bountyLikelihood: severity === "high" ? "high" : "medium",
      recommendedAction: "manual_verify"
    });
    count++;
  }
  return count;
}
