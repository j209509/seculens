// JS バンドル変更検知 / 再スキャン必要性判定。
// 戦略:
//   1. 許可ドメインの JS バンドル URL + SHA256 シグネチャを収集
//   2. 新規 JS アセット / 既存バンドルの変更を検出
//   3. スキャン推奨シグナルを返す
// 注意: 永続化 (AppSetting) がないため、シグネチャの比較は
//       呼び出し元が前回の値を渡すことで行う。

import crypto from "node:crypto";
import { chromium } from "playwright";
import { isUrlInScope } from "@/lib/scope";
import { safeJsonParse } from "@/lib/json";
import { makeScanCtx } from "@/lib/scan-adapter";

export type BundleSignature = { url: string; sha256: string; size: number };

export type ChangeSignal = {
  scanId: string;
  targetUrl: string;
  reasons: string[];
  bundleChanged: boolean;
  newBundleCount: number;
  changedBundleCount: number;
  signatures: BundleSignature[];
};

async function fetchAnonymous(url: string): Promise<{ status: number; body: string }> {
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

export async function captureBundleSignatures(scanId: string, targetUrl: string): Promise<BundleSignature[]> {
  const program = makeScanCtx(scanId, targetUrl);
  const base = new URL(targetUrl).origin;
  const allowed = safeJsonParse<string[]>(program.allowedDomains, []);
  const sigs: BundleSignature[] = [];
  const seen = new Set<string>();

  // Probe the program's main entry to get fresh bundle URLs
  const hostsToProbe: string[] = [new URL(targetUrl).hostname];
  for (const domain of allowed.slice(0, 3)) {
    const cleaned = domain.replace(/^\*\./, "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (cleaned && !hostsToProbe.includes(cleaned)) hostsToProbe.push(cleaned);
  }

  for (const host of hostsToProbe.slice(0, 3)) {
    const indexUrl = `https://${host}/`;
    if (!isUrlInScope(program, indexUrl).allowed && indexUrl !== `${base}/`) continue;
    try {
      const result = await fetchAnonymous(indexUrl);
      const matches = [...result.body.matchAll(/(?:src|href)=["']([^"']+\.js[^"']*)["']/g)].map((m) => m[1]).slice(0, 12);
      for (const matchPath of matches) {
        const jsUrl = matchPath.startsWith("http") ? matchPath : `${base}${matchPath.startsWith("/") ? "" : "/"}${matchPath}`;
        if (seen.has(jsUrl)) continue;
        seen.add(jsUrl);
        if (!isUrlInScope(program, jsUrl).allowed) continue;
        try {
          const js = await fetchAnonymous(jsUrl);
          if (js.status !== 200 || js.body.length < 50) continue;
          const sha = crypto.createHash("sha256").update(js.body.slice(0, 200000)).digest("hex");
          sigs.push({ url: jsUrl, sha256: sha, size: js.body.length });
          if (sigs.length >= 20) break;
        } catch { /* skip */ }
      }
      if (sigs.length >= 20) break;
    } catch { /* skip */ }
  }
  return sigs;
}

/**
 * Compare current JS bundle signatures against previously recorded ones.
 * @param scanId Current scan ID
 * @param targetUrl Target URL
 * @param previousSignatures Previously captured signatures (pass [] for first run)
 */
export async function detectChanges(
  scanId: string,
  targetUrl: string,
  previousSignatures: BundleSignature[] = []
): Promise<ChangeSignal> {
  const newSigs = await captureBundleSignatures(scanId, targetUrl);
  const reasons: string[] = [];
  let bundleChanged = false;
  let newBundleCount = 0;
  let changedBundleCount = 0;

  if (previousSignatures.length === 0) {
    reasons.push(`初回スキャン (バンドル署名未記録、${newSigs.length} 件のバンドルを記録)`);
  } else {
    const oldByUrl = new Map(previousSignatures.map((s) => [s.url, s.sha256]));
    const changedUrls = newSigs.filter((s) => oldByUrl.has(s.url) && oldByUrl.get(s.url) !== s.sha256);
    const newUrls = newSigs.filter((s) => !oldByUrl.has(s.url));
    changedBundleCount = changedUrls.length;
    newBundleCount = newUrls.length;

    if (changedUrls.length > 0) {
      bundleChanged = true;
      reasons.push(`JSバンドル変更: ${changedUrls.length} 件 (例: ${changedUrls[0].url.slice(0, 80)})`);
    }
    if (newUrls.length > 0) {
      bundleChanged = true;
      reasons.push(`新規JSアセット: ${newUrls.length} 件`);
    }
    if (!bundleChanged) {
      reasons.push(`バンドル変更なし (${newSigs.length} 件すべて一致)`);
    }
  }

  return {
    scanId,
    targetUrl,
    reasons,
    bundleChanged,
    newBundleCount,
    changedBundleCount,
    signatures: newSigs
  };
}

/**
 * Check if a rescan is recommended based on change signals.
 */
export function shouldRescan(signal: ChangeSignal, opts?: { minDaysSinceScan?: number; daysSinceScan?: number }): boolean {
  const { daysSinceScan = 0, minDaysSinceScan = 7 } = opts ?? {};
  return signal.bundleChanged || signal.newBundleCount > 0 || daysSinceScan >= minDaysSinceScan;
}
