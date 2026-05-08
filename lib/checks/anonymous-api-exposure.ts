// Anonymous Public API Exposure ( 未ログイン特化の本命 )

import { chromium } from "playwright";
import { isUrlInScope } from "@/lib/scope";
import { maskBody } from "@/lib/mask";
import { makeScanCtx, createScanFinding, findExistingScanFinding } from "@/lib/scan-adapter";

const ENDPOINT_RE = /(?:["'`])(\/(?:api|v\d+|graphql|internal|admin|private|backend|services?|users?|account|me|profile|invoices?|orders?|payments?|files?|team|workspace|customer|export|import|reports?|analytics|metrics|stats?|search|query|data|admin|management|console|dashboard|backoffice|adm|sysadmin)[\/\?][^"'`\s<>]*)["'`]/gi;

const SENSITIVE_KEYS_RE = /"(?:email|user_email|userEmail|users?|password|password_hash|hashed_password|phone|phoneNumber|phone_number|ssn|social_security|tax_id|dob|date_of_birth|birthday|first_name|last_name|full_name|api_key|apiKey|api_token|apiToken|access_token|accessToken|refresh_token|refreshToken|secret|client_secret|clientSecret|private_key|privateKey|credit_card|creditCard|card_number|cardNumber|cvv|cvc|iban|account_number|accountNumber|invoice|invoices|invoice_id|payment|payments|payment_method|paymentMethod|order_id|orderId|address|street|zip|postal_code|postalCode|role|roles|permission|permissions|is_admin|isAdmin|is_owner|isOwner|admin|owner|workspace_id|workspaceId|organization_id|organizationId|team_id|teamId|customer_id|customerId|file_url|fileUrl|s3_url|s3Url|signed_url|signedUrl)"\s*:/i;

const PII_PATTERNS_RE = /(?:[\w._%+-]+@[\w.-]+\.[a-zA-Z]{2,})|(?:\b\+?\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}\b)|(?:\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b)/;

async function fetchAnon(url: string): Promise<{ status: number; body: string; contentType: string } | null> {
  try {
    const browser = await chromium.launch({ headless: true });
    try {
      const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
      const page = await ctx.newPage();
      const res = await page.request.fetch(url, { method: "GET", failOnStatusCode: false, timeout: 8000, maxRedirects: 2 });
      const body = await res.text().catch(() => "");
      const headers = res.headers();
      await ctx.close();
      return { status: res.status(), body: body.slice(0, 12000), contentType: headers["content-type"] ?? "" };
    } finally { await browser.close().catch(() => undefined); }
  } catch { return null; }
}

function classifyJson(body: string): { hasSensitiveKeys: boolean; hasPii: boolean; recordCount: number; sensitiveKeysFound: string[] } {
  const sensitiveKeysFound: string[] = [];
  const matches = body.match(/"(?:email|password|api_key|access_token|refresh_token|secret|private_key|credit_card|users?|invoice|file_url|admin|role)"\s*:/gi);
  if (matches) {
    for (const m of matches.slice(0, 10)) {
      const k = m.replace(/[":\s]/g, "");
      if (!sensitiveKeysFound.includes(k)) sensitiveKeysFound.push(k);
    }
  }
  const hasSensitiveKeys = SENSITIVE_KEYS_RE.test(body);
  const hasPii = PII_PATTERNS_RE.test(body);
  const recordCount = (body.match(/^\s*\[[\s\S]*\]\s*$/) ? (body.match(/\}\s*,/g) ?? []).length + 1 : 0);
  return { hasSensitiveKeys, hasPii, recordCount, sensitiveKeysFound };
}

export async function runAnonymousApiExposureCheck(scanId: string, targetUrl: string): Promise<number> {
  const program = makeScanCtx(scanId, targetUrl);

  // === Step 1: JS バンドルから endpoint 抽出 ===
  // Note: No httpTraffic access in scan adapter — probe known API paths from target URL
  const candidateEndpoints = new Set<string>();
  try {
    const browser = await chromium.launch({ headless: true });
    try {
      const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
      const page = await ctx.newPage();
      const baseUrl = new URL(targetUrl);
      // Fetch main page and extract JS bundle URLs
      const res = await page.request.fetch(targetUrl, { method: "GET", failOnStatusCode: false, timeout: 12000 });
      const htmlBody = await res.text().catch(() => "");
      // Extract JS bundle URLs from HTML
      const jsSrcs = Array.from(htmlBody.matchAll(/src=["']([^"']+\.(?:js|mjs))["']/gi)).map((m) => m[1]);
      for (const src of jsSrcs.slice(0, 10)) {
        const jsUrl = src.startsWith("http") ? src : `${baseUrl.origin}${src.startsWith("/") ? src : "/" + src}`;
        try {
          const jsRes = await page.request.fetch(jsUrl, { method: "GET", failOnStatusCode: false, timeout: 8000 });
          const jsBody = await jsRes.text().catch(() => "");
          if (!jsBody || jsBody.length < 100) continue;
          let m: RegExpExecArray | null;
          const re = new RegExp(ENDPOINT_RE.source, "gi");
          while ((m = re.exec(jsBody)) !== null) {
            const path = m[1];
            const cleanPath = path.split("?")[0].split("#")[0];
            if (cleanPath.length > 200) continue;
            if (/\.(?:css|png|jpg|gif|svg|woff|woff2|ttf|ico|webp|mp4|webm)$/i.test(cleanPath)) continue;
            candidateEndpoints.add(cleanPath);
            if (candidateEndpoints.size >= 100) break;
          }
        } catch { /* skip */ }
      }
      await ctx.close();
    } finally { await browser.close().catch(() => undefined); }
  } catch { /* skip */ }

  // === Step 2: 各 host × endpoint で 匿名 GET ===
  const baseHost = new URL(targetUrl).host;
  const allowed = JSON.parse(program.allowedDomains || "[]") as string[];
  const hosts = new Set<string>([baseHost]);
  for (const d of allowed) {
    try { hosts.add(new URL(d.startsWith("http") ? d : `https://${d}`).host); } catch { /* ignore */ }
  }

  let count = 0;
  const tested = new Set<string>();
  for (const host of Array.from(hosts).slice(0, 5)) {
    if (count >= 12) break;
    for (const endpoint of Array.from(candidateEndpoints).slice(0, 30)) {
      if (count >= 12) break;
      const fullUrl = `https://${host}${endpoint}`;
      if (tested.has(fullUrl)) continue;
      tested.add(fullUrl);
      if (!isUrlInScope(program, fullUrl).allowed) continue;
      const r = await fetchAnon(fullUrl);
      if (!r) continue;
      if (r.status !== 200 && r.status !== 201) continue;
      if (!/json|\bapplication\b/i.test(r.contentType)) {
        if (!/^\s*[\[{]/.test(r.body)) continue;
      }
      const cls = classifyJson(r.body);
      if (!cls.hasSensitiveKeys && !cls.hasPii) continue;
      const sev: "critical" | "high" | "medium" =
        (cls.hasSensitiveKeys && cls.hasPii) ? "critical" :
        cls.hasSensitiveKeys ? "high" :
        "medium";
      const sevLabel = sev === "critical" ? "Critical" : sev === "high" ? "High" : "Medium";
      const taggedType = `Anonymous Public API Exposure (${cls.sensitiveKeysFound.slice(0, 3).join(", ")}) [${sevLabel}]`;
      const target = fullUrl;
      const existing = await findExistingScanFinding(scanId, taggedType, target);
      if (existing) continue;
      await createScanFinding(scanId, {
        type: taggedType,
        target,
        severity: sev,
        impact: `${target} に未ログイン GET したところ、200 OK + JSON で機密性の高いキー ( ${cls.sensitiveKeysFound.join(", ")} )${cls.hasPii ? " + PII ( email / 電話番号 / クレカ番号 等 ) パターン" : ""} を含むデータが返却されました。本来認証が必要なはずの API エンドポイントが匿名で読める状態。攻撃者は対象組織の users / invoices / files / 内部設定等を直接列挙可能です。`,
        inScopeReason: `収集済み許可ドメイン上の API エンドポイント`,
        evidence: `endpoint=${target}, status=200, contentType=${r.contentType}, sensitiveKeys=${cls.sensitiveKeysFound.join(",")}, hasPii=${cls.hasPii}`,
        requestResponseDiff: maskBody("application/json", JSON.stringify({
          endpoint: target,
          status: r.status,
          contentType: r.contentType,
          sensitiveKeysFound: cls.sensitiveKeysFound,
          hasPii: cls.hasPii,
          estimatedRecordCount: cls.recordCount,
          bodyPreview: r.body.slice(0, 1500),
          safetyNote: "匿名 GET 1 リクエストのみ。データ抽出 / brute force は実施していない。"
        }, null, 2)),
        reproductionSteps: `1. curl '${fullUrl}' ( 認証ヘッダー無し )\n2. 200 OK で JSON 返却、機密キー ( ${cls.sensitiveKeysFound.join(", ")} ) 含む${cls.hasPii ? " + PII パターン検出" : ""}\n3. 攻撃者は同 URL で対象データを匿名で取得可能`,
        recommendedAction: sev === "critical" ? "report_now" : "manual_verify"
      });
      count++;
    }
  }
  return count;
}
