"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Search,
  History,
  Settings,
  Shield,
  ChevronRight,
  Users,
  ClipboardCheck,
  CreditCard,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "ダッシュボード", icon: LayoutDashboard },
  { href: "/scan", label: "脆弱性スキャン", icon: Search },
  { href: "/history", label: "診断履歴", icon: History },
  { href: "/compliance", label: "SCS対応", icon: ClipboardCheck },
  { href: "/accounts", label: "アカウント管理", icon: Users },
  { href: "/settings", label: "設定", icon: Settings },
  { href: "/billing", label: "課金・プラン", icon: CreditCard },
];

type Me = { email: string; name?: string | null; plan: string } | null;

const PLAN_LABEL: Record<string, string> = {
  free: "Free",
  standard: "Standard",
  pro: "Pro",
  enterprise: "Enterprise",
};

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me>(null);
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.user) setMe({ email: d.user.email, name: d.user.name, plan: d.user.plan ?? "free" });
      })
      .catch(() => {});
    fetch("/api/usage")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && typeof d.used === "number" && typeof d.limit === "number") {
          setUsage({ used: d.used, limit: d.limit });
        }
      })
      .catch(() => {});
  }, []);

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    router.push("/");
    router.refresh();
  }

  const usagePct =
    usage && usage.limit > 0 ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 0;
  const remaining = usage ? Math.max(0, usage.limit - usage.used) : null;
  const planLabel = me ? PLAN_LABEL[me.plan] ?? me.plan : "—";
  const displayLabel = me ? (me.name?.trim() || me.email.split("@")[0]) : "";
  const initial = me ? displayLabel.charAt(0).toUpperCase() : "?";

  return (
    <aside className="flex flex-col w-64 min-h-screen bg-slate-900 text-slate-100">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-700">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-600">
          <Shield className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="text-sm font-bold leading-tight">Sequlia</div>
          <div className="text-xs text-slate-400">セキュリア</div>
        </div>
      </div>

      {/* user info card */}
      {me && (
        <div className="px-4 py-3 border-b border-slate-700">
          <div className="rounded-xl bg-slate-800/70 p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-sm font-bold text-white shrink-0">
              {initial}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-slate-100 truncate" title={me.email}>{displayLabel}</div>
              <span className="inline-flex items-center mt-1 rounded-full bg-blue-500/20 border border-blue-400/40 px-2 py-0.5 text-[10px] font-bold text-blue-200 uppercase tracking-wide">
                {planLabel}
              </span>
            </div>
          </div>
        </div>
      )}

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                isActive
                  ? "bg-blue-600 text-white shadow-lg"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{item.label}</span>
              {isActive && <ChevronRight className="w-3 h-3 opacity-70" />}
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-slate-700">
        <div className="rounded-lg bg-slate-800 p-3">
          <div className="text-xs font-medium text-slate-300 mb-1">今月のスキャン</div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold text-white">{usage ? usage.used : "—"}</span>
            <span className="text-xs text-slate-400">
              / {usage ? (usage.limit < 0 ? "∞" : usage.limit) : "—"}回
            </span>
          </div>
          <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${usagePct}%` }} />
          </div>
          {remaining !== null && (
            <div className="mt-1.5 text-[10px] text-slate-400">残り {remaining} 回</div>
          )}
          <div className="mt-2.5 flex flex-col gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 leading-tight">
              <ClipboardCheck className="w-2.5 h-2.5" />
              SCS★3 脆弱性診断 対応済
            </span>
            <div className="flex items-center gap-1.5 rounded-lg bg-blue-900/40 border border-blue-700/40 px-2 py-1.5">
              <img
                src="/ipa-security-action-2.svg"
                alt="IPA SECURITY ACTION ★2"
                className="h-6 w-auto object-contain"
              />
              <div>
                <div className="text-[9px] font-bold text-blue-200 leading-tight">IPA SECURITY</div>
                <div className="text-[9px] font-bold text-blue-200 leading-tight">ACTION ★2 対応</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-3 border-t border-slate-700">
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-red-600/80 hover:text-white transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          ログアウト
        </button>
      </div>
    </aside>
  );
}
