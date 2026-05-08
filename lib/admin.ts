import { prisma } from "./prisma";
import { getCurrentUser } from "./auth";
import type { User } from "@prisma/client";

/** 環境変数 ADMIN_EMAILS に含まれるメールを管理者扱い（自動昇格） */
function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string): boolean {
  return getAdminEmails().includes(email.toLowerCase());
}

/**
 * 管理者ユーザーを取得。なければ null。
 * ADMIN_EMAILS に登録されてるメールは自動的に role=admin に昇格させる。
 */
export async function getAdminUser(): Promise<User | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role === "admin") return user;
  // 自動昇格
  if (isAdminEmail(user.email)) {
    return prisma.user.update({
      where: { id: user.id },
      data: { role: "admin" },
    });
  }
  return null;
}

export async function requireAdmin(): Promise<User> {
  const user = await getAdminUser();
  if (!user) throw new Error("FORBIDDEN");
  return user;
}
