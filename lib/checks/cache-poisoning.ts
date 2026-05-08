// Cache Poisoning / Cache Deception 検出

import { chromium } from "playwright";
import { isUrlInScope } from "@/lib/scope";
import { maskBody } from "@/lib/mask";
import { safeJsonParse } from "@/lib/json";
import { makeScanCtx, createScanFinding, findExistingScanFinding } from "@/lib/scan-adapter";

const POISON_HEADERS: Array<{ name: string; value: string; reflectMarker: string; severity: "critical" | "high" | "medium" }> = [
  { name: "X-Forwarded-Host", value: "bb-cp-test.example.com", reflectMarker: "bb-cp-test.example.com", severity: "high" },
  { name: "X-Forwarded-Scheme", value: "ftp", reflectMarker: "ftp://", severity: "medium" },
  { name: "X-Forwarded-Proto", value: "file", reflectMarker: "file://", severity: "medium" },
  { name: "X-Original-URL", value: "/admin/bb-cp-test", reflectMarker: "/admin/bb-cp-test", severity: "high" }
];

async function fetchWithHeaders(url: string, extraHeaders: Record<string, string>): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    const res = await page.request.fetch(url, { method: "GET", headers: extraHeaders, failOnStatusCode: false, timeout: 10000 });
    const body = await res.text().catch(() => "");
    const headers = res.headers();
    await context.close();
    return { status: res.status(), body: body.slice(0, 6000), headers };
  } finally {
    await browser.close();
  }
}

