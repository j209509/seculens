// Modern vibe-coding ( Lovable / Bolt / v0 / Cursor / Replit / Copilot ) 系で
// 起きがちな脆弱性を検出。RLS 設定なしの Supabase / Firebase の rules 緩 / Strapi public API /
// Sentry DSN 漏洩 / OpenAI/Anthropic/Stripe API key の JS バンドル混入 等。

import { chromium } from "playwright";
import { isUrlInScope } from "@/lib/scope";
import { maskBody } from "@/lib/mask";
import { makeScanCtx, createScanFinding, findExistingScanFinding } from "@/lib/scan-adapter";

type ExtractedSecret = {
  type: "supabase_url" | "supabase_anon_key" | "firebase_config" | "strapi_url" | "pocketbase_url" | "convex_url" |
        "openai_key" | "anthropic_key" | "stripe_pk_live" | "stripe_sk_live" | "sendgrid_key" | "twilio_sid" |
        "sentry_dsn" | "mapbox_token" | "github_pat" | "slack_webhook" | "algolia_admin_key" |
        "datadog_api_key" | "discord_webhook";
  value: string;
  context: string;
  severity: "critical" | "high" | "medium" | "low";
};

const SECRET_PATTERNS: Array<{ type: ExtractedSecret["type"]; re: RegExp; severity: "critical" | "high" | "medium" | "low"; description: string }> = [
  { type: "supabase_url", re: /(https:\/\/[a-z0-9]{20}\.supabase\.co)/g, severity: "high", description: "Supabase project URL" },
  { type: "supabase_anon_key", re: /(eyJ[A-Za-z0-9_-]+\.eyJpc3MiOiJzdXBhYmFzZSI[A-Za-z0-9_.-]+)/g, severity: "critical", description: "Supabase anon JWT ( RLS 設定無いと全データアクセス可能 )" },
  { type: "firebase_config", re: /(?:apiKey|databaseURL|projectId|storageBucket)["']?\s*:\s*["'](?:AIza[A-Za-z0-9_-]{35}|https:\/\/[a-z0-9-]+\.firebaseio\.com|[a-z0-9-]+\.appspot\.com)["']/g, severity: "high", description: "Firebase config ( databaseURL / projectId ) - rules 緩いと全データ" },
  { type: "strapi_url", re: /(https?:\/\/[a-z0-9.-]+(?::\d+)?)\/api\/(?:user-permissions|content-manager)/g, severity: "medium", description: "Strapi backend URL" },
  { type: "pocketbase_url", re: /(https?:\/\/[a-z0-9.-]+(?::\d+)?)\/api\/collections\/[a-z0-9_-]+\/records/g, severity: "medium", description: "PocketBase backend URL" },
  { type: "convex_url", re: /(https:\/\/[a-z0-9-]+\.convex\.cloud)/g, severity: "low", description: "Convex backend URL" },
  { type: "openai_key", re: /\b(sk-[A-Za-z0-9]{20,}T3BlbkFJ[A-Za-z0-9]{20,})\b/g, severity: "critical", description: "OpenAI API key" },
  { type: "anthropic_key", re: /\b(sk-ant-[a-z0-9-]+-[A-Za-z0-9_-]{50,})\b/g, severity: "critical", description: "Anthropic API key" },
  { type: "stripe_pk_live", re: /\b(pk_live_[A-Za-z0-9]{24,})\b/g, severity: "low", description: "Stripe publishable key live ( これは公開前提なのでそれ自体は OK だが、sk と一緒にあると Critical )" },
  { type: "stripe_sk_live", re: /\b(sk_live_[A-Za-z0-9]{24,})\b/g, severity: "critical", description: "Stripe SECRET key live ( 決済 API 完全権限 )" },
  { type: "sendgrid_key", re: /\b(SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43})\b/g, severity: "critical", description: "SendGrid API key" },
  { type: "twilio_sid", re: /\b(AC[a-f0-9]{32})\b.{0,200}\b([a-f0-9]{32})\b/g, severity: "critical", description: "Twilio Account SID + Auth Token ペア" },
  { type: "sentry_dsn", re: /(https:\/\/[a-f0-9]{32}@(?:o\d+\.)?ingest\.(?:us\.|de\.)?sentry\.io\/\d+)/g, severity: "low", description: "Sentry DSN ( 公開前提だが、abuse で error spam 攻撃可 )" },
  { type: "mapbox_token", re: /\b(pk\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g, severity: "medium", description: "Mapbox token ( public token 想定だが quota 消費 abuse )" },
  { type: "github_pat", re: /\b(gh[pousr]_[A-Za-z0-9]{36,})\b/g, severity: "critical", description: "GitHub Personal Access Token" },
  { type: "slack_webhook", re: /(https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+)/g, severity: "high", description: "Slack incoming webhook ( spam / phishing 投稿可 )" },
  { type: "algolia_admin_key", re: /algoliasearch[^"']*["'][A-Z0-9]{10}["'][^"']*["']([a-f0-9]{32})["']/g, severity: "high", description: "Algolia admin key" },
  { type: "datadog_api_key", re: /\b(?:datadog|dd)[-_.]?api[-_.]?key["']?\s*[:=]\s*["']([a-f0-9]{32})["']/gi, severity: "high", description: "Datadog API key" },
  { type: "discord_webhook", re: /(https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+)/g, severity: "medium", description: "Discord webhook" }
];

