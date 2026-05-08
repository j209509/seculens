// WebSocket Hijacking 検出 ( CSWSH: Cross-Site WebSocket Hijacking )。
// 戦略:
//   1. WebSocket URL を発見:
//      a) メインページ HTML / JS バンドル内に "ws://" / "wss://" を含む文字列
//      b) 許可ドメインから ws パターンを推定
//   2. 各 WS URL に「攻撃者 Origin 付き」で接続試行 ( null origin )
//   3. 接続成功 + 認証情報通過 → CSWSH 確定
// 安全策:
//   - 接続後即 close ( メッセージ送信 / subscribe しない )
//   - 3 URL まで

import { chromium } from "playwright";
import { isUrlInScope } from "@/lib/scope";
import { safeJsonParse } from "@/lib/json";
import { maskBody } from "@/lib/mask";
import { makeScanCtx, createScanFinding, findExistingScanFinding } from "@/lib/scan-adapter";

const WS_URL_RE = /(wss?:\/\/[a-z0-9.-]+(?::\d+)?(?:\/[^\s'"`<>]*)?)/gi;
const ATTACKER_ORIGIN = "https://evil-ws-test-bbagent.example.com";

async function fetchPageBody(url: string): Promise<string> {
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    const res = await page.request.fetch(url, { method: "GET", failOnStatusCode: false, timeout: 10000 });
    const body = await res.text().catch(() => "");
    await ctx.close();
    return body.slice(0, 100000);
  } finally { await browser.close().catch(() => undefined); }
}

async function discoverWsUrls(program: { allowedDomains: string }, scanId: string, targetUrl: string, maxUrls: number): Promise<string[]> {
  const base = new URL(targetUrl).origin;
  const urls = new Set<string>();

  // Fetch main page and JS bundles
  const pageSources: string[] = [];
  try {
    const mainPage = await fetchPageBody(targetUrl);
    pageSources.push(mainPage);
    // Find JS bundle URLs
    const jsMatches = mainPage.matchAll(/<script[^>]*src=["']([^"']+\.js[^"']*)["']/gi);
    for (const m of jsMatches) {
      try {
        const jsUrl = new URL(m[1], base).toString();
        if (isUrlInScope(program, jsUrl).allowed) {
          const jsBody = await fetchPageBody(jsUrl);
          pageSources.push(jsBody);
          if (pageSources.length >= 4) break;
        }
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }

  for (const body of pageSources) {
    if (!body || body.length < 50) continue;
    for (const m of body.matchAll(WS_URL_RE)) {
      const candidate = m[1];
      try {
        const u = new URL(candidate);
        if (!/^wss?:$/.test(u.protocol)) continue;
        const httpEquiv = `${u.protocol === "wss:" ? "https" : "http"}://${u.host}/`;
        if (!isUrlInScope(program, httpEquiv).allowed) continue;
        urls.add(candidate);
        if (urls.size >= maxUrls) break;
      } catch { /* invalid */ }
    }
    if (urls.size >= maxUrls) break;
  }

  // Also try common WS paths on allowed domains
  const allowed = safeJsonParse<string[]>(program.allowedDomains, []);
  for (const domain of allowed.slice(0, 3)) {
    if (urls.size >= maxUrls) break;
    const cleaned = domain.replace(/^\*\./, "").replace(/^https?:\/\//, "").split("/")[0];
    if (!cleaned) continue;
    const wsGuess = `wss://${cleaned}/ws`;
    const wsGuess2 = `wss://${cleaned}/websocket`;
    for (const wsUrl of [wsGuess, wsGuess2]) {
      if (!urls.has(wsUrl)) {
        urls.add(wsUrl);
        if (urls.size >= maxUrls) break;
      }
    }
  }

  return [...urls];
}

async function attemptCrossOriginWs(wsUrl: string): Promise<{ accepted: boolean; firstFrame: string | null; closeReason: string | null }> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    await page.setContent(`<html><body><div id="r"></div></body></html>`).catch(() => undefined);
    const result = await page.evaluate((url) => {
      return new Promise<{ accepted: boolean; firstFrame: string | null; closeReason: string | null }>((resolve) => {
        try {
          const ws = new WebSocket(url);
          let firstFrame: string | null = null;
          const timer = setTimeout(() => {
            try { ws.close(); } catch { /* ignore */ }
            resolve({ accepted: ws.readyState === 1, firstFrame, closeReason: "timeout-after-3s" });
          }, 3000);
          ws.onopen = () => {
            setTimeout(() => {
              clearTimeout(timer);
              try { ws.close(); } catch { /* ignore */ }
              resolve({ accepted: true, firstFrame, closeReason: "open-then-close" });
            }, 800);
          };
          ws.onmessage = (e) => {
            const data = typeof e.data === "string" ? e.data : "(binary)";
            firstFrame = data.slice(0, 800);
          };
          ws.onerror = () => {
            clearTimeout(timer);
            resolve({ accepted: false, firstFrame, closeReason: "error" });
          };
          ws.onclose = (e) => {
            clearTimeout(timer);
            resolve({ accepted: ws.readyState === 1 || (firstFrame !== null), firstFrame, closeReason: `close-code=${e.code}` });
          };
        } catch (e) {
          resolve({ accepted: false, firstFrame: null, closeReason: `exception: ${e instanceof Error ? e.message : e}` });
        }
      });
    }, wsUrl);
    await context.close();
    return result;
  } finally {
    await browser.close();
  }
}

export async function runWebsocketHijackCheck(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  const wsUrls = await discoverWsUrls(program, scanId, targetUrl, 6);
  if (wsUrls.length === 0) return 0;

  let count = 0;
  for (const wsUrl of wsUrls) {
    if (count >= 3) break;
    try {
      const r = await attemptCrossOriginWs(wsUrl);
      if (!r.accepted) continue;

      const evidenceOfAuth = r.firstFrame !== null && /(authenticated|user|me|welcome|session|connected|hello)/i.test(r.firstFrame);
      const severity: "high" | "medium" = evidenceOfAuth ? "high" : "medium";
      const sev: string = severity;
      const sevLabel = sev === "high" ? "High" : "Medium";
      const taggedType = `WebSocket Hijacking 候補 (Origin 検証不備) [${sevLabel}]`;
      const target = wsUrl;
      const existing = await findExistingScanFinding(scanId, taggedType, target);
      if (existing) continue;

      await createScanFinding(scanId, {
        type: taggedType,
        target,
        severity,
        impact: `${wsUrl} は WebSocket エンドポイントですが、攻撃者 origin ( null / ${ATTACKER_ORIGIN} ) からの接続を accept しました ( Origin 検証不備 )。${evidenceOfAuth ? `さらに認証済を示すメッセージ ( ${r.firstFrame?.slice(0, 100)}... ) が受信されました。` : ""}攻撃者は被害者を悪性ページに誘導することで、WebSocket 経由のリアルタイムデータを傍受 / メッセージ送信 / 操作の代行ができます ( CSWSH: Cross-Site WebSocket Hijacking )。`,
        inScopeReason: `ページ / JS バンドル内から発見または許可ドメイン推定の WebSocket エンドポイント`,
        evidence: `wsUrl=${wsUrl}, accepted=${r.accepted}, evidenceOfAuth=${evidenceOfAuth}, firstFrame=${r.firstFrame?.slice(0, 100) ?? "(none)"}, closeReason=${r.closeReason}`,
        requestResponseDiff: maskBody("application/json", JSON.stringify({
          wsUrl,
          accepted: r.accepted,
          firstFrame: r.firstFrame,
          closeReason: r.closeReason,
          evidenceOfAuth,
          safetyNote: "接続後 800ms で close。サブスクライブ / メッセージ送信は実施していない。受信した最初のフレームのみ確認。"
        }, null, 2)),
        reproductionSteps: `1. 攻撃者ページから new WebSocket("${wsUrl}") で接続\n2. ブラウザは Origin ヘッダーを攻撃者 origin として送信\n3. サーバが Origin チェック無しで accept → 接続成立\n${evidenceOfAuth ? `4. サーバから認証済を示す message ( "${r.firstFrame?.slice(0, 60)}..." ) が届く\n5. 攻撃者は WebSocket 経由のすべてのメッセージを傍受 / 偽装可能` : "4. メッセージ送信能力次第で操作代行が可能"}`,
        aiWorthSending: severity === "high" ? "High: CSWSH は典型的に $1000-5000。報告候補。" : "Medium: 単独では情報量限定。実 WS API 確認後判断。",
        bountyLikelihood: severity === "high" ? "high" : "medium",
        recommendedAction: severity === "high" ? "report_now" : "manual_verify"
      });
      count++;
    } catch { /* skip */ }
  }
  return count;
}
