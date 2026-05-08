import { prisma } from "./prisma";
import { updateScanProgress } from "./scan-adapter";
import { scanContext } from "./scan-context";
import { clearSubStep } from "./scan-progress-bus";

import { runWellKnownAndRobotsCheck } from "@/lib/checks/well-known-and-robots";
import { runExternalPassiveChecks } from "@/lib/checks/external-passive";
import { runExternalLowHangingChecks } from "@/lib/checks/external-low-hanging";
import { runExternalMiningChecks } from "@/lib/checks/external-mining";
import { runExternalMiscChecks } from "@/lib/checks/external-misc";
import { runExternalAttackSurfaceProbe } from "@/lib/checks/external-attack-surface";
import { runCachePoisoningCheck } from "@/lib/checks/cache-poisoning";
import { runCorsCheck } from "@/lib/checks/cors-misconfig";
import { runCsrfCheck } from "@/lib/checks/csrf-missing";
import { runOutdatedSoftwareCheck } from "@/lib/checks/outdated-software";
import { runJwtVulnsCheck } from "@/lib/checks/jwt-vulns";
import { runOpenRedirectCheck } from "@/lib/checks/open-redirect";
import { runRateLimitCheck } from "@/lib/checks/rate-limit";
import { runUserEnumerationCheck } from "@/lib/checks/user-enumeration";
import { runGraphqlVulnsCheck } from "@/lib/checks/graphql-vulns";
import { runHttpSmugglingCheck } from "@/lib/checks/http-smuggling";
import { runPublicCloudStorageCheck } from "@/lib/checks/public-cloud-storage";
import { runOauthFlawsCheck } from "@/lib/checks/oauth-flaws";
import { runXssSafeProbe } from "@/lib/checks/xss-safe";
import { runSqliSafeProbe } from "@/lib/checks/sqli-safe";
import { runSsrfSafeProbe } from "@/lib/checks/ssrf-ssti-safe";
import { runAnonymousApiExposureCheck } from "@/lib/checks/anonymous-api-exposure";

type CheckDef = {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: () => Promise<any>;
};

/** severity の重み付け */
const SEVERITY_WEIGHT: Record<string, number> = {
  critical: 10,
  high: 7,
  medium: 4,
  low: 1,
  info: 0,
};

/**
 * findings の severity から riskScore を計算（0-100に正規化）
 * 最大スコア = critical * 10 で、仮に20件のcriticalで上限100とする
 */
async function calcRiskScore(scanId: string): Promise<number> {
  const findings = await prisma.scanFinding.findMany({
    where: { scanId },
    select: { severity: true },
  });

  if (findings.length === 0) return 0;

  const raw = findings.reduce((sum, f) => {
    return sum + (SEVERITY_WEIGHT[f.severity] ?? 0);
  }, 0);

  // 上限200点（20件のcritical想定）を100に正規化
  const normalized = Math.min(100, Math.round((raw / 200) * 100));
  return normalized;
}

/** スキャン全体の実行エンジン */
export async function runFullScan(scanId: string, targetUrl: string): Promise<void> {
  // 1. status を running に更新
  await prisma.scan.update({
    where: { id: scanId },
    data: {
      status: "running",
      startedAt: new Date(),
      error: "",
    },
  }).catch((e) => console.error("[scan-runner] failed to set running:", e));

  // Tier 順 ( hit 率高い → 低い ) に並び替え
  const CHECKS: CheckDef[] = [
    // Tier 1
    { name: "セキュリティヘッダー検査", fn: () => runExternalMiscChecks(scanId, targetUrl) },
    { name: "サイト構造・隠しパス検出", fn: () => runWellKnownAndRobotsCheck(scanId, targetUrl) },
    { name: "古いソフトウェア・既知脆弱性検出", fn: () => runOutdatedSoftwareCheck(scanId, targetUrl) },
    { name: "設定ミス・管理画面露出検査", fn: () => runExternalLowHangingChecks(scanId, targetUrl) },
    // Tier 2
    { name: "情報漏洩・機密ファイル露出検査", fn: () => runExternalPassiveChecks(scanId, targetUrl) },
    { name: "DNS・サブドメイン情報収集", fn: () => runExternalMiningChecks(scanId, targetUrl) },
    { name: "攻撃対象面（Attack Surface）分析", fn: () => runExternalAttackSurfaceProbe(scanId, targetUrl) },
    { name: "CORS設定確認", fn: () => runCorsCheck(scanId, targetUrl) },
    { name: "CSRF確認", fn: () => runCsrfCheck(scanId, targetUrl) },
    { name: "匿名API露出確認", fn: () => runAnonymousApiExposureCheck(scanId, targetUrl) },
    { name: "レートリミット", fn: () => runRateLimitCheck(scanId, targetUrl) },
    // Tier 3
    { name: "オープンリダイレクト", fn: () => runOpenRedirectCheck(scanId, targetUrl) },
    { name: "ユーザー列挙", fn: () => runUserEnumerationCheck(scanId, targetUrl) },
    { name: "キャッシュポイズニング", fn: () => runCachePoisoningCheck(scanId, targetUrl) },
    { name: "JWT脆弱性", fn: () => runJwtVulnsCheck(scanId, targetUrl) },
    { name: "パブリッククラウドストレージ", fn: () => runPublicCloudStorageCheck(scanId, targetUrl) },
    { name: "OAuthフロー欠陥", fn: () => runOauthFlawsCheck(scanId, targetUrl) },
    { name: "GraphQL脆弱性", fn: () => runGraphqlVulnsCheck(scanId, targetUrl) },
    // Tier 4
    { name: "XSS安全確認", fn: () => runXssSafeProbe(scanId, targetUrl) },
    { name: "SQLi安全確認", fn: () => runSqliSafeProbe(scanId, targetUrl) },
    { name: "SSRF安全確認", fn: () => runSsrfSafeProbe(scanId, targetUrl) },
    { name: "HTTPスマグリング", fn: () => runHttpSmugglingCheck(scanId, targetUrl) },
  ];

  try {
    // 2. 各チェックをシーケンシャルに実行
    for (let i = 0; i < CHECKS.length; i++) {
      await updateScanProgress(scanId, CHECKS[i].name, i, CHECKS.length);
      try {
        await scanContext.run({ scanId }, () => CHECKS[i].fn());
      } catch (e) {
        console.warn(`[scan] ${CHECKS[i].name} failed:`, e);
      }
    }

    // 最終進捗を100%にセット
    await updateScanProgress(scanId, "完了", CHECKS.length, CHECKS.length);

    // 3. riskScore 計算
    const riskScore = await calcRiskScore(scanId);

    // 4. status を completed に更新
    await prisma.scan.update({
      where: { id: scanId },
      data: {
        status: "completed",
        completedAt: new Date(),
        riskScore,
        progress: 100,
        currentStep: "完了",
        doneChecks: CHECKS.length,
        totalChecks: CHECKS.length,
      },
    });
  } catch (e) {
    // 5. エラー時は failed に更新
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error("[scan-runner] runFullScan failed:", e);

    await prisma.scan.update({
      where: { id: scanId },
      data: {
        status: "failed",
        completedAt: new Date(),
        error: errorMsg.slice(0, 500),
      },
    }).catch(() => {});
  } finally {
    clearSubStep(scanId);
  }
}