async function fetchJsBundle(url: string): Promise<string | null> {
  try {
    const browser = await chromium.launch({ headless: true });
    try {
      const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
      const page = await ctx.newPage();
      const res = await page.request.fetch(url, { method: "GET", failOnStatusCode: false, timeout: 12000 });
      const body = await res.text().catch(() => "");
      await ctx.close();
      return body;
    } finally { await browser.close().catch(() => undefined); }
  } catch { return null; }
}

async function probeSupabaseOpenRls(url: string, anonKey: string): Promise<{ exposed: boolean; tableCount?: number; sampleData?: string }> {
  try {
    const probe = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      signal: AbortSignal.timeout(8000)
    });
    if (!probe.ok) return { exposed: false };
    const body = await probe.text();
    if (/"swagger"\s*:|"openapi"\s*:|"paths"\s*:/i.test(body)) {
      const matches = body.match(/"\/[a-z_]+"\s*:/g) ?? [];
      return { exposed: true, tableCount: matches.length, sampleData: body.slice(0, 1500) };
    }
    return { exposed: false };
  } catch { return { exposed: false }; }
}

async function probeFirebaseOpenRules(databaseUrl: string): Promise<{ exposed: boolean; sampleData?: string }> {
  try {
    const probe = await fetch(`${databaseUrl}/.json`, { signal: AbortSignal.timeout(8000) });
    if (!probe.ok) return { exposed: false };
    const body = await probe.text();
    if (body && body !== "null" && body !== "{}" && !/"error"\s*:\s*"Permission denied"/i.test(body)) {
      return { exposed: true, sampleData: body.slice(0, 2000) };
    }
    return { exposed: false };
  } catch { return { exposed: false }; }
}

