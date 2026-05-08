// Public Cloud Storage Exposure ( S3 / GCS / Azure Blob / R2 / DO Spaces )
// JS / HTML / sitemap / DNS から bucket URL を抽出し、anonymous で list / read 可能か確認。

import { chromium } from "playwright";
import { promises as dns } from "node:dns";
import { isUrlInScope } from "@/lib/scope";
import { maskBody } from "@/lib/mask";
import { safeJsonParse } from "@/lib/json";
import { isLikelyValidApex } from "@/lib/domain-validity";
import { makeScanCtx, createScanFinding, findExistingScanFinding } from "@/lib/scan-adapter";

type BucketCandidate = { url: string; type: "s3" | "gcs" | "azure" | "r2" | "do_spaces"; bucketName?: string };

const PATTERNS: Array<{ re: RegExp; type: BucketCandidate["type"]; nameGroup: number }> = [
  { re: /https?:\/\/([a-z0-9.\-]+)\.s3\.amazonaws\.com/gi, type: "s3", nameGroup: 1 },
  { re: /https?:\/\/([a-z0-9.\-]+)\.s3[.\-][a-z0-9\-]+\.amazonaws\.com/gi, type: "s3", nameGroup: 1 },
  { re: /https?:\/\/s3[.\-][a-z0-9\-]+\.amazonaws\.com\/([a-z0-9.\-]{3,63})\/?/gi, type: "s3", nameGroup: 1 },
  { re: /https?:\/\/([a-z0-9.\-]+)\.s3-website[.\-][a-z0-9\-]+\.amazonaws\.com/gi, type: "s3", nameGroup: 1 },
  { re: /https?:\/\/storage\.googleapis\.com\/([a-z0-9.\-_]+)/gi, type: "gcs", nameGroup: 1 },
  { re: /https?:\/\/([a-z0-9.\-_]+)\.storage\.googleapis\.com/gi, type: "gcs", nameGroup: 1 },
  { re: /https?:\/\/([a-z0-9]+)\.blob\.core\.windows\.net/gi, type: "azure", nameGroup: 1 },
  { re: /https?:\/\/([a-z0-9.\-]+)\.r2\.cloudflarestorage\.com/gi, type: "r2", nameGroup: 1 },
  { re: /https?:\/\/([a-z0-9.\-]+)\.[a-z]{3}[0-9]\.digitaloceanspaces\.com/gi, type: "do_spaces", nameGroup: 1 }
];

async function fetchHead(url: string): Promise<{ status: number; body: string; headers: Record<string, string | string[] | undefined> } | null> {
  try {
    const browser = await chromium.launch({ headless: true });
    try {
      const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
      const page = await ctx.newPage();
      const res = await page.request.fetch(url, { method: "GET", failOnStatusCode: false, timeout: 8000 });
      const body = await res.text().catch(() => "");
      const headers = res.headers();
      await ctx.close();
      return { status: res.status(), body: body.slice(0, 6000), headers };
    } finally { await browser.close().catch(() => undefined); }
  } catch { return null; }
}

async function fetchPageBody(url: string): Promise<string> {
  try {
    const browser = await chromium.launch({ headless: true });
    try {
      const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
      const page = await ctx.newPage();
      const res = await page.request.fetch(url, { method: "GET", failOnStatusCode: false, timeout: 10000 });
      const body = await res.text().catch(() => "");
      await ctx.close();
      return body.slice(0, 50000);
    } finally { await browser.close().catch(() => undefined); }
  } catch { return ""; }
}

function buildListingUrl(b: BucketCandidate): string {
  switch (b.type) {
    case "s3": return `https://${b.bucketName}.s3.amazonaws.com/?list-type=2&max-keys=10`;
    case "gcs": return `https://storage.googleapis.com/storage/v1/b/${b.bucketName}/o?maxResults=10`;
    case "azure": return `https://${b.bucketName}.blob.core.windows.net/?comp=list&maxresults=10`;
    case "r2": return `https://${b.bucketName}.r2.cloudflarestorage.com/?list-type=2&max-keys=10`;
    case "do_spaces": return `https://${b.url.replace(/^https?:\/\//, "")}/?list-type=2&max-keys=10`;
  }
}

