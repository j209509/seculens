// User / Email Enumeration 検出。
// 戦略:
//   1. signup / login / forgot password 等の auth 系エンドポイントを probe
//   2. 各エンドポイントに「存在しないメアド」と「よく使われるメアド」の 2 種類を送って差分比較
//      - 存在しないメアドは crypto random + @bb-enum-test.example.com で生成
//   3. レスポンスで以下が違えば enumeration 候補:
//      a) ステータスコード差分 ( 200 vs 404 等 )
//      b) ボディサイズ大幅差
//      c) 特定 message 差 ( "User not found" / "Invalid credentials" 等の oracle )
//      d) timing 差 ( 200ms 以上 ) - DB 検索 vs 即拒否でタイミング oracle
// 安全策:
//   - パスワードは絶対に試行しない ( 明らかに間違いな fixed string )
//   - 各 endpoint 2 リクエスト ( 存在しない + ありがちなメアド ) のみ
//   - rate limit 抵触防止のため 500ms 待機

import { chromium } from "playwright";
import crypto from "node:crypto";
import { isUrlInScope } from "@/lib/scope";
import { maskBody } from "@/lib/mask";
import { makeScanCtx, createScanFinding, findExistingScanFinding } from "@/lib/scan-adapter";

const AUTH_PATH_RE = /\/(?:login|signin|sign-in|signup|sign-up|register|registration|forgot[-_]?password|reset[-_]?password|forgot|reset|recover|recovery|verify[-_]?email|check[-_]?email|email[-_]?check|check[-_]?username|username[-_]?check|account[-_]?check|exists)\b/i;

const AUTH_PATHS = [
  "/api/auth/login",
  "/api/login",
  "/login",
  "/api/signin",
  "/signin",
  "/api/auth/signin",
  "/api/forgot-password",
  "/api/auth/forgot-password",
  "/api/register",
  "/api/signup",
  "/api/check-email",
  "/api/email-check"
];

async function postWithEmail(url: string, contentType: string, email: string): Promise<{ status: number; body: string; ms: number }> {
  const start = Date.now();
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    const body = JSON.stringify({ email, password: "x" });
    const res = await page.request.fetch(url, {
      method: "POST",
      data: body,
      headers: { "content-type": contentType },
      failOnStatusCode: false,
      timeout: 10000
    });
    const respBody = await res.text().catch(() => "");
    await context.close();
    return { status: res.status(), body: respBody.slice(0, 4000), ms: Date.now() - start };
  } finally {
    await browser.close();
  }
}

