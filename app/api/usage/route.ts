import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { checkScanQuota, ensureUsageWindow, getUsedDomainsThisMonth } from "@/lib/usage";
import { getPlan } from "@/lib/plans";

export const runtime = "nodejs";

// GET /api/usage — 現在のユーザーの使用状況を返す
// { plan, used, limit, remaining, resetAt }
export async function GET() {
  try {
    let user;
    try {
      user = await requireUser();
    } catch {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    // 30日経過していたらリセット
    const refreshed = await ensureUsageWindow(user);
    const quota = await checkScanQuota(refreshed);

    // ドメイン使用状況
    const usedDomains = await getUsedDomainsThisMonth(refreshed);
    const planCfg = getPlan(refreshed.plan);
    const domainLimit = refreshed.role === "admin" ? -1 : planCfg.limits.maxDomainsPerMonth;

    return NextResponse.json({
      plan: refreshed.plan,
      used: quota.used,
      limit: quota.limit,
      remaining: quota.remaining,
      resetAt: refreshed.usageResetAt,
      isAdmin: refreshed.role === "admin",
      domains: {
        used: usedDomains.length,
        limit: domainLimit,
        list: usedDomains,
      },
    });
  } catch (e) {
    console.error("[api/usage GET]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
