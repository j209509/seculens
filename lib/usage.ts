import { prisma } from "./prisma";
import { getPlan } from "./plans";
import { isAdminEmail } from "./admin";
import type { User } from "@prisma/client";

/**
 * Reset scansThisMonth if usageResetAt is older than 30 days.
 * Returns the (possibly updated) user.
 */
export async function ensureUsageWindow(user: User): Promise<User> {
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  if (Date.now() - user.usageResetAt.getTime() > THIRTY_DAYS_MS) {
    return prisma.user.update({
      where: { id: user.id },
      data: { scansThisMonth: 0, usageResetAt: new Date() },
    });
  }
  return user;
}

/**
 * Returns { allowed, remaining, limit, used }. limit -1 means unlimited.
 */
export async function checkScanQuota(
  user: User
): Promise<{ allowed: boolean; remaining: number; limit: number; used: number }> {
  const u = await ensureUsageWindow(user);
  // 管理者は無制限（テスト・運用のため）
  if (u.role === "admin" || isAdminEmail(u.email)) {
    return { allowed: true, remaining: -1, limit: -1, used: u.scansThisMonth };
  }
  const plan = getPlan(u.plan);
  const limit = plan.limits.scansPerMonth;
  const used = u.scansThisMonth;
  if (limit === -1) return { allowed: true, remaining: -1, limit: -1, used };
  return { allowed: used < limit, remaining: Math.max(0, limit - used), limit, used };
}

export async function incrementScanUsage(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { scansThisMonth: { increment: 1 } },
  });
}

/** 当月（usageResetAt以降）にスキャンしたユニークドメイン一覧を取得 */
export async function getUsedDomainsThisMonth(user: User): Promise<string[]> {
  const u = await ensureUsageWindow(user);
  const scans = await prisma.scan.findMany({
    where: {
      userId: u.id,
      createdAt: { gte: u.usageResetAt },
    },
    select: { url: true },
  });
  const hostSet = new Set<string>();
  for (const s of scans) {
    try {
      const h = new URL(s.url).hostname.toLowerCase();
      if (h) hostSet.add(h);
    } catch { /* invalid url, skip */ }
  }
  return [...hostSet];
}

/**
 * ドメイン上限チェック。
 * 新規ドメイン（当月でまだスキャンしてない）の追加が可能か判定。
 * 既存ドメインの再スキャンは無条件で許可。
 */
export async function checkDomainQuota(
  user: User,
  targetUrl: string
): Promise<{ allowed: boolean; reason?: string; current: number; limit: number; used: string[] }> {
  // 管理者は無制限
  if (user.role === "admin" || isAdminEmail(user.email)) {
    return { allowed: true, current: 0, limit: -1, used: [] };
  }

  let targetHost = "";
  try { targetHost = new URL(targetUrl).hostname.toLowerCase(); } catch { /* */ }

  const used = await getUsedDomainsThisMonth(user);
  const plan = getPlan(user.plan);
  const limit = plan.limits.maxDomainsPerMonth;
  if (limit === -1) return { allowed: true, current: used.length, limit: -1, used };

  const isExisting = !!targetHost && used.includes(targetHost);
  if (isExisting) {
    // 既にスキャン済みドメインの再スキャンは常にOK
    return { allowed: true, current: used.length, limit, used };
  }

  // 新規ドメイン追加 → 上限チェック
  if (used.length >= limit) {
    return {
      allowed: false,
      reason: `当月のドメイン数上限 (${limit}) に達しています。プランをアップグレードしてください。`,
      current: used.length,
      limit,
      used,
    };
  }
  return { allowed: true, current: used.length, limit, used };
}