function bodyDiffHints(validBody: string, invalidBody: string): string | null {
  const validHasUserExists = /already (?:exists|registered|in use|taken)|user (?:exists|already)|email (?:exists|already)|account (?:exists|already)/i.test(validBody);
  const invalidHasNoUser = /not (?:found|registered|exist|recognized)|no (?:such )?(?:user|account|email)|user (?:does not|doesn't)|invalid (?:user|email|username|account)|unknown (?:user|email|account)/i.test(invalidBody);
  if (validHasUserExists && !invalidHasNoUser) return `valid 側に「ユーザー既存」を示す文言`;
  if (invalidHasNoUser && !/not (?:found|registered)|no such/i.test(validBody)) return `invalid 側に「ユーザー未登録」を示す文言`;
  const sizeDiff = Math.abs(validBody.length - invalidBody.length);
  if (sizeDiff > 200) return `body サイズ差 ${sizeDiff} bytes ( valid ${validBody.length} / invalid ${invalidBody.length} )`;
  return null;
}

export async function runUserEnumerationCheck(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  const base = new URL(targetUrl).origin;

  // Use a "common" email that might exist vs a random non-existent one
  const commonEmail = `admin@${new URL(targetUrl).hostname}`;

  const tested = new Set<string>();
  let count = 0;

  for (const path of AUTH_PATHS) {
    if (count >= 6) break;
    const url = `${base}${path}`;
    if (!isUrlInScope(program, url).allowed) continue;
    if (!AUTH_PATH_RE.test(path)) continue;
    if (tested.has(url)) continue;
    tested.add(url);

    const ct = "application/json";
    try {
      const fakeEmail = `enum-${crypto.randomBytes(4).toString("hex")}@bb-enum-test.example.com`;
      const validRes = await postWithEmail(url, ct, commonEmail);
      // Skip if endpoint doesn't exist
      if (validRes.status === 404 || validRes.status === 405) continue;
      // rate limit 配慮
      await new Promise((r) => setTimeout(r, 500));
      const invalidRes = await postWithEmail(url, ct, fakeEmail);

      const statusDiff = validRes.status !== invalidRes.status;
      const timingDiff = Math.abs(validRes.ms - invalidRes.ms);
      const hint = bodyDiffHints(validRes.body, invalidRes.body);
      let severity: "high" | "medium" | "low" | null = null;
      const signals: string[] = [];
      if (statusDiff) {
        signals.push(`ステータス差: valid=${validRes.status} / invalid=${invalidRes.status}`);
        severity = "medium";
      }
      if (hint) {
        signals.push(`body 差分: ${hint}`);
        severity = severity === "medium" || severity === "high" ? severity : "medium";
      }
      if (timingDiff > 200) {
        signals.push(`応答時間差: ${timingDiff}ms ( valid ${validRes.ms}ms / invalid ${invalidRes.ms}ms )`);
        if (severity === null) severity = "low";
      }
      if (statusDiff && hint) severity = "high";
      if (!severity) continue;

      const sev: string = severity;
      const sevLabel = sev === "high" ? "High" : sev === "medium" ? "Medium" : "Low";
      const taggedType = `User Enumeration 候補 (${signals.length} 信号) [${sevLabel}]`;
      const target = `POST ${base}${path}`;
      const existing = await findExistingScanFinding(scanId, taggedType, target);
      if (existing) continue;

      await createScanFinding(scanId, {
        type: taggedType,
        target,
        severity: sev === "high" ? "high" : sev === "medium" ? "medium" : "low",
        impact: `${target} に「ありがちなメアド ( ${commonEmail} )」と「存在しないメアド ( ${fakeEmail} )」を送って比較したところ、サーバが両者を区別する信号が確認できました: ${signals.join(" / ")}。攻撃者は外部漏洩リスト等のメアドを次々と試して、対象サービスに登録があるかどうかを oracle 化できます。フィッシング標的化 / 既存アカウントの brute-force 対象選定 / 個人情報マッピングに利用されます。`,
        inScopeReason: `収集済み許可ドメイン内の auth 系 ( ${path} ) エンドポイント`,
        evidence: `endpoint=${target}, signals=${signals.length}, statusDiff=${statusDiff}, hint=${hint ?? "(none)"}, timingDiff=${timingDiff}ms`,
        requestResponseDiff: maskBody("application/json", JSON.stringify({
          commonEmail,
          fakeEmail,
          validStatus: validRes.status,
          invalidStatus: invalidRes.status,
          validBodySize: validRes.body.length,
          invalidBodySize: invalidRes.body.length,
          validMs: validRes.ms,
          invalidMs: invalidRes.ms,
          signals,
          safetyNote: "パスワードは format error 確実な短すぎる値 'x' に置換。実 brute-force は試行していない。各 endpoint 2 リクエスト ( valid + invalid ) のみ、間に 500ms。"
        }, null, 2)),
        reproductionSteps: `1. POST ${target} に一般メアド ( ${commonEmail} ) で送信 → status ${validRes.status}, body ${validRes.body.length}B, ${validRes.ms}ms\n2. POST ${target} に存在しないメアド ( ${fakeEmail} ) で送信 → status ${invalidRes.status}, body ${invalidRes.body.length}B, ${invalidRes.ms}ms\n3. ${signals.join("\n4. ")}\n5. 攻撃者は数千〜数百万メアドのリストを順次送って oracle 化できる`,
        aiWorthSending: sev === "high" ? "明確な oracle あり。報告候補。" : "弱信号のため、別の挙動 ( captcha 有無 / rate limit 強度 ) も併せて影響を判断してください。",
        bountyLikelihood: sev === "high" ? "high" : "medium",
        recommendedAction: "manual_verify"
      });
      count++;
    } catch { /* skip */ }
  }
  return count;
}
