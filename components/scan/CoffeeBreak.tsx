"use client";

import { useEffect, useState } from "react";

const MESSAGES: { emoji: string; title: string; sub: string }[] = [
  { emoji: "☕", title: "コーヒーでも飲んで休憩していてください", sub: "診断は最大10分ほどかかります。バックグラウンドで継続中です。" },
  { emoji: "🌿", title: "深呼吸してリラックス", sub: "ページを閉じても診断は止まりません。結果はメールで届きます（実装予定）。" },
  { emoji: "🐱", title: "猫を撫でる時間です", sub: "AIが22種類のセキュリティ項目を順番に検査しています..." },
  { emoji: "🧘", title: "肩のストレッチでもどうぞ", sub: "脆弱性パターン110+項目をチェック中。少々お待ちください。" },
  { emoji: "🍵", title: "お茶の時間にぴったり", sub: "並列実行で時間短縮しています。経産省SCS★3対応の精度です。" },
  { emoji: "📚", title: "本を1ページめくれそう", sub: "深いチェックほど時間がかかります。のんびりお待ちを。" },
  { emoji: "🪴", title: "観葉植物に水やりタイム", sub: "診断中にあなたのサイトの安全性をしっかり見ています。" },
  { emoji: "🎵", title: "好きな曲を1曲どうぞ", sub: "ノイズの少ない高精度スキャンを実行中..." },
];

export function CoffeeBreak({ elapsedSec }: { elapsedSec: number }) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    // 3分（180秒）ごとに切替
    const t = setInterval(() => setIdx((i) => (i + 1) % MESSAGES.length), 180000);
    return () => clearInterval(t);
  }, []);

  // 30秒経過してから出す（短時間スキャンには出さない）
  if (elapsedSec < 30) return null;
  const m = MESSAGES[idx];

  return (
    <div
      className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 p-5 flex items-center gap-4 transition-all duration-500"
      key={idx}
      style={{ animation: "coffeeFadeIn 0.5s ease-out" }}
    >
      <div className="text-5xl flex-shrink-0" aria-hidden>{m.emoji}</div>
      <div className="min-w-0">
        <div className="text-base font-bold text-amber-900">{m.title}</div>
        <div className="text-sm text-amber-700/80 mt-1 leading-relaxed">{m.sub}</div>
      </div>
      <style>{`
        @keyframes coffeeFadeIn {
          0% { opacity: 0; transform: translateY(6px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
