/* eslint-disable */
// 2FA / OTP バイパス検出。
// 戦略 ( 慎重実装 ):
//   1. 既知の 2FA / OTP エンドポイントパスを探索
//      ( /verify-otp / /verify-2fa / /mfa / /tfa / /2fa / verify-code 等 )
//   2. 静的解析:
//      a) OTP コード長を観測 ( 4 桁なら brute force 余地大 )
//   3. 動的検証 ( 実 OTP 知らない前提なので限定的 ):
//      a) 2FA verification endpoint に「明らかに無効な OTP ( "000000" ) 」を 10 回送って rate limit が無いか
// 安全策:
//   - 実 brute force は禁止 ( 1 endpoint あたり probe 10 回まで、固定 "000000" のみ )
//   - 1 endpoint のみ probe

import { chromium } from "playwright";
import { isUrlInScope } from "@/lib/scope";
import { maskBody } from "@/lib/mask";
import { makeScanCtx, createScanFinding, findExistingScanFinding } from "@/lib/scan-adapter";

const TWOFA_PATH_RE = /\/(?:verify[-_]?otp|verify[-_]?2fa|verify[-_]?mfa|verify[-_]?tfa|verify[-_]?code|otp[-_]?verify|2fa[-_]?verify|mfa[-_]?verify|tfa[-_]?verify|2fa|tfa|mfa|otp|two[-_]?factor|second[-_]?factor)(\b|\?|\/|$)/i;
const PROBE_COUNT = 10;

const TWOFA_CANDIDATE_PATHS = [
  "/api/auth/verify-otp",
  "/api/auth/verify-2fa",
  "/api/auth/mfa/verify",
  "/api/auth/tfa/verify",
  "/api/2fa/verify",
  "/api/mfa/verify",
  "/api/verify-otp",
  "/api/verify-code",
  "/api/otp/verify",
  "/auth/verify-otp",
  "/auth/mfa",
  "/api/v1/auth/mfa/verify",
  "/api/v1/2fa/verify"
];

async function postOtp(url: string, contentType: string, otpValue: string): Promise<{ status: number; body: string; setCookie: string | null }> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    let body: string;
    if (contentType.includes("json")) {
      body = JSON.stringify({ code: otpValue, otp: otpValue });
    } else {
      body = new URLSearchParams({ code: otpValue, otp: otpValue }).toString();
    }
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
      body: respBody.slice(0, 4000),
      setCookie: headers["set-cookie"] ?? null
    };
  } finally {
    await browser.close();
  }
}

async function fetchPage(url: string): Promise<{ status: number; body: string }> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    const res = await page.request.fetch(url, { method: "GET", failOnStatusCode: false, timeout: 8000 });
    const body = await res.text().catch(() => "");
    await context.close();
    return { status: res.status(), body };
  } finally {
    await browser.close();
  }
}