function looksLikeListingResponse(body: string, type: BucketCandidate["type"]): boolean {
  if (type === "s3" || type === "r2" || type === "do_spaces") {
    return /<ListBucketResult|<Contents>|<Key>/i.test(body);
  }
  if (type === "gcs") {
    return /"kind":\s*"storage#objects"/i.test(body) || /"items":\s*\[/i.test(body);
  }
  if (type === "azure") {
    return /<EnumerationResults|<Blobs>|<Blob>/i.test(body);
  }
  return false;
}

function extractBucketsFromText(text: string): Map<string, BucketCandidate> {
  const candidates = new Map<string, BucketCandidate>();
  for (const p of PATTERNS) {
    const re = new RegExp(p.re.source, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const url = m[0].split("?")[0];
      const bucketName = m[p.nameGroup];
      if (!bucketName || bucketName.length < 3 || bucketName.length > 63) continue;
      if (/^(?:www|cdn|static|images?|assets?|public|files?|media|com|amazon|google|microsoft|cloudflare|amazonaws|googleapis|windows|cloudflarestorage|digitaloceanspaces)$/i.test(bucketName)) continue;
      candidates.set(url, { url, type: p.type, bucketName });
      if (candidates.size >= 30) break;
    }
    if (candidates.size >= 30) break;
  }
  return candidates;
}

export async function runPublicCloudStorageCheck(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);

  // Step 1: Fetch main page and extract bucket URLs from body
  const mainPageBody = await fetchPageBody(targetUrl);
  const candidates = extractBucketsFromText(mainPageBody);

  // Step 2: allowedDomains から CNAME を見て bucket 推測
  const allowed = safeJsonParse<string[]>(program.allowedDomains, []);
  for (const d of allowed.slice(0, 20)) {
    const cleaned = d.replace(/^\*\./, "").replace(/^https?:\/\//, "").split("/")[0];
    if (!isLikelyValidApex(cleaned)) continue;
    try {
      const cnames = await dns.resolveCname(cleaned).catch(() => [] as string[]);
      for (const cname of cnames) {
        for (const p of PATTERNS) {
          const m = cname.match(p.re);
          if (m) {
            const url = m[0].split("?")[0];
            const bucketName = (cname.match(p.re)?.[0] ?? "").match(/^([a-z0-9.\-]+)\./)?.[1] ?? cleaned;
            if (!candidates.has(url)) candidates.set(url, { url, type: p.type, bucketName });
          }
        }
      }
    } catch { /* ignore */ }
  }

  // Also try guessing buckets from target hostname
  try {
    const hostname = new URL(targetUrl).hostname;
    const parts = hostname.replace(/^www\./, "").split(".");
    const base = parts[0];
    const guessedBuckets = [base, `${base}-public`, `${base}-static`, `${base}-assets`, `${base}-media`, `${base}-uploads`, `${base}-backup`];
    for (const bucketName of guessedBuckets.slice(0, 3)) {
      const s3Url = `https://${bucketName}.s3.amazonaws.com`;
      if (!candidates.has(s3Url)) candidates.set(s3Url, { url: s3Url, type: "s3", bucketName });
    }
  } catch { /* ignore */ }

  // Step 3: Check each bucket for public listing
  let count = 0;
  for (const b of [...candidates.values()].slice(0, 10)) {
    if (count >= 6) break;
    if (!isUrlInScope(program, b.url).allowed && !b.url.includes(".amazonaws.com") && !b.url.includes("googleapis.com") && !b.url.includes("blob.core.windows.net")) {
      // Allow cloud storage URLs even if not in scope (they're external buckets belonging to the org)
    }
    const listingUrl = buildListingUrl(b);
    const r = await fetchHead(listingUrl);
    if (!r) continue;
    if (r.status !== 200) continue;
    if (!looksLikeListingResponse(r.body, b.type)) continue;
    const hasSecretFile = /(?:\.env|\.sql|\.zip|\.tar\.gz|\.bak|\.log|\.json|password|backup|dump|secret|credential)/i.test(r.body);
    const sev: "critical" | "high" = hasSecretFile ? "critical" : "high";
    const sevLabel = sev === "critical" ? "Critical" : "High";
    const typeLabel = { s3: "Amazon S3", gcs: "Google Cloud Storage", azure: "Azure Blob", r2: "Cloudflare R2", do_spaces: "DigitalOcean Spaces" }[b.type];
    const taggedType = `Public Cloud Storage 公開 (${typeLabel}: ${b.bucketName}${hasSecretFile ? " - 機密ファイル疑い有り" : ""}) [${sevLabel}]`;
    const target = b.url;
    const existing = await findExistingScanFinding(scanId, taggedType, target);
    if (existing) continue;
    await createScanFinding(scanId, {
      type: taggedType,
      target,
      severity: sev,
      impact: `${typeLabel} bucket "${b.bucketName}" が anonymous で listing 可能。${listingUrl} に GET したところ object 一覧が返却されました。${hasSecretFile ? "中に .env / .sql / .zip / .bak / password / secret 等の機密ファイル疑いがあります → 認証情報 / DB ダンプ / バックアップ漏洩の可能性。" : "中身に機密ファイル名は無いが、bucket 公開自体が情報漏洩 + 任意ファイル upload リスク ( 設定次第 )。"}`,
      inScopeReason: `JS / HTML / DNS CNAME から検出された対象組織関連の bucket`,
      evidence: `bucket=${b.bucketName}, type=${b.type}, listingUrl=${listingUrl}, hasSecretFile=${hasSecretFile}`,
      requestResponseDiff: maskBody("application/xml", JSON.stringify({
        bucketUrl: b.url,
        bucketType: b.type,
        bucketName: b.bucketName,
        listingProbeUrl: listingUrl,
        listingResponsePreview: r.body.slice(0, 2000),
        hasSecretFile,
        safetyNote: "list-type=2 max-keys=10 の listing 1 回のみ。中の object 個別 download / 改変 / 削除は実施していない。"
      }, null, 2)),
      reproductionSteps: `1. curl '${listingUrl}' → 200 OK + listing XML/JSON\n2. ${hasSecretFile ? `中に機密ファイル疑いがあるので個別 GET で確認 ( 例: curl '${b.url}/.env' )` : "object listing から機密 file pattern を探す"}\n3. AWS bucket policy / GCS IAM / Azure ACL の設定見直し`,
      aiWorthSending: sev === "critical" ? "Critical 確定。$1k-10k 級。即報告候補。" : "High。 中身の機密性次第で Critical 化。",
      bountyLikelihood: sev === "critical" ? "very_high" : "high",
      recommendedAction: "report_now"
    });
    count++;
  }
  return count;
}
