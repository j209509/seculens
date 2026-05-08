"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Search,
  History,
  Settings,
  Shield,
  ChevronRight,
  Users,
  ClipboardCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "ダッシュボード", icon: LayoutDashboard },
  { href: "/scan", label: "脆弱性スキャン", icon: Search },
  { href: "/history", label: "診断履歴", icon: History },
  { href: "/compliance", label: "SCS対応", icon: ClipboardCheck },
  { href: "/accounts", label: "アカウント管理", icon: Users },
  { href: "/settings", label: "設定", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex flex-col w-64 min-h-screen bg-slate-900 text-slate-100">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-700">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-600">
          <Shield className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="text-sm font-bold leading-tight">SecuLens</div>
          <div className="text-xs text-slate-400">セキュレンズ</div>
        </div>
      </div>

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
          <div className="text-xs font-medium text-slate-300 mb-1">スキャン残回数</div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold text-white">153</span>
            <span className="text-xs text-slate-400">/ 200回</span>
          </div>
          <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full" style={{ width: "76.5%" }} />
          </div>
          <div className="mt-2.5 flex flex-col gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 leading-tight">
              <ClipboardCheck className="w-2.5 h-2.5" />
              SCS★3 脆弱性診断 対応済
            </span>
            {/* IPA SECURITY ACTION バッジ */}
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
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold">
            山
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-slate-200 truncate">山田 太郎</div>
            <div className="text-xs text-slate-400 truncate">yamada@techsolution.co.jp</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
