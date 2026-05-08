"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Award, X } from "lucide-react";

type CertStatus = { highestTier: 0 | 2 | 3 | 4; completedScans: number; daysSpan: number };

export function PortalButton({
  className,
  children = "支払い情報を管理",
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRetention, setShowRetention] = useState(false);
  const [certStatus, setCertStatus] = useState<CertStatus | null>(null);

  useEffect(() => {
    fetch("/api/me/cert-status")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setCertStatus(d); })
      .catch(() => {});
  }, []);

  async function actuallyOpenPortal() {
    setShowRetention(false);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Failed (${res.status})`);
      }
      const { url } = (await res.json()) as { url?: string };
      if (!url) throw new Error("No portal URL");
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setLoading(false);
    }
  }

  function handleClick() {
    // ★3 以上の証明書を持っているユーザーには引き止めモーダル表示
    if (certStatus && certStatus.highestTier >= 3) {
      setShowRetention(true);
      return;
    }
    actuallyOpenPortal();
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className={
          className ??
          "inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
        }
      >
        {loading ? "読み込み中…" : children}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {/* 解約引き止めモーダル */}
      {showRetention && certStatus && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => setShowRetention(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 px-6 py-5 border-b border-amber-100 flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center flex-shrink-0">
                  <Award className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">本当に解約しますか？</h3>
                  <p className="text-xs text-slate-600 mt-0.5">取得済みの認定証が失効します</p>
                </div>
              </div>
              <button onClick={() => setShowRetention(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5">
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 mb-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-amber-900 mb-1">
                      現在 <span className="text-amber-700">★{certStatus.highestTier === 4 ? "★★★" : "★★"}</span> {certStatus.highestTier === 4 ? "高度継続認定" : "継続実施認定"} を取得中
                    </p>
                    <p className="text-xs text-amber-800/90 leading-relaxed">
                      解約すると認定証が失効し、自社サイト・取引先・監査人への提示ができなくなります。
                      {certStatus.highestTier === 4 && " ★4は60日以上の継続実績が必須のため、再取得には最低60日かかります。"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="text-sm text-slate-700 leading-relaxed mb-4">
                <p className="mb-2">
                  これまで <strong className="text-blue-600">{certStatus.completedScans}回</strong> のセキュリティ診断を <strong className="text-blue-600">{certStatus.daysSpan}日間</strong> にわたり継続実施されてきました。
                </p>
                <p className="text-slate-600 text-xs">
                  解約手続きでは、現在の課金期間終了時まではサービスをご利用いただけますが、
                  期間終了後は認定証ダウンロードができなくなります。
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setShowRetention(false)}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition-colors"
                >
                  認定証を維持する（継続利用）
                </button>
                <button
                  onClick={actuallyOpenPortal}
                  className="w-full py-2.5 text-slate-500 text-xs hover:text-slate-700 transition-colors underline"
                >
                  それでも解約手続きに進む →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
