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
import { runBestPracticesCheck } from "@/lib/checks/best-practices";

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
    { name: "ベストプラクティス基本検査", fn: () => runBestPracticesCheck(scanId, targetUrl) },
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
    // 2. サーバスペックに応じて並列度を決定
    //    Fly.io の shared-cpu-1x (1 CPU / 1GB RAM) では 3 並列が安全
    //    高スペック環境（ローカル等）ではコア数に応じて拡大
    const os = await import("node:os");
    const cpuCount = os.cpus().length;
    const totalMemMB = Math.round(os.totalmem() / (1024 * 1024));
    // メモリ < 1.5GB は2並列、< 3GB は3並列、それ以上は CPU の1.5倍
    // Fly.io shared-cpu-1x (1GB) で OOM ハングを避けるため控えめに設定
    const baseConcurrency =
      totalMemMB < 1500 ? 2 :
      totalMemMB < 3000 ? 3 :
      Math.min(8, Math.max(4, Math.floor(cpuCount * 1.5)));
    // Playwright を多用する Tier 4 はメモリを食うので常に1並列
    const HEAVY_CONCURRENCY = totalMemMB < 3000 ? 1 : 2;
    console.log(`[scan-runner] cpus=${cpuCount} mem=${totalMemMB}MB concurrency=${baseConcurrency} heavy=${HEAVY_CONCURRENCY}`);

    // Tier 境界 (CHECKS の順番に対応, 計23モジュール)
    // Tier 1: 0-4 (5 modules) — quick wins
    // Tier 2: 5-11 (7 modules) — medium passive
    // Tier 3: 12-18 (7 modules) — lower passive
    // Tier 4: 19-22 (4 modules) — heavy active probes
    const tiers = [
      { range: [0, 4], concurrency: baseConcurrency, label: "Tier1" },
      { range: [5, 11], concurrency: baseConcurrency, label: "Tier2" },
      { range: [12, 18], concurrency: baseConcurrency, label: "Tier3" },
      { range: [19, 22], concurrency: HEAVY_CONCURRENCY, label: "Tier4" },
    ];

    let completed = 0;
    for (const tier of tiers) {
      const [start, end] = tier.range;
      const slice = CHECKS.slice(start, end + 1);
      // 同 Tier 内を limited-concurrency で並列実行
      let cursor = 0;
      const workers: Promise<void>[] = [];
      for (let w = 0; w < tier.concurrency; w++) {
        workers.push((async () => {
          while (true) {
            const idx = cursor++;
            if (idx >= slice.length) return;
            const check = slice[idx];
            // 開始時に進捗表示（このチェックを「実行中」として表示）
            await updateScanProgress(scanId, check.name, completed, CHECKS.length);
            const t0 = Date.now();
            try {
              // 各モジュールに最大3分のタイムアウト（ハング防止）
              const MODULE_TIMEOUT_MS = 3 * 60 * 1000;
              await Promise.race([
                scanContext.run({ scanId }, () => check.fn()),
                new Promise((_, reject) =>
                  setTimeout(() => reject(new Error(`module timeout: ${check.name}`)), MODULE_TIMEOUT_MS)
                ),
              ]);
              console.log(`[scan] ${check.name} done in ${Math.round((Date.now() - t0) / 1000)}s`);
            } catch (e) {
              console.warn(`[scan] ${check.name} failed/timeout in ${Math.round((Date.now() - t0) / 1000)}s:`, e instanceof Error ? e.message : e);
            }
            completed++;
            // 完了時に進捗を更新
            await updateScanProgress(scanId, check.name, completed, CHECKS.length);
          }
        })());
      }
      await Promise.all(workers);
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
