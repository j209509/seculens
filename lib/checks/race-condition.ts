// レースコンディション検出 ( 並列リクエストでの状態二重適用 )。
// 戦略:
//   1. 既知の non-idempotent state-changing endpoint パスを探索
//      ( /redeem / /apply-coupon / /claim / /vote / /like / /follow / /add-to-cart / /increment 等 )
//   2. 同 endpoint へ 10 リクエストを Promise.all で並列発火
//   3. レスポンスを集計:
//      a) 全 10 が 2xx で成功 → 確定
//      b) 9 つ以上が 2xx → 高信号
// 安全策:
//   - 1 endpoint 10 リクエストまで
//   - DELETE / 決済本体 ( charge / payment ) は除外
//   - 1 endpoint だけ probe ( 影響最小化 )

import { chromium } from "playwright";
import { isUrlInScope } from "@/lib/scope";
import { maskBody } from "@/lib/mask";
import { makeScanCtx, createScanFinding, findExistingScanFinding } from "@/lib/scan-adapter";

const RACE_CANDIDATE_PATH_RE = /\/(?:redeem|claim|apply[-_]?coupon|apply[-_]?promo|use[-_]?coupon|use[-_]?promo|vote|like|unlike|follow|unfollow|add[-_]?to[-_]?cart|cart\/add|increment|decrement|withdraw[-_]?points|spend[-_]?points|credit|debit|reward|bonus)\b/i;
const PROBE_COUNT = 10;

const RACE_CANDIDATE_PATHS = [
  "/api/redeem",
  "/api/claim",
  "/api/vote",
  "/api/like",
  "/api/follow",
  "/api/cart/add",
  "/api/add-to-cart",
  "/api/apply-coupon",
  "/api/apply-promo",
  "/api/points/redeem",
  "/api/reward/claim",
  "/api/v1/redeem",
  "/api/v1/vote",
  "/api/v1/like",
  "/api/v1/follow"
];

async function fireOne(url: string, method: string): Promise<{ status: number; bodyHash: string }> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    const res = await page.request.fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      data: "{}",
      failOnStatusCode: false,
      timeout: 12000
    });
    const text = await res.text().catch(() => "");
    await context.close();
    const hash = `len=${text.length}|head=${text.slice(0, 100).replace(/\s+/g, "_")}`;
    return { status: res.status(), bodyHash: hash };
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

export async function runRaceConditionCheck(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  const base = new URL(targetUrl).origin;
  const tested = new Set<string>();
  let count = 0;

  // Collect candidate URLs from main page forms/links
  const candidateUrls: string[] = [];
  try {
    const mainPage = await fetchPage(targetUrl);
    const formMatches = mainPage.body.matchAll(/action=["']([^"']+)["']/gi);
    for (const m of formMatches) {
      try {
        const u = new URL(m[1], base);
        if (isUrlInScope(program, u.toString()).allowed && RACE_CANDIDATE_PATH_RE.test(u.pathname)) {
          candidateUrls.push(u.toString());
          if (candidateUrls.length >= 5) break;
        }
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }

  // Add known race candidate paths
  for (const path of RACE_CANDIDATE_PATHS) {
    const u = `${base}${path}`;
    if (!candidateUrls.includes(u)) candidateUrls.push(u);
  }

  for (const candidateUrl of candidateUrls.slice(0, 20)) {
    if (count >= 1) break; // Safety: probe only 1 endpoint
    if (!isUrlInScope(program, candidateUrl).allowed) continue;

    const u = new URL(candidateUrl);
    if (!RACE_CANDIDATE_PATH_RE.test(u.pathname)) continue;

    const key = `POST ${u.origin}${u.pathname}`;
    if (tested.has(key)) continue;
    tested.add(key);

    try {
      // baseline 1 request
      const baseline = await fireOne(candidateUrl, "POST");
      // 404/405 means endpoint doesn't exist
      if (baseline.status === 404 || baseline.status === 405) continue;

      // PROBE_COUNT parallel requests
      const promises = Array(PROBE_COUNT).fill(0).map(() => fireOne(candidateUrl, "POST"));
      const results = await Promise.all(promises);
      const successCount = results.filter((r) => r.status >= 200 && r.status < 300).length;

      // 9+ successes on a non-idempotent endpoint is suspicious
      if (successCount < 9) continue;

      const allFailedConflict = results.filter((r) => r.status === 409 || r.status === 429).length;
      if (allFailedConflict >= 5) continue; // Majority conflict = healthy behavior

      const taggedType = `Race Condition 候補 (${u.pathname}) [High]`;
      const target = `POST ${u.origin}${u.pathname}`;
      const existing = await findExistingScanFinding(scanId, taggedType, target);
      if (existing) continue;

      await createScanFinding(scanId, {
        type: taggedType,
        target,
        severity: "high",
        impact: `${target} は非冪等な state-changing endpoint ( redeem / claim / vote 系 ) ですが、${PROBE_COUNT} リクエストを並列発火したところ ${successCount} 件が成功しました。本来 1 回しか効果が無いはずの操作 ( クーポン使用 / ポイント換金 / 投票 / フォロー ) が複数回適用される race condition が成立する可能性があります。`,
        inScopeReason: `収集済み許可ドメイン内の非冪等 state-changing endpoint`,
        evidence: `endpoint=${target}, baselineStatus=${baseline.status}, parallelCount=${PROBE_COUNT}, successCount=${successCount}, conflictCount=${allFailedConflict}`,
        requestResponseDiff: maskBody("application/json", JSON.stringify({
          endpoint: target,
          baseline,
          parallelResults: results.map((r) => ({ status: r.status, bodyHash: r.bodyHash })),
          successCount,
          conflictCount: allFailedConflict,
          safetyNote: `1 endpoint ${PROBE_COUNT} 並列のみ。DELETE / charge / payment 系 path は除外。 1 endpoint まで。`
        }, null, 2)),
        reproductionSteps: `1. baseline で ${target} に 1 回 → status ${baseline.status}\n2. 同 endpoint に ${PROBE_COUNT} リクエストを Promise.all で並列発火\n3. ${successCount} 件が 2xx で成功 ( 通常は 1 件のみ成功するべき endpoint )\n4. 攻撃者は同様の手順でクーポン重複適用 / ポイント二重取得 / 投票水増し等を実行可能\n5. 実 PoC では Burp Turbo Intruder の HTTP/2 single-packet attack で更に確実な再現が可能`,
        aiWorthSending: "Race condition は確定すれば High-Critical 級。ターゲットの business impact 次第で報告候補。Turbo Intruder 等で再現性確認推奨。",
        bountyLikelihood: "high",
        recommendedAction: "manual_verify"
      });
      count++;
    } catch { /* skip */ }
  }
  return count;
}