export async function runVibeCodingModernCheck(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  const base = new URL(targetUrl).origin;
  let count = 0;
  const seen = new Set<string>();

  // Fetch main page to discover JS bundles
  const jsUrls: string[] = [];
  try {
    const mainPageBody = await fetchJsBundle(targetUrl) ?? "";
    const scriptMatches = mainPageBody.matchAll(/<script[^>]*src=["']([^"']+\.(?:js|mjs|jsx)[^"']*)["']/gi);
    for (const m of scriptMatches) {
      try {
        const jsUrl = new URL(m[1], base).toString();
        if (isUrlInScope(program, jsUrl).allowed && !seen.has(jsUrl)) {
          seen.add(jsUrl);
          jsUrls.push(jsUrl);
          if (jsUrls.length >= 10) break;
        }
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }

  // Also check main page body itself as a source (for JSON config, HTML with inline scripts)
  const sourcesToCheck: Array<{ url: string; body: string }> = [];
  const mainBody = await fetchJsBundle(targetUrl);
  if (mainBody && mainBody.length > 200) {
    sourcesToCheck.push({ url: targetUrl, body: mainBody });
  }
  for (const jsUrl of jsUrls.slice(0, 10)) {
    const body = await fetchJsBundle(jsUrl);
    if (body && body.length > 200) sourcesToCheck.push({ url: jsUrl, body });
  }

  for (const source of sourcesToCheck) {
    if (count >= 10) break;
    if (!isUrlInScope(program, source.url).allowed) continue;
    const body = source.body;

    const found: ExtractedSecret[] = [];
    for (const p of SECRET_PATTERNS) {
      let m: RegExpExecArray | null;
      const localRe = new RegExp(p.re.source, p.re.flags);
      while ((m = localRe.exec(body)) !== null) {
        if (found.length >= 30) break;
        const idx = m.index;
        found.push({ type: p.type, value: m[1] ?? m[0], context: body.slice(Math.max(0, idx - 60), idx + (m[0]?.length ?? 0) + 60), severity: p.severity });
      }
    }
    if (found.length === 0) continue;

    // Supabase RLS check
    const supaUrl = found.find((f) => f.type === "supabase_url");
    const supaKey = found.find((f) => f.type === "supabase_anon_key");
    let supabaseExposure: { tableCount: number; sample: string } | null = null;
    if (supaUrl && supaKey) {
      const probe = await probeSupabaseOpenRls(supaUrl.value, supaKey.value);
      if (probe.exposed && probe.tableCount && probe.tableCount > 0) {
        supabaseExposure = { tableCount: probe.tableCount, sample: probe.sampleData ?? "" };
      }
    }

    // Firebase rules check
    let firebaseExposure: { sample: string } | null = null;
    const firebaseUrl = body.match(/(https:\/\/[a-z0-9-]+\.firebaseio\.com)/i)?.[1];
    if (firebaseUrl) {
      const probe = await probeFirebaseOpenRules(firebaseUrl);
      if (probe.exposed) firebaseExposure = { sample: probe.sampleData ?? "" };
    }

    const sevOrder: Record<ExtractedSecret["severity"], number> = { critical: 4, high: 3, medium: 2, low: 1 };
    let topSev: "critical" | "high" | "medium" | "low" = "low";
    for (const f of found) if (sevOrder[f.severity] > sevOrder[topSev]) topSev = f.severity;
    if (supabaseExposure || firebaseExposure) topSev = "critical";

    const sevLabel = topSev === "critical" ? "Critical" : topSev === "high" ? "High" : topSev === "medium" ? "Medium" : "Low";
    const taggedType = `Vibe Coding 漏洩 (${found.length} 件 secret + ${supabaseExposure ? "Supabase RLS 抜け / " : ""}${firebaseExposure ? "Firebase rules 緩 / " : ""}${found.map((f) => f.type).slice(0, 3).join(", ")}) [${sevLabel}]`;
    const target = source.url;
    const existing = await findExistingScanFinding(scanId, taggedType, target);
    if (existing) continue;

    await createScanFinding(scanId, {
      type: taggedType,
      target,
      severity: topSev,
      impact: `JS バンドル ${source.url} に以下の漏洩を確認しました:\n${found.map((f) => ` - ${f.type}: ${f.value.slice(0, 30)}... ( ${SECRET_PATTERNS.find((p) => p.type === f.type)?.description} )`).join("\n")}\n${supabaseExposure ? `\n★ Supabase RLS 抜け確認: anon JWT で /rest/v1/ にアクセスできて ${supabaseExposure.tableCount} 個のテーブルが list 可能。` : ""}${firebaseExposure ? `\n★ Firebase rules 緩確認: /.json に anonymous でアクセスできてデータが返却される。` : ""}`,
      inScopeReason: `収集済み許可ドメイン内の JS バンドル`,
      evidence: `jsUrl=${source.url}, secrets=${found.length}, supabaseExposure=${!!supabaseExposure}, firebaseExposure=${!!firebaseExposure}`,
      requestResponseDiff: maskBody("application/javascript", JSON.stringify({
        jsUrl: source.url,
        extractedSecrets: found.map((f) => ({ type: f.type, valuePreview: f.value.slice(0, 30) + "...", context: f.context.slice(0, 200), severity: f.severity })),
        supabaseExposure,
        firebaseExposure,
        safetyNote: "JS バンドル ( 公開済 ) からの抽出のみ。Supabase / Firebase は anon key で /rest/v1/ または /.json に GET 1 リクエストを投げてレスポンス検査のみ。データ書込み / 削除は実施していない。"
      }, null, 2)),
      reproductionSteps: `1. ${source.url} を GET\n2. 以下の secret を抽出: ${found.map((f) => f.type).join(", ")}\n${supabaseExposure ? `3. curl '${supaUrl?.value}/rest/v1/' -H 'apikey: <anon>' -H 'Authorization: Bearer <anon>' → ${supabaseExposure.tableCount} テーブル list` : ""}${firebaseExposure ? `\n3. curl '${firebaseUrl}/.json' → 全データ JSON 返却` : ""}`,
      aiWorthSending: topSev === "critical" ? "Critical 確定。即報告候補 ( 特に Supabase RLS 抜け / Firebase rules 緩 / sk_live / Anthropic key 漏洩 )。" : topSev === "high" ? "High。 secret 種類により Critical 化。報告候補。" : "Medium。 影響範囲確認後判断。",
      bountyLikelihood: topSev === "critical" ? "very_high" : topSev === "high" ? "high" : "medium",
      recommendedAction: topSev === "critical" ? "report_now" : "manual_verify"
    });
    count++;
  }
  return count;
}
