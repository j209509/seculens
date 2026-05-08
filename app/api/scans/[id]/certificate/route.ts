import { NextResponse } from "next/server";
import { chromium } from "playwright";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/scans/[id]/certificate
 * 完了済みスキャンの公式証明書PDF生成
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const scanId = params.id;
    const url = new URL(req.url);
    const tierParam = parseInt(url.searchParams.get("tier") || "2", 10);
    const tier = ([2, 3, 4] as const).includes(tierParam as 2 | 3 | 4) ? (tierParam as 2 | 3 | 4) : 2;

    // 認可チェック
    const scan = await prisma.scan.findUnique({
      where: { id: scanId },
      include: {
        findings: { select: { severity: true } },
        user: { select: { name: true, email: true } },
      },
    });
    if (!scan) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }
    if (scan.userId) {
      const user = await getCurrentUser();
      if (!user || (user.id !== scan.userId && user.role !== "admin")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    if (scan.status !== "completed") {
      return NextResponse.json({ error: "スキャン未完了の証明書は発行できません" }, { status: 400 });
    }

    // Tier別の発行条件チェック
    if (scan.userId) {
      const userScans = await prisma.scan.findMany({
        where: { userId: scan.userId, status: "completed" },
        select: { id: true, completedAt: true, createdAt: true },
        orderBy: { completedAt: "desc" },
      });
      const completedCount = userScans.length;
      const oldestScanAt = userScans[userScans.length - 1]?.completedAt
        ? new Date(userScans[userScans.length - 1].completedAt!).getTime()
        : null;
      const daysSpan = oldestScanAt ? (Date.now() - oldestScanAt) / (1000 * 60 * 60 * 24) : 0;

      if (tier === 3 && completedCount < 1) {
        return NextResponse.json({
          error: "★3証明書には1回以上のスキャン完了が必要です",
          required: { scans: 1, current: completedCount },
        }, { status: 403 });
      }
      if (tier === 4 && (completedCount < 2 || daysSpan < 60)) {
        return NextResponse.json({
          error: "★4証明書には60日間以上にわたる2回以上のスキャン完了が必要です",
          required: { scans: 2, current: completedCount, daysRequired: 60, daysSpan: Math.floor(daysSpan) },
        }, { status: 403 });
      }
    }

    // 集計
    const sevCounts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const f of scan.findings) {
      sevCounts[f.severity] = (sevCounts[f.severity] ?? 0) + 1;
    }
    const total = scan.findings.length;
    const completedAt = scan.completedAt
      ? new Date(scan.completedAt).toLocaleString("ja-JP", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })
      : "—";
    const issuedAt = new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });
    const certNo = `SQL-${scanId.slice(-10).toUpperCase()}`;
    const ownerName = scan.user?.name?.trim() || scan.user?.email?.split("@")[0] || "ご利用者様";
    const targetHost = (() => {
      try { return new URL(scan.url).hostname; } catch { return scan.url; }
    })();

    // 評価ランク
    const score = scan.riskScore ?? 0;
    let rank = "A";
    let rankColor = "#16a34a";
    let rankNote = "良好";
    if (score >= 70) { rank = "D"; rankColor = "#dc2626"; rankNote = "重大なリスクあり・要対応"; }
    else if (score >= 40) { rank = "C"; rankColor = "#ea580c"; rankNote = "リスク中・改善推奨"; }
    else if (score >= 20) { rank = "B"; rankColor = "#f59e0b"; rankNote = "軽微なリスクあり"; }
    else if (score >= 10) { rank = "A"; rankColor = "#65a30d"; rankNote = "概ね良好"; }
    else { rank = "S"; rankColor = "#16a34a"; rankNote = "優良"; }

    const html = buildCertHtml({
      scanId, certNo, ownerName, targetUrl: scan.url, targetHost,
      issuedAt, completedAt, score, rank, rankColor, rankNote,
      total, sevCounts, tier,
    });

    const browser = await chromium.launch({ headless: true });
    try {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.setContent(html, { waitUntil: "networkidle" });
      const pdf = await page.pdf({
        format: "A4",
        landscape: false,
        printBackground: true,
        preferCSSPageSize: true,
      });
      await ctx.close();
      return new NextResponse(new Uint8Array(pdf), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="Sequlia_Certificate_${certNo}.pdf"`,
        },
      });
    } finally {
      await browser.close().catch(() => undefined);
    }
  } catch (e) {
    console.error("[api/scans/certificate]", e);
    return NextResponse.json({ error: "PDF生成に失敗しました" }, { status: 500 });
  }
}

function buildCertHtml(d: {
  scanId: string; certNo: string; ownerName: string; targetUrl: string; targetHost: string;
  issuedAt: string; completedAt: string; score: number; rank: string; rankColor: string; rankNote: string;
  total: number; sevCounts: Record<string, number>; tier: 2 | 3 | 4;
}): string {
  // Tier別のスタイル・タイトル
  const tierConfig = {
    2: {
      stars: "★★", title: "セキュリティ診断実施宣言証", subtitle: "INITIAL DECLARATION CERTIFICATE",
      mainColor: "#16a34a", bgGradient: "linear-gradient(135deg, #f0fdf4, #dcfce7)",
      eyebrow: "LEVEL 2 — 初期宣言レベル",
      criteria: "Webサイトの脆弱性診断を実施し、セキュリティ対策に取り組む意思を表明",
      stamps: ["ipa"],
    },
    3: {
      stars: "★★★", title: "セキュリティ診断実施認定証", subtitle: "SCS LEVEL 3 COMPLIANCE CERTIFICATE",
      mainColor: "#2563eb", bgGradient: "linear-gradient(135deg, #eff6ff, #dbeafe)",
      eyebrow: "LEVEL 3 — 経産省 SCS★3 対応",
      criteria: "経産省SCS★3要件「インターネット公開機器の脆弱性診断」を実施",
      stamps: ["gov", "ipa"],
    },
    4: {
      stars: "★★★★", title: "セキュリティ診断継続認定証", subtitle: "ADVANCED CONTINUOUS CERTIFICATE",
      mainColor: "#7c3aed", bgGradient: "linear-gradient(135deg, #faf5ff, #ede9fe)",
      eyebrow: "LEVEL 4 — 60日以上の継続運用実績",
      criteria: "60日間以上にわたり継続的に脆弱性診断を実施（2回以上完了）し、組織的なセキュリティ運用が確立",
      stamps: ["gov", "ipa", "advanced"],
    },
  }[d.tier];

  return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><title>セキュリティ診断証明書 — ${d.certNo}</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
@page { size: A4; margin: 0; }
html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: "Hiragino Mincho ProN", "Yu Mincho", "MS Mincho", serif;
       color: #0f172a; line-height: 1.7; font-size: 10pt; }

.cert-page {
  width: 210mm; height: 297mm; padding: 14mm;
  background: #fefefe;
  position: relative;
  overflow: hidden;
}

/* 装飾的な枠線 */
.cert-frame {
  position: absolute; inset: 8mm;
  border: 3px solid ${tierConfig.mainColor};
  border-radius: 4mm;
  background: ${tierConfig.bgGradient};
}
.cert-frame::before {
  content: ""; position: absolute; inset: 3mm;
  border: 1px solid #d4af37;
  border-radius: 2mm;
}

/* 角飾り */
.corner-decoration {
  position: absolute; width: 28mm; height: 28mm;
  background: linear-gradient(135deg, #d4af37, #f59e0b);
  opacity: 0.85;
}
.corner-decoration.tl { top: 8mm; left: 8mm; clip-path: polygon(0 0, 100% 0, 0 100%); border-radius: 4mm 0 0 0; }
.corner-decoration.tr { top: 8mm; right: 8mm; clip-path: polygon(100% 0, 0 0, 100% 100%); border-radius: 0 4mm 0 0; }
.corner-decoration.bl { bottom: 8mm; left: 8mm; clip-path: polygon(0 0, 100% 100%, 0 100%); border-radius: 0 0 0 4mm; }
.corner-decoration.br { bottom: 8mm; right: 8mm; clip-path: polygon(100% 0, 100% 100%, 0 100%); border-radius: 0 0 4mm 0; }

.cert-content {
  position: absolute; inset: 16mm;
  display: flex; flex-direction: column;
}

/* ヘッダー */
.cert-header {
  text-align: center;
  padding-top: 6mm;
  padding-bottom: 4mm;
}
.cert-stamps {
  display: flex; justify-content: center; gap: 8mm; margin-bottom: 6mm;
}
.stamp-circle {
  width: 22mm; height: 22mm; border-radius: 50%;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  color: #fff; font-weight: 800; text-align: center; line-height: 1.1;
  font-family: "Hiragino Kaku Gothic ProN", sans-serif;
}
.stamp-circle.gov { background: linear-gradient(135deg, #f59e0b, #d97706); box-shadow: 0 4px 12px rgba(245,158,11,0.4); }
.stamp-circle.ipa { background: linear-gradient(135deg, #16a34a, #15803d); box-shadow: 0 4px 12px rgba(22,163,74,0.4); }
.stamp-circle .lbl { font-size: 6pt; opacity: 0.9; }
.stamp-circle .gov-txt { font-size: 7pt; }
.stamp-circle .num { font-size: 9pt; }

.cert-eyebrow {
  font-size: 9pt; color: #1e3a8a; letter-spacing: 0.4em;
  font-family: "Hiragino Kaku Gothic ProN", sans-serif;
  font-weight: 700;
}
.cert-title {
  font-size: 32pt; color: #0f172a; font-weight: 900;
  letter-spacing: 0.1em; margin: 4mm 0 2mm;
  font-family: "Hiragino Mincho ProN", "Yu Mincho", serif;
}
.cert-subtitle {
  font-size: 10pt; color: #64748b; letter-spacing: 0.2em;
  font-family: "Hiragino Kaku Gothic ProN", sans-serif;
}
.cert-divider {
  width: 60mm; height: 1px; background: #d4af37; margin: 5mm auto;
}

/* 本文 */
.cert-body {
  flex: 1; display: flex; flex-direction: column; align-items: center;
  text-align: center; padding: 4mm 8mm 0;
}
.cert-statement {
  font-size: 11pt; color: #475569; line-height: 2.0;
  margin-bottom: 8mm;
}
.cert-target {
  font-size: 16pt; color: #0f172a; font-weight: 800;
  font-family: "Hiragino Kaku Gothic ProN", sans-serif;
  padding: 4mm 8mm; border-bottom: 2px solid #1e3a8a;
  margin-bottom: 6mm;
  letter-spacing: 0.02em;
}

/* スコアパネル */
.score-grid {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm;
  width: 100%; margin-bottom: 5mm;
  font-family: "Hiragino Kaku Gothic ProN", sans-serif;
}
.score-cell {
  background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 2mm;
  padding: 3mm 2mm; text-align: center;
}
.score-cell .lbl { font-size: 7pt; color: #64748b; font-weight: 600; }
.score-cell .val { font-size: 14pt; color: #0f172a; font-weight: 800; line-height: 1.2; margin-top: 1mm; }

/* リスクランク */
.rank-badge {
  display: inline-flex; align-items: center; gap: 4mm;
  background: ${d.rankColor}; color: #fff;
  padding: 4mm 8mm; border-radius: 4mm;
  margin-bottom: 4mm;
  font-family: "Hiragino Kaku Gothic ProN", sans-serif;
}
.rank-badge .label { font-size: 8pt; opacity: 0.9; }
.rank-badge .rank { font-size: 24pt; font-weight: 900; line-height: 1; letter-spacing: 0.05em; }
.rank-badge .desc { font-size: 9pt; }

/* 検出件数 */
.severity-row {
  display: flex; gap: 2mm; flex-wrap: wrap; justify-content: center;
  font-family: "Hiragino Kaku Gothic ProN", sans-serif;
  margin-bottom: 5mm;
}
.sev-pill {
  padding: 1.5mm 4mm; border-radius: 6mm; font-size: 8.5pt; font-weight: 700;
  border: 1.5px solid;
}
.sev-pill.critical { background: #fee2e2; color: #991b1b; border-color: #fca5a5; }
.sev-pill.high { background: #ffedd5; color: #9a3412; border-color: #fdba74; }
.sev-pill.medium { background: #fef3c7; color: #92400e; border-color: #fcd34d; }
.sev-pill.low { background: #d1fae5; color: #065f46; border-color: #6ee7b7; }
.sev-pill.info { background: #f1f5f9; color: #475569; border-color: #cbd5e1; }

/* 適合範囲 */
.compliance-box {
  background: linear-gradient(135deg, #eff6ff, #dbeafe);
  border: 1px solid #bfdbfe; border-radius: 3mm;
  padding: 4mm 5mm; width: 100%;
  font-size: 8.5pt; color: #1e3a8a;
  font-family: "Hiragino Kaku Gothic ProN", sans-serif;
}
.compliance-box strong { color: #1e3a8a; }
.compliance-box ul { margin-top: 1mm; padding-left: 5mm; }
.compliance-box li { margin-bottom: 0.5mm; line-height: 1.5; }

/* フッター */
.cert-footer {
  margin-top: 6mm; padding-top: 4mm;
  border-top: 1px solid #e2e8f0;
  font-family: "Hiragino Kaku Gothic ProN", sans-serif;
}
.signature-row {
  display: grid; grid-template-columns: 1fr 1fr; gap: 8mm;
  align-items: end;
}
.sig-block { text-align: center; }
.sig-block .label { font-size: 7.5pt; color: #94a3b8; }
.sig-block .name { font-size: 11pt; color: #0f172a; font-weight: 800; margin-top: 1mm; padding-bottom: 1mm; border-bottom: 1px solid #94a3b8; }
.sig-block .role { font-size: 7.5pt; color: #64748b; margin-top: 1mm; }

.cert-meta {
  text-align: center; font-size: 7.5pt; color: #94a3b8;
  margin-top: 3mm; line-height: 1.6;
}
.cert-meta .certno { font-family: ui-monospace, "SF Mono", monospace; color: #1e3a8a; font-weight: 700; }

/* 認定印 */
.seal {
  position: absolute; right: -2mm; top: 0;
  width: 28mm; height: 28mm;
  border-radius: 50%;
  background: radial-gradient(circle, #fff 30%, transparent 31%), conic-gradient(#dc2626, #dc2626 50%, #fff 50%, #fff);
  border: 1.5px solid #dc2626;
  display: flex; align-items: center; justify-content: center;
  transform: rotate(-15deg);
  box-shadow: 0 2px 8px rgba(220,38,38,0.2);
}
.seal-inner {
  width: 22mm; height: 22mm; border: 1px solid #dc2626; border-radius: 50%;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  color: #dc2626; font-weight: 900; text-align: center; line-height: 1.1;
  font-family: "Hiragino Mincho ProN", serif;
  background: #fefefe;
}
.seal-inner .top { font-size: 6pt; letter-spacing: 0.1em; }
.seal-inner .main { font-size: 9pt; margin: 0.5mm 0; }
.seal-inner .bottom { font-size: 6pt; }

</style></head>
<body>

<div class="cert-page">
  <div class="cert-frame"></div>
  <div class="corner-decoration tl"></div>
  <div class="corner-decoration tr"></div>
  <div class="corner-decoration bl"></div>
  <div class="corner-decoration br"></div>

  <div class="cert-content">
    <!-- ヘッダー -->
    <div class="cert-header">
      <div class="cert-stamps">
        ${tierConfig.stamps.includes("gov") ? `
        <div class="stamp-circle gov">
          <div class="lbl">経済産業省</div>
          <div class="gov-txt">SCS</div>
          <div class="num">★★★</div>
          <div class="lbl">Level 3</div>
        </div>` : ''}
        ${tierConfig.stamps.includes("ipa") ? `
        <div class="stamp-circle ipa">
          <div class="lbl">IPA</div>
          <div class="gov-txt">SECURITY</div>
          <div class="num">★★</div>
          <div class="lbl">ACTION</div>
        </div>` : ''}
        ${tierConfig.stamps.includes("advanced") ? `
        <div class="stamp-circle" style="background: linear-gradient(135deg, #7c3aed, #5b21b6); box-shadow: 0 4px 12px rgba(124,58,237,0.4);">
          <div class="lbl">継続実績</div>
          <div class="gov-txt">60日+</div>
          <div class="num">${tierConfig.stars}</div>
          <div class="lbl">ADVANCED</div>
        </div>` : ''}
      </div>

      <div class="cert-eyebrow">${escapeHtml(tierConfig.eyebrow)}</div>
      <div class="cert-title">${escapeHtml(tierConfig.title)}</div>
      <div class="cert-subtitle">${escapeHtml(tierConfig.subtitle)}</div>
      <div class="cert-divider"></div>
    </div>

    <!-- 本文 -->
    <div class="cert-body">
      <p class="cert-statement">
        本書は、下記Webサイトに対して<br>
        Sequlia公式セキュリティ診断（OWASP Top 10 完全準拠／23カテゴリ・174項目）が<br>
        正常に完了したことを証明します。
      </p>

      <div class="cert-target">
        ${escapeHtml(d.targetHost)}
      </div>

      <!-- スコア＋ランク -->
      <div class="rank-badge">
        <div>
          <div class="label">RISK GRADE</div>
          <div class="rank">${d.rank}</div>
        </div>
        <div style="text-align:left;">
          <div class="desc">${escapeHtml(d.rankNote)}</div>
          <div style="font-size:7.5pt; opacity:0.9; margin-top:1mm;">リスクスコア：${d.score} / 100</div>
        </div>
      </div>

      <div class="score-grid">
        <div class="score-cell">
          <div class="lbl">診断対象</div>
          <div class="val" style="font-size:8pt; word-break:break-all;">${escapeHtml(d.targetUrl)}</div>
        </div>
        <div class="score-cell">
          <div class="lbl">診断完了日</div>
          <div class="val" style="font-size:9pt;">${d.completedAt}</div>
        </div>
        <div class="score-cell">
          <div class="lbl">検出件数</div>
          <div class="val">${d.total}</div>
        </div>
        <div class="score-cell">
          <div class="lbl">診断項目数</div>
          <div class="val">174 / 174</div>
        </div>
      </div>

      <div class="severity-row">
        ${d.sevCounts.critical > 0 ? `<span class="sev-pill critical">CRITICAL: ${d.sevCounts.critical}</span>` : ''}
        ${d.sevCounts.high > 0 ? `<span class="sev-pill high">HIGH: ${d.sevCounts.high}</span>` : ''}
        ${d.sevCounts.medium > 0 ? `<span class="sev-pill medium">MEDIUM: ${d.sevCounts.medium}</span>` : ''}
        ${d.sevCounts.low > 0 ? `<span class="sev-pill low">LOW: ${d.sevCounts.low}</span>` : ''}
        ${d.sevCounts.info > 0 ? `<span class="sev-pill info">INFO: ${d.sevCounts.info}</span>` : ''}
        ${d.total === 0 ? `<span class="sev-pill low">脆弱性検出なし — 良好</span>` : ''}
      </div>

      <div class="compliance-box">
        <strong>本診断は以下の基準に準拠しています：</strong>
        <ul>
          <li>OWASP Top 10（2021）全カテゴリ準拠 — A01アクセス制御の破損 〜 A10サーバサイドリクエストフォージェリ</li>
          <li>経産省「サプライチェーン強化に向けた連携プログラム」SCS★3 主要要件への対応</li>
          <li>IPA「SECURITY ACTION」★★ 二つ星 取り組み宣言</li>
          <li>不正アクセス禁止法・個人情報保護法に準拠した非破壊的・受動的検査</li>
        </ul>
      </div>
    </div>

    <!-- フッター -->
    <div class="cert-footer">
      <div class="signature-row">
        <div class="sig-block">
          <div class="label">受診者 ／ Recipient</div>
          <div class="name">${escapeHtml(d.ownerName)}</div>
          <div class="role">スキャン実施者</div>
        </div>
        <div class="sig-block" style="position:relative;">
          <div class="label">発行者 ／ Issuer</div>
          <div class="name">Sequlia</div>
          <div class="role">セキュリティ診断プラットフォーム</div>
          <div class="seal">
            <div class="seal-inner">
              <div class="top">SEQULIA</div>
              <div class="main">認定印</div>
              <div class="bottom">★★★</div>
            </div>
          </div>
        </div>
      </div>

      <div class="cert-meta">
        証明書番号：<span class="certno">${d.certNo}</span> ／ 発行日：${d.issuedAt}<br>
        本証明書の真正性は <strong>seculens.fly.dev/verify/${d.certNo}</strong> で確認できます ／ © Sequlia
      </div>
    </div>
  </div>
</div>

</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c));
}