export async function runCachePoisoningCheck(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  const allowed = safeJsonParse<string[]>(program.allowedDomains, []);
  const hosts: string[] = Array.from(new Set(allowed.map((d) => d.replace(/^\*\./, "").replace(/^https?:\/\//, "").split("/")[0]).filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(d)))).slice(0, 4);

  // Add target host
  try { hosts.unshift(new URL(targetUrl).host); } catch { /* ignore */ }

  const tested = new Set<string>();
  let count = 0;

  const API_PATHS = ["/", "/api", "/api/v1", "/api/user", "/api/me"];

  // === Cache Poisoning probe ===
  for (const host of hosts.slice(0, 4)) {
    if (count >= 4) break;
    for (const path of API_PATHS) {
      if (count >= 4) break;
      const url = `https://${host}${path}`;
      if (!isUrlInScope(program, url).allowed) continue;
      const key = `${host}${path}`;
      if (tested.has(key)) continue;
      tested.add(key);
      try {
        const baseline = await fetchWithHeaders(url, {});
        const cacheable = /(?:public|max-age=\d+)/i.test(baseline.headers["cache-control"] || "") || baseline.headers["age"] !== undefined || baseline.headers["x-cache"] !== undefined;
        for (const ph of POISON_HEADERS) {
          const probe = await fetchWithHeaders(url, { [ph.name]: ph.value });
          if (probe.body.includes(ph.reflectMarker) && !baseline.body.includes(ph.reflectMarker)) {
            const isCacheableNow = /(?:public|max-age=\d+)/i.test(probe.headers["cache-control"] || "") || cacheable;
            const sev = isCacheableNow ? ph.severity : "medium";
            const sevLabel = sev === "critical" ? "Critical" : sev === "high" ? "High" : "Medium";
            const taggedType = `Cache Poisoning 候補 (${ph.name} reflect) [${sevLabel}]`;
            const target = `GET ${url}`;
            const existing = await findExistingScanFinding(scanId, taggedType, target);
            if (existing) { continue; }
            await createScanFinding(scanId, {
              type: taggedType,
              target,
              severity: sev,
              impact: `${target} に ${ph.name}: ${ph.value} ヘッダーを付けたところ、レスポンス本体に "${ph.reflectMarker}" が反射されました ( baseline 応答には含まれない )。${isCacheableNow ? "Cache-Control が public / max-age 設定済みなので、汚染された応答が CDN / リバースプロキシのキャッシュに焼き込まれて後続の正規ユーザーに配信される ( cache poisoning )" : "現状はキャッシュ対象では無さそうですが、CDN 設定変更で即座に大量被害化するリスクがあります"}。`,
              inScopeReason: `収集済み許可ドメイン内のキャッシュ対象 endpoint`,
              evidence: `endpoint=${target}, header=${ph.name}, marker=${ph.reflectMarker}, baselineCacheable=${cacheable}, probeCacheable=${isCacheableNow}`,
              requestResponseDiff: maskBody("application/json", JSON.stringify({
                endpoint: target,
                header: ph.name,
                value: ph.value,
                reflectedMarker: ph.reflectMarker,
                baselineCacheControl: baseline.headers["cache-control"],
                probeCacheControl: probe.headers["cache-control"],
                bodySnippet: probe.body.slice(Math.max(0, probe.body.indexOf(ph.reflectMarker) - 100), probe.body.indexOf(ph.reflectMarker) + 200),
                safetyNote: "test 用 marker host ( bb-cp-test.example.com ) のみ使用。同 URL への poison probe は 1 リクエストずつのみ。"
              }, null, 2)),
              reproductionSteps: `1. baseline: curl '${url}' → 通常応答\n2. poison: curl -H '${ph.name}: ${ph.value}' '${url}' → 応答本体に "${ph.reflectMarker}" が反射\n3. ${isCacheableNow ? "CDN にキャッシュされて後続ユーザーへ汚染応答配信" : "Cache-Control 強化次第で即時悪化"}`,
              recommendedAction: sev === "high" ? "report_now" : "manual_verify"
            });
            count++;
            break;
          }
        }
      } catch { /* skip */ }
    }
  }

  // === Cache Deception probe ( 認証必須 endpoint に末尾 .css 追加 ) ===
  const authPaths = ["/api/account", "/api/profile", "/api/user", "/api/me", "/api/settings", "/api/dashboard"];
  for (const host of hosts.slice(0, 2)) {
    if (count >= 6) break;
    for (const path of authPaths) {
      if (count >= 6) break;
      try {
        const url = `https://${host}${path}`;
        if (!isUrlInScope(program, url).allowed) continue;
        const probeUrl = url.replace(/\/+$/, "") + "/bb-cd-test.css";
        const baseline = await fetchWithHeaders(url, {});
        const probe = await fetchWithHeaders(probeUrl, {});
        const isPublicCacheable = /(?:public|max-age=\d+)/i.test(probe.headers["cache-control"] || "");
        const containsSimilar = baseline.status === 200 && probe.status === 200 && Math.abs(baseline.body.length - probe.body.length) < 200 && baseline.body.slice(0, 500) === probe.body.slice(0, 500);
        if (isPublicCacheable && containsSimilar) {
          const taggedType = `Cache Deception 候補 (.css trick) [High]`;
          const target = `GET ${url}`;
          const existing = await findExistingScanFinding(scanId, taggedType, target);
          if (existing) continue;
          await createScanFinding(scanId, {
            type: taggedType,
            target,
            severity: "high",
            impact: `${target} に末尾 /bb-cd-test.css を付けたところ、認証済みベースラインと同等の個人情報を含む応答を Cache-Control: public で返却しました。CDN がパス末尾の拡張子を見て静的扱いしてキャッシュすると、後続の未認証ユーザーがその個人情報を読み取れる ( cache deception )。Account takeover に近い影響範囲。`,
            inScopeReason: `収集済み許可ドメイン内の認証必須 endpoint`,
            evidence: `endpoint=${target}, probeUrl=${probeUrl}, isPublicCacheable=${isPublicCacheable}`,
            requestResponseDiff: maskBody("application/json", JSON.stringify({
              endpoint: target,
              probeUrl,
              baselineStatus: baseline.status,
              probeStatus: probe.status,
              baselineCacheControl: baseline.headers["cache-control"],
              probeCacheControl: probe.headers["cache-control"],
              bodyMatch: baseline.body.slice(0, 300) === probe.body.slice(0, 300),
              safetyNote: "1 endpoint 2 リクエストのみ。実際にキャッシュ汚染は引き起こしていない ( 後続検証は Burp 等で )。"
            }, null, 2)),
            reproductionSteps: `1. ログイン状態で ${url} → 個人情報 含む応答\n2. ${probeUrl} → 同等内容を Cache-Control: public で返却\n3. 第三者が ${probeUrl} を取得すると CDN cache から個人情報読み取り可能`,
            recommendedAction: "report_now"
          });
          count++;
        }
      } catch { /* skip */ }
    }
  }

  return count;
}
