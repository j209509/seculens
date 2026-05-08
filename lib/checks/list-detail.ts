/* eslint-disable */
// 一覧APIに出ないIDが詳細APIで参照可能 (IDOR候補) 検出。
// 戦略:
//   - メインページから内部リンクを抽出
//   - /api/{resource}/{id} パターンのURLを発見
//   - 類似リソース一覧エンドポイントのIDセットと比較
//   - 一覧に無いIDが詳細に存在する場合 → 候補

import { chromium } from "playwright";
import { isUrlInScope } from "@/lib/scope";
import { maskBody } from "@/lib/mask";
import { makeScanCtx, createScanFinding, findExistingScanFinding } from "@/lib/scan-adapter";

// List-like paths
const LIST_PATHS = [
  "/api/users", "/api/user", "/api/products", "/api/orders", "/api/items",
  "/api/documents", "/api/files", "/api/posts", "/api/articles", "/api/tickets",
  "/api/v1/users", "/api/v1/products", "/api/v1/orders",
  "/api/v2/users", "/api/v2/products"
];

function extractIdsFromBody(body: string): string[] {
  const ids = new Set<string>();
  try {
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") {
        for (const [k, val] of Object.entries(v)) {
          if (/^(id|uuid)$/i.test(k) || /Id$/.test(k)) {
            if (typeof val === "string" || typeof val === "number") ids.add(String(val));
          }
          walk(val);
        }
      }
    };
    walk(JSON.parse(body));
  } catch {}
  return [...ids].filter((id) => id.length >= 1 && id.length <= 80).slice(0, 50);
}

async function fetchAnonymous(url: string): Promise<{ status: number; body: string; headers: Record<string, string | string[] | undefined> }> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    const res = await page.request.fetch(url, { method: "GET", failOnStatusCode: false, timeout: 10000 });
    const body = await res.text().catch(() => "");
    const headers = res.headers();
    await context.close();
    return { status: res.status(), body, headers };
  } finally {
    await browser.close();
  }
}

export async function runListDetailMismatchCheck(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  const base = new URL(targetUrl).origin;
  let count = 0;
  const tested = new Set<string>();

  // Collect candidate list URLs from main page links
  const listCandidates: string[] = [];
  try {
    const mainPage = await fetchAnonymous(targetUrl);
    const linkMatches = mainPage.body.matchAll(/href=["']([^"']*\/api\/[^"']+)["']/gi);
    for (const m of linkMatches) {
      try {
        const u = new URL(m[1], base);
        if (isUrlInScope(program, u.toString()).allowed) {
          listCandidates.push(u.toString());
          if (listCandidates.length >= 10) break;
        }
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }

  // Also try common list paths
  for (const path of LIST_PATHS) {
    const u = `${base}${path}`;
    if (!listCandidates.includes(u)) listCandidates.push(u);
  }

  // For each list-like URL, fetch IDs and try to access detail URLs
  for (const listUrl of listCandidates.slice(0, 12)) {
    if (count >= 6) break;
    if (!isUrlInScope(program, listUrl).allowed) continue;

    try {
      const listRes = await fetchAnonymous(listUrl);
      if (listRes.status !== 200) continue;
      const ct = ((listRes.headers["content-type"] ?? "") as string).toLowerCase();
      if (!ct.includes("json")) continue;

      const visibleIds = extractIdsFromBody(listRes.body);
      if (visibleIds.length === 0) continue;

      // Try to find detail endpoint pattern from list URL
      // e.g., /api/users → /api/users/{id}
      const u = new URL(listUrl);
      const basePath = u.pathname.replace(/\/$/, "");

      // Collect IDs that appear in links but not in the list
      // We probe: try sequential IDs around the known ones
      const knownNums = visibleIds.map(Number).filter((n) => !isNaN(n) && n > 0);
      if (knownNums.length === 0) continue;

      const minId = Math.min(...knownNums);
      const maxId = Math.max(...knownNums);
      // Try some IDs outside the visible range
      const candidateIds: string[] = [];
      if (minId > 1) candidateIds.push(String(minId - 1));
      if (minId > 2) candidateIds.push(String(minId - 2));
      candidateIds.push(String(maxId + 1));
      candidateIds.push(String(maxId + 2));

      for (const testId of candidateIds.slice(0, 3)) {
        if (count >= 6) break;
        const detailUrl = `${base}${basePath}/${testId}`;
        const key = `${detailUrl}`;
        if (tested.has(key)) continue;
        tested.add(key);
        if (!isUrlInScope(program, detailUrl).allowed) continue;

        try {
          const detailRes = await fetchAnonymous(detailUrl);
          if (detailRes.status >= 200 && detailRes.status < 300 && detailRes.body.length > 50) {
            const category = "info_leak";
            const taggedType = `一覧APIに出ないIDが詳細APIで参照可能 [Medium]`;
            const target = `GET ${detailUrl}`;
            const existing = await findExistingScanFinding(scanId, taggedType, target);
            if (existing) continue;

            await createScanFinding(scanId, {
              type: taggedType,
              target,
              severity: "medium",
              impact: `一覧API (${listUrl}) には表示されないリソースID (${testId}) が詳細API (${detailUrl}) から直接参照可能でございます。IDORの可能性があります。`,
              inScopeReason: `収集済み許可ドメイン内、一覧APIと詳細APIのID差分`,
              evidence: `listUrl=${listUrl}, detailUrl=${detailUrl}, detailId=${testId}, visibleIdCount=${visibleIds.length}`,
              requestResponseDiff: maskBody("application/json", JSON.stringify({
                listUrl,
                visibleIds: visibleIds.slice(0, 10),
                accessedDetailId: testId,
                detailStatus: detailRes.status,
                detailBodyPreview: detailRes.body.slice(0, 1500)
              }, null, 2)),
              reproductionSteps: `1. ${listUrl} で一覧を取得し、含まれるID一覧を確認 (${testId} は含まれない)\n2. ${detailUrl} に直接アクセス\n3. ${detailRes.status} でリソースが取得できることを確認`,
              aiWorthSending: "一覧と詳細の不整合は典型的なIDOR候補です。認証状態での確認を推奨します。",
              bountyLikelihood: "medium",
              recommendedAction: "manual_verify"
            });
            count++;
          }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }
  return count;
}
