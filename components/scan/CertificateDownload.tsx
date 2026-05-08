"use client";

import { useEffect, useState } from "react";
import { Award, Lock, Download } from "lucide-react";

type Eligibility = {
  tier2: { eligible: boolean; reason: string };
  tier3: { eligible: boolean; reason: string; current: number; required: number };
  tier4: { eligible: boolean; reason: string; current: number; required: number; daysSpan: number; daysRequired: number };
};

const TIERS = [
  {
    id: 2 as const,
    stars: "★★",
    name: "実施宣言証",
    desc: "Webサイトの脆弱性診断を実施したことを証明する基本証明書",
    color: "#16a34a",
    bgClass: "bg-emerald-50 border-emerald-200",
    starClass: "text-emerald-600",
  },
  {
    id: 3 as const,
    stars: "★★★",
    name: "継続実施認定証",
    desc: "経産省 SCS★3 要件「継続的な脆弱性診断」に対応する認定証",
    color: "#2563eb",
    bgClass: "bg-blue-50 border-blue-200",
    starClass: "text-blue-600",
    badge: "経産省 SCS★3 対応",
  },
  {
    id: 4 as const,
    stars: "★★★★",
    name: "高度継続認定証",
    desc: "60日以上の継続運用実績を持つ組織のみが取得できる最上位認定",
    color: "#7c3aed",
    bgClass: "bg-purple-50 border-purple-200",
    starClass: "text-purple-600",
    badge: "PREMIUM",
  },
];

export function CertificateDownload({ scanId }: { scanId: string }) {
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/scans/${scanId}/certificate-eligibility`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setEligibility(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [scanId]);

  if (loading) return null;
  if (!eligibility) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center flex-shrink-0">
          <Award className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">公式セキュリティ診断証明書</h2>
          <p className="text-sm text-slate-600 mt-0.5">取引先への提示・SCS監査・ISMS更新時にご利用いただけます。</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {TIERS.map((tier) => {
          const elig = tier.id === 2 ? eligibility.tier2 : tier.id === 3 ? eligibility.tier3 : eligibility.tier4;
          const isEligible = elig.eligible;
          return (
            <div
              key={tier.id}
              className={`relative rounded-xl border-2 p-4 transition-all ${
                isEligible ? tier.bgClass : "bg-slate-50 border-slate-200 opacity-70"
              }`}
            >
              {tier.badge && isEligible && (
                <span className="absolute -top-2 right-3 bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded">
                  {tier.badge}
                </span>
              )}
              <div className="flex items-center gap-2 mb-2">
                <div className={`text-xl ${tier.starClass} font-bold`}>{tier.stars}</div>
                {!isEligible && <Lock className="w-3.5 h-3.5 text-slate-400 ml-auto" />}
              </div>
              <div className="text-sm font-bold text-slate-900 mb-1">{tier.name}</div>
              <div className="text-xs text-slate-500 leading-relaxed mb-3" style={{ minHeight: 48 }}>
                {tier.desc}
              </div>

              {isEligible ? (
                <a
                  href={`/api/scans/${scanId}/certificate?tier=${tier.id}`}
                  download
                  className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg text-white text-sm font-semibold transition-opacity hover:opacity-90"
                  style={{ background: tier.color }}
                >
                  <Download className="w-3.5 h-3.5" />
                  PDFダウンロード
                </a>
              ) : (
                <div className="text-xs text-slate-500 bg-white border border-slate-200 rounded-lg px-3 py-2">
                  🔒 {elig.reason}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">
        ※ 経済産業省「サプライチェーン強化に向けた連携プログラム（SCS）」評価制度の主要要件への対応を示す証明書として、取引先・監査人にご提示いただけます。
        証明書には固有の証明書番号が付与され、URL から真正性を確認できます。
      </p>
    </div>
  );
}
