import type { Viewport } from "next";
import { Sidebar } from "@/components/sidebar";

/**
 * (app) ルートグループはダッシュボード・管理画面など。
 * スマホでも「PC画面をそのまま指でスライド」して使える設計。
 * → ビューポートをPC幅(1280px)で固定 → モバイル端末ではピンチイン/ズームで操作。
 * → モバイル用のレスポンシブな縮小・縦積みは行わない。
 */
export const viewport: Viewport = {
  width: 1280,
  initialScale: 1,
  minimumScale: 0.25,
  maximumScale: 3,
  userScalable: true,
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex min-h-screen bg-slate-50"
      style={{ minWidth: 1280 }}
    >
      <Sidebar />
      <main className="flex-1 overflow-auto" style={{ minWidth: 0 }}>{children}</main>
    </div>
  );
}
