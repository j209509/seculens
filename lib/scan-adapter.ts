/**
 * scan-adapter.ts
 * bug-security の programId ベースのチェックモジュールを
 * Sequlia の scanId + targetUrl ベースに橋渡しするアダプター
 */
import { prisma } from "./prisma";
import { maskBody } from "./mask";
import { generateReportDraft } from "./report";
import { triageFinding } from "./triage";

export type ScanCtx = {
  id: string;           // scanId
  name: string;
  allowedDomains: string;
  excludedDomains: string;
  outOfScopePaths: string;
  forbiddenMemo: string;
  bountyMemo: string;
  targetUrl: string;
  targetHost: string;
};

/** targetUrl から ScanCtx を生成（prisma.program 相当） */
export function makeScanCtx(scanId: string, targetUrl: string): ScanCtx {
  let host = targetUrl;
  try {
    host = new URL(targetUrl).hostname;
  } catch { /* fallback */ }
  return {
    id: scanId,
    name: host,
    allowedDomains: JSON.stringify([host, `*.${host}`]),
    excludedDomains: "[]",
    outOfScopePaths: "[]",
    forbiddenMemo: "",
    bountyMemo: "",
    targetUrl,
    targetHost: host,
  };
}

export type FindingData = {
  type: string;
  target: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  priority?: string;
  impact: string;
  inScopeReason?: string;
  evidence: string;
  requestResponseDiff?: string;
  reproductionSteps?: string;
  aiWorthSending?: string;
  bountyLikelihood?: string;
  recommendedAction?: string;
  owasp?: string;
  cvssScore?: number;
  category?: string;
  affectedUrl?: string;
};

/** finding 重複チェック */
export async function findExistingScanFinding(scanId: string, type: string, target: string) {
  return prisma.scanFinding.findFirst({ where: { scanId, type, target } });
}

/**
 * セルフチェック対象（自社ドメイン）の判定
 * SAFE_HOSTNAMES 環境変数 (カンマ区切り) または既知のSequliaホスト名にマッチした場合
 * findings を作らない（自社サイトは常に「安全」と表示）
 */
function isSelfCheckTarget(targetUrl: string, scanUrl?: string): boolean {
  const hosts = new Set<string>([
    "seculens.fly.dev",
    "sequlia.fly.dev",
    "sequlia.com",
    "www.sequlia.com",
    "app.sequlia.com",
    "sequlia.jp",
    "www.sequlia.jp",
  ]);
  // 環境変数からも追加
  const envHosts = (process.env.SAFE_HOSTNAMES || "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  for (const h of envHosts) hosts.add(h);

  for (const candidate of [targetUrl, scanUrl].filter(Boolean) as string[]) {
    try {
      const u = new URL(candidate);
      const host = u.hostname.toLowerCase();
      if (hosts.has(host)) return true;
      // サブドメインも含める（例: api.sequlia.com）
      for (const h of hosts) {
        if (host === h || host.endsWith("." + h)) return true;
      }
    } catch { /* ignore parse errors */ }
  }
  return false;
}

/** finding 作成 + AI triage + レポートドラフト */
export async function createScanFinding(scanId: string, data: FindingData) {
  // 自社ドメインへのスキャンは findings を作らない（テスト/競合対策）
  // scan の URL も確認することで、サブパス指定でも対応
  const scan = await prisma.scan.findUnique({ where: { id: scanId }, select: { url: true } });
  if (isSelfCheckTarget(data.target, scan?.url)) {
    return null;
  }

  const existing = await findExistingScanFinding(scanId, data.type, data.target);
  if (existing) return null;

  const priority = data.priority ?? (data.severity === "critical" || data.severity === "high" ? "高" : data.severity === "medium" ? "中" : "低");

  const f = await prisma.scanFinding.create({
    data: {
      scanId,
      type: data.type,
      target: data.target,
      severity: data.severity,
      priority,
      impact: data.impact,
      inScopeReason: data.inScopeReason ?? "対象URLのホスト/サブドメイン",
      evidence: data.evidence,
      requestResponseDiff: maskBody("application/json", data.requestResponseDiff ?? "{}"),
      reproductionSteps: data.reproductionSteps ?? "",
      aiWorthSending: data.aiWorthSending ?? "",
      bountyLikelihood: data.bountyLikelihood ?? "unknown",
      recommendedAction: data.recommendedAction ?? "manual_verify",
      owasp: data.owasp ?? "",
      cvssScore: data.cvssScore ?? 0,
      category: data.category ?? "",
      affectedUrl: data.affectedUrl ?? data.target,
    },
  });

  // AI triage（非同期、失敗しても続行）
  triageFinding(f.id).catch((e) => console.warn("[scan-adapter] triage failed:", e));

  // レポートドラフト生成（Markdown のみ）
  generateReportDraft(
    { id: f.id, priority, type: data.type, target: data.target, impact: data.impact, inScopeReason: f.inScopeReason, evidence: data.evidence, requestResponseDiff: f.requestResponseDiff, reproductionSteps: f.reproductionSteps },
    "Markdown"
  ).then((body) =>
    prisma.reportDraft.create({ data: { scanId, findingId: f.id, format: "Markdown", title: `${data.type}: ${data.target}`, body } }).catch(() => {})
  ).catch(() => {});

  return f.id;
}

/** スキャン進捗更新 */
export async function updateScanProgress(scanId: string, step: string, done: number, total: number) {
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;
  await prisma.scan.update({
    where: { id: scanId },
    data: { currentStep: step, doneChecks: done, totalChecks: total, progress },
  }).catch(() => {});
}
