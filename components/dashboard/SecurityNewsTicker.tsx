"use client";

import { useEffect, useState } from "react";
import { Radio, ExternalLink } from "lucide-react";

type NewsItem = {
  title: string;
  link: string;
  pubDate: string;
  source: string;
};

export function SecurityNewsTicker() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/security-news")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (Array.isArray(d?.items) && d.items.length > 0) setItems(d.items);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-4 py-2.5 text-xs text-slate-400 border border-slate-800">
        <Radio className="w-3.5 h-3.5 animate-pulse text-emerald-400" />
        <span>最新セキュリティ情報を取得中...</span>
      </div>
    );
  }

  if (items.length === 0) return null;

  // 同じテキストを2回繰り返してシームレスループ
  const loopItems = [...items, ...items];

  return (
    <div className="rounded-xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border border-slate-800 overflow-hidden relative shadow-sm">
      {/* ラベル */}
      <div className="absolute left-0 top-0 bottom-0 z-10 flex items-center px-3 bg-gradient-to-r from-slate-900 via-slate-900 to-transparent">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider whitespace-nowrap">LIVE</span>
          <span className="text-[11px] font-medium text-slate-300 whitespace-nowrap">セキュリティ最新情報</span>
        </div>
      </div>

      {/* 流れるテキスト */}
      <div className="overflow-hidden ticker-track whitespace-nowrap py-2.5 pl-44 pr-4">
        <div className="inline-flex gap-8 ticker-content">
          {loopItems.map((item, i) => (
            <a
              key={`${item.link}-${i}`}
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-slate-300 hover:text-blue-300 transition-colors inline-flex items-center gap-1.5"
              title={item.title}
            >
              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wide bg-blue-950 px-1.5 py-0.5 rounded">
                {item.source}
              </span>
              <span className="truncate" style={{ maxWidth: 480 }}>{item.title}</span>
              <ExternalLink className="w-3 h-3 opacity-60" />
              <span className="text-slate-600 mx-2">•</span>
            </a>
          ))}
        </div>
      </div>

      <style>{`
        .ticker-content {
          animation: ticker 60s linear infinite;
        }
        .ticker-track:hover .ticker-content {
          animation-play-state: paused;
        }
        @keyframes ticker {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
