/** ユーザー表示名: 名前 > メールの@より前 */
export function displayName(user: { name?: string | null; email: string }): string {
  if (user.name && user.name.trim()) return user.name.trim();
  return user.email.split("@")[0];
}

export function displayInitial(user: { name?: string | null; email: string }): string {
  return displayName(user).charAt(0).toUpperCase();
}