export async function runTwofaBypassCheck(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  const base = new URL(targetUrl).origin;
  const tested = new Set<string>();
  let count = 0;

  // Collect 2FA candidate URLs from main page links
  const candidateUrls: string[] = [];
  try {
    const mainPage = await fetchPage(targetUrl);
    const linkMatches = mainPage.body.matchAll(/(?:action|href)=["']([^"']+)["']/gi);
    for (const m of linkMatches) {
      try {
        const u = new URL(m[1], base);
        if (isUrlInScope(program, u.toString()).allowed && TWOFA_PATH_RE.test(u.pathname)) {
          candidateUrls.push(u.toString());
          if (candidateUrls.length >= 6) break;
        }
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }

  // Add known 2FA paths
  for (const path of TWOFA_CANDIDATE_PATHS) {
    const u = `${base}${path}`;
    if (!candidateUrls.includes(u)) candidateUrls.push(u);
  }

  for (const candidateUrl of candidateUrls.slice(0, 15)) {
    if (count >= 2) break; // Safety: probe very few endpoints
    if (!isUrlInScope(program, candidateUrl).allowed) continue;

    const u = new URL(candidateUrl);
    if (!TWOFA_PATH_RE.test(u.pathname)) continue;

    const key = `${u.origin}${u.pathname}`;
    if (tested.has(key)) continue;
    tested.add(key);

    const issues: string[] = [];
    let severity: "critical" | "high" | "medium" | "low" = "low";
    const evidence: Record<string, unknown> = {};
    const ct = "application/json";

    // Dynamic: rate limit test - send "000000" 10 times and check for 429 / Retry-After
    try {
      const probeResults: Array<{ status: number; bodySize: number }> = [];
      let blocked = false;
      for (let i = 0; i < PROBE_COUNT; i++) {
        const r = await postOtp(candidateUrl, ct, "000000");
        if (r.status === 404 || r.status === 405) { blocked = true; break; } // endpoint doesn't exist
        probeResults.push({ status: r.status, bodySize: r.body.length });
        if (r.status === 429 || r.status === 503) { blocked = true; break; }
        await new Promise((res) => setTimeout(res, 200));
      }

      if (blocked && probeResults.length === 0) continue; // Endpoint doesn't exist

      evidence.bruteForceProbe = { count: probeResults.length, statuses: probeResults.map((r) => r.status), blocked };

      if (!blocked && probeResults.length >= PROBE_COUNT) {
        const uniq = [...new Set(probeResults.map((r) => r.status))];
        if (uniq.length <= 2 && uniq.every((s) => s !== 429 && s !== 503)) {
          issues.push(`OTP 検証エンドポイントに ${PROBE_COUNT} 回連続で無効 OTP を送ったが rate limit ( 429 / Retry-After ) 無し ( 全 ${uniq.join(", ")} )`);
          severity = "high";
        }
      }
    } catch (e) {
      evidence.bruteForceProbeError = String(e);
      continue;
    }

    if (issues.length === 0) continue;

    const sev: string = severity;
    const sevLabel = sev === "critical" ? "Critical" : sev === "high" ? "High" : sev === "medium" ? "Medium" : "Low";
    const taggedType = `2FA/OTP バイパス候補 (${issues.length} 項目) [${sevLabel}]`;
    const target = `POST ${u.origin}${u.pathname}`;
    const existing = await findExistingScanFinding(scanId, taggedType, target);
    if (existing) continue;

    await createScanFinding(scanId, {
      type: taggedType,
      target,
      severity: (severity as string) === "critical" ? "critical" : (severity as string) === "high" ? "high" : "medium",
      impact: `${target} は 2FA / OTP / MFA 検証エンドポイントですが、以下の問題が確認されました: ${issues.join(" / ")}。攻撃者は被害者のパスワードを既に持ってる前提で 2FA を回避でき、account takeover が成立する可能性が高いです。`,
      inScopeReason: `収集済み許可ドメイン内の 2FA / OTP 検証エンドポイント`,
      evidence: `endpoint=${target}, issues=${issues.length}, severity=${severity}`,
      requestResponseDiff: maskBody("application/json", JSON.stringify({
        endpoint: target,
        issues,
        ...evidence,
        safetyNote: `brute force probe は 1 endpoint ${PROBE_COUNT} 回まで、固定 "000000" のみ ( 全数試行はしていない )。`
      }, null, 2)),
      reproductionSteps: `1. ${target} に対して連続 ${PROBE_COUNT} 回無効 OTP を送信\n2. ${issues.join("\n3. ")}\n4. 攻撃者はパスワード持ってれば 2FA を実質回避して account takeover 可能`,
      aiWorthSending: sev === "high" ? "High: rate limit 無し + 短い OTP は brute force 完全成立。報告候補。" : "Medium: 単独では弱いが組み合わせで High 化。",
      bountyLikelihood: sev === "high" ? "high" : "medium",
      recommendedAction: "manual_verify"
    });
    count++;
  }
  return count;
}
