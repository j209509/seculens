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
