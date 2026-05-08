// Sequlia サービス資料 PDF 生成スクリプト（横長 A4 / プレゼン形式）
// 実行: node scripts/generate-overview-pdf.mjs
// 出力: public/docs/Sequlia_Service_Overview.pdf
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const today = new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });

const html = `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><title>Sequlia サービス資料</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
@page { size: A4 landscape; margin: 0; }
html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif;
       color: #0f172a; line-height: 1.55; font-size: 9pt; }

/* ─── ページ ─── */
.page { width: 297mm; height: 210mm; padding: 14mm 16mm; page-break-after: always; position: relative;
        overflow: hidden; background: #fff; }
.page:last-child { page-break-after: auto; }
.page-no { position: absolute; bottom: 8mm; right: 16mm; font-size: 8pt; color: #94a3b8; }
.page-header { position: absolute; top: 6mm; left: 16mm; right: 16mm; display: flex; justify-content: space-between;
               font-size: 8pt; color: #64748b; padding-bottom: 2mm; border-bottom: 1px solid #e2e8f0; }
.page-header .brand { color: #2563eb; font-weight: 800; letter-spacing: 0.05em; }
.page-content { margin-top: 8mm; }

/* ─── タイポグラフィ ─── */
h1 { font-size: 24pt; color: #0f172a; font-weight: 900; letter-spacing: -0.02em; line-height: 1.15; margin-bottom: 3mm; }
h2 { font-size: 20pt; color: #0f172a; font-weight: 900; line-height: 1.2; margin-bottom: 2mm; letter-spacing: -0.01em; }
h2 .accent { color: #2563eb; }
h3 { font-size: 11pt; color: #1e3a8a; font-weight: 800; margin: 3mm 0 2mm; }
h4 { font-size: 10pt; color: #2563eb; font-weight: 700; margin: 2mm 0 1mm; }
p { margin-bottom: 2mm; }
ul, ol { margin-left: 5mm; }
li { margin-bottom: 0.8mm; line-height: 1.5; }
strong { color: #0f172a; font-weight: 700; }
.lead { font-size: 10pt; color: #475569; line-height: 1.7; margin-bottom: 4mm; }

.tier-tag { display: inline-block; background: #2563eb; color: #fff; padding: 0.5mm 2.5mm;
            border-radius: 1.5mm; font-size: 8pt; font-weight: 800; letter-spacing: 0.05em; margin-bottom: 2mm; }

/* ─── 表紙 ─── */
.cover { background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 50%, #2563eb 100%);
         color: #fff; height: 210mm; padding: 0; display: grid; grid-template-columns: 1.3fr 1fr; position: relative; overflow: hidden; }
.cover::before { content: ""; position: absolute; top: -10%; right: -10%; width: 500px; height: 500px;
                 background: radial-gradient(circle, rgba(96,165,250,0.4) 0%, transparent 70%); }
.cover::after { content: ""; position: absolute; bottom: -20%; right: 20%; width: 400px; height: 400px;
                background: radial-gradient(circle, rgba(56,189,248,0.3) 0%, transparent 70%); }
.cover-left { padding: 22mm 18mm; display: flex; flex-direction: column; justify-content: space-between; position: relative; z-index: 2; }
.cover-logo { font-size: 42pt; font-weight: 900; letter-spacing: -0.03em; line-height: 1;
              text-shadow: 0 4px 24px rgba(37,99,235,0.4); }
.cover-tag { font-size: 11pt; color: #93c5fd; font-weight: 500; margin-top: 2mm; letter-spacing: 0.1em; }
.cover-mid h1 { font-size: 30pt; color: #fff; font-weight: 900; line-height: 1.2; letter-spacing: -0.02em; }
.cover-mid h1 em { color: #fbbf24; font-style: normal; }
.cover-mid p { font-size: 11pt; color: #cbd5e1; margin-top: 6mm; line-height: 1.7; }
.cover-badges { margin-top: 6mm; display: flex; gap: 4mm; flex-wrap: wrap; }
.badge-cover { background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.25); border-radius: 4mm;
               padding: 2mm 5mm; font-size: 9pt; font-weight: 700; }
.cover-meta { font-size: 9pt; color: #94a3b8; }
.cover-meta strong { color: #fff; }
.cover-right { padding: 22mm 18mm; display: flex; align-items: center; justify-content: center; position: relative; z-index: 2; }
.stamps-vertical { display: flex; flex-direction: column; gap: 8mm; align-items: center; }
.stamp-circle { width: 38mm; height: 38mm; border-radius: 50%; background: linear-gradient(135deg, #f59e0b, #d97706);
                display: flex; flex-direction: column; align-items: center; justify-content: center;
                color: #fff; font-weight: 900; text-align: center; line-height: 1.1;
                box-shadow: 0 8px 24px rgba(245,158,11,0.5); }
.stamp-circle.green { background: linear-gradient(135deg, #16a34a, #15803d); box-shadow: 0 8px 24px rgba(22,163,74,0.5); }
.stamp-circle .lbl { font-size: 8pt; opacity: 0.9; }
.stamp-circle .gov { font-size: 9pt; }
.stamp-circle .num { font-size: 14pt; }

/* ─── KPI ─── */
.kpi-grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4mm; margin: 4mm 0; }
.kpi { background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border: 1px solid #bfdbfe;
       border-radius: 3mm; padding: 5mm 3mm; text-align: center; }
.kpi .num { font-size: 22pt; font-weight: 900; color: #2563eb; line-height: 1; letter-spacing: -0.02em; }
.kpi .lbl { font-size: 8.5pt; color: #475569; margin-top: 1mm; font-weight: 700; }

/* ─── アラート ─── */
.alert { border-radius: 2mm; padding: 3mm 4mm; margin: 3mm 0; border-left: 3px solid; font-size: 9pt; }
.alert.danger { background: #fef2f2; border-color: #dc2626; }
.alert.danger strong { color: #991b1b; }
.alert.warn { background: #fffbeb; border-color: #f59e0b; }
.alert.warn strong { color: #92400e; }
.alert.info { background: #eff6ff; border-color: #2563eb; }
.alert.info strong { color: #1e3a8a; }
.alert.success { background: #f0fdf4; border-color: #16a34a; }
.alert.success strong { color: #14532d; }

/* ─── テーブル ─── */
table { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin: 2mm 0 4mm; }
th, td { border: 1px solid #e2e8f0; padding: 2mm 3mm; text-align: left; vertical-align: top; line-height: 1.5; }
th { background: #1e3a8a; color: #fff; font-weight: 700; font-size: 8.5pt; }
tr:nth-child(even) td { background: #f8fafc; }

/* ─── 2カラム ─── */
.col-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
.col-2-narrow { display: grid; grid-template-columns: 1.5fr 1fr; gap: 5mm; }
.col-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; }
.col-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; }

/* ─── 脅威カード ─── */
.threat-grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; margin: 3mm 0; }
.threat-card { background: #fef2f2; border: 1px solid #fecaca; border-radius: 3mm; padding: 4mm 3mm; text-align: center; }
.threat-card .num { font-size: 18pt; font-weight: 900; color: #dc2626; line-height: 1; }
.threat-card .lbl { font-size: 8pt; color: #991b1b; font-weight: 700; margin-top: 1mm; }
.threat-card .desc { font-size: 7.5pt; color: #64748b; margin-top: 2mm; line-height: 1.5; }

/* ─── 機能カード ─── */
.feat-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; margin: 3mm 0; }
.feat-card { background: linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%); border: 1px solid #e2e8f0;
             border-radius: 3mm; padding: 4mm; }
.feat-card .ico { font-size: 18pt; line-height: 1; }
.feat-card .ttl { font-size: 10pt; font-weight: 800; color: #1e3a8a; margin: 2mm 0 1mm; }
.feat-card .desc { font-size: 8.5pt; color: #475569; line-height: 1.6; }

/* ─── 7つの脅威 ─── */
.threat-list { display: grid; grid-template-columns: repeat(2, 1fr); gap: 3mm 6mm; margin: 4mm 0; }
.threat-item { padding: 3mm 4mm; background: #fef2f2; border-left: 3px solid #dc2626; border-radius: 0 2mm 2mm 0; }
.threat-item .head { display: flex; align-items: baseline; gap: 2mm; margin-bottom: 1mm; }
.threat-item .num-circle { font-size: 12pt; font-weight: 900; color: #dc2626; }
.threat-item .ttl { font-size: 10pt; font-weight: 800; color: #0f172a; }
.threat-item .desc { font-size: 8pt; color: #475569; line-height: 1.5; }

/* ─── 価格 ─── */
.pricing-grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; margin: 3mm 0; }
.price-card { border: 1.5px solid #e2e8f0; border-radius: 3mm; padding: 5mm 4mm; background: #fff; position: relative; }
.price-card.popular { border: 2px solid #2563eb; box-shadow: 0 4px 12px rgba(37,99,235,0.15); }
.price-card.popular::before { content: "人気"; position: absolute; top: -3mm; left: 4mm; background: #f59e0b;
                              color: #fff; padding: 0.5mm 2.5mm; border-radius: 1.5mm; font-size: 7.5pt; font-weight: 800; }
.price-card .name { font-size: 11pt; font-weight: 800; color: #0f172a; }
.price-card .amount { font-size: 18pt; font-weight: 900; color: #2563eb; line-height: 1; margin: 2mm 0; }
.price-card .amount span { font-size: 8pt; color: #94a3b8; font-weight: 500; }
.price-card ul { font-size: 8pt; color: #475569; list-style: none; padding: 0; margin-left: 0; }
.price-card li { padding-left: 4mm; position: relative; margin-bottom: 1mm; }
.price-card li::before { content: "✓"; position: absolute; left: 0; color: #16a34a; font-weight: 800; }

/* ─── テスティモニアル ─── */
.testimonial-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; margin: 4mm 0; }
.testimonial { background: linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%); border-left: 3px solid #2563eb;
               padding: 4mm; border-radius: 0 2mm 2mm 0; }
.testimonial .quote { font-size: 9pt; color: #0f172a; line-height: 1.7; font-style: italic; margin-bottom: 3mm; }
.testimonial .stars { color: #fbbf24; font-size: 9pt; margin-bottom: 2mm; }
.testimonial .person { font-size: 7.5pt; color: #64748b; }
.testimonial .person strong { color: #1e3a8a; display: block; font-size: 8.5pt; }

/* ─── お問い合わせ ─── */
.contact-box { background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); color: #fff;
               padding: 6mm 8mm; border-radius: 3mm; margin: 3mm 0; }
.contact-box h3 { color: #fff; margin: 0 0 3mm; font-size: 13pt; }
.contact-box p { color: #cbd5e1; }
.contact-box table { border: none; }
.contact-box th, .contact-box td { border: none; background: transparent; color: #fff; padding: 1mm 0; }
.contact-box th { width: 28mm; color: #93c5fd; font-weight: 600; }
.contact-box tr:nth-child(even) td { background: transparent; }

/* ─── ステップ ─── */
.steps-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; margin: 4mm 0; }
.step-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 3mm; padding: 5mm 4mm; text-align: center; position: relative; }
.step-card .num { width: 12mm; height: 12mm; background: #2563eb; color: #fff; border-radius: 50%;
                  display: inline-flex; align-items: center; justify-content: center; font-weight: 900;
                  font-size: 14pt; margin-bottom: 2mm; }
.step-card .ttl { font-size: 11pt; font-weight: 800; color: #0f172a; margin-bottom: 1mm; }
.step-card .desc { font-size: 8.5pt; color: #475569; line-height: 1.6; }

.note { font-size: 7.5pt; color: #94a3b8; line-height: 1.6; }

/* ─── TOC ─── */
.toc-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4mm 12mm; margin-top: 6mm; font-size: 11pt; }
.toc-item { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px dashed #cbd5e1; padding: 2mm 0; }
.toc-item .num { color: #2563eb; font-weight: 900; margin-right: 4mm; font-size: 14pt; }
.toc-item .ttl { flex: 1; color: #0f172a; font-weight: 600; }
.toc-item .pg { color: #94a3b8; font-size: 10pt; }

</style></head>
<body>

<!-- ═══════════════ 表紙 ═══════════════ -->
<div class="cover">
  <div class="cover-left">
    <div>
      <div class="cover-logo">Sequlia</div>
      <div class="cover-tag">SECURITY DIAGNOSIS PLATFORM</div>
    </div>
    <div class="cover-mid">
      <h1>あなたのWebサイトを、<br />サイバー攻撃から<em>守る</em>。</h1>
      <p>AI駆動の自動セキュリティ診断。OWASP Top 10 完全準拠・<br>23カテゴリ・174項目を最短3分で網羅検査します。</p>
      <div class="cover-badges">
        <div class="badge-cover">経産省 SCS★3</div>
        <div class="badge-cover">IPA SECURITY ACTION ★2</div>
        <div class="badge-cover">OWASP Top 10</div>
      </div>
    </div>
    <div class="cover-meta">
      <div><strong>Sequlia サービス資料</strong></div>
      <div>発行日: ${today} ／ 版: 2026 v1.0</div>
    </div>
  </div>
  <div class="cover-right">
    <div class="stamps-vertical">
      <div class="stamp-circle">
        <div class="lbl">経済産業省</div>
        <div class="gov">SCS</div>
        <div class="num">★★★</div>
        <div class="lbl">Level 3</div>
      </div>
      <div class="stamp-circle green">
        <div class="lbl">IPA</div>
        <div class="gov">SECURITY</div>
        <div class="num">★★</div>
      </div>
    </div>
  </div>
</div>

<!-- ═══════════════ 目次 ═══════════════ -->
<div class="page">
  <div class="page-header"><span class="brand">Sequlia</span><span>目次 ／ Table of Contents</span></div>
  <div class="page-content">
    <h1>目次</h1>
    <div class="toc-grid">
      <div class="toc-item"><span class="num">01</span><span class="ttl">なぜ今、Webセキュリティ対策が急務なのか</span><span class="pg">P.3</span></div>
      <div class="toc-item"><span class="num">02</span><span class="ttl">あなたのサイトに潜む7つの脅威</span><span class="pg">P.4</span></div>
      <div class="toc-item"><span class="num">03</span><span class="ttl">Sequliaが選ばれる6つの理由</span><span class="pg">P.5</span></div>
      <div class="toc-item"><span class="num">04</span><span class="ttl">23カテゴリ・174項目の診断内容</span><span class="pg">P.6-7</span></div>
      <div class="toc-item"><span class="num">05</span><span class="ttl">経産省 SCS★3 対応の詳細</span><span class="pg">P.8</span></div>
      <div class="toc-item"><span class="num">06</span><span class="ttl">料金プラン・コスト比較</span><span class="pg">P.9</span></div>
      <div class="toc-item"><span class="num">07</span><span class="ttl">導入事例・お客様の声</span><span class="pg">P.10</span></div>
      <div class="toc-item"><span class="num">08</span><span class="ttl">お問い合わせ・3ステップ導入</span><span class="pg">P.11</span></div>
    </div>
  </div>
  <div class="page-no">P.2</div>
</div>

<!-- ═══════════════ Ch1: 危機感 ═══════════════ -->
<div class="page">
  <div class="page-header"><span class="brand">Sequlia</span><span>01 ／ なぜ今、Webセキュリティ対策が急務なのか</span></div>
  <div class="page-content">
    <span class="tier-tag">CHAPTER 01</span>
    <h2>今この瞬間も、<span class="accent">あなたのサイトは狙われている</span></h2>
    <p class="lead">日本国内のサイバー攻撃は過去5年で約3倍に増加。中小企業の61%がサプライチェーン攻撃の入り口として狙われています。Webサイトは「企業の正面玄関」。脆弱性を放置することは、玄関に鍵をかけずに営業しているのと同じです。</p>

    <div class="threat-grid-4">
      <div class="threat-card"><div class="num">¥3,860万</div><div class="lbl">情報漏洩 平均被害額</div><div class="desc">IBM「Cost of a Data Breach Report」日本企業平均</div></div>
      <div class="threat-card"><div class="num">277日</div><div class="lbl">侵害発覚までの日数</div><div class="desc">攻撃者が9ヶ月以上潜伏してデータを盗み続ける</div></div>
      <div class="threat-card"><div class="num">61%</div><div class="lbl">中小企業が標的になる割合</div><div class="desc">「うちは小さいから狙われない」は誤解</div></div>
      <div class="threat-card"><div class="num">数十億円</div><div class="lbl">大企業の事業停止損失</div><div class="desc">2023年大手飲料メーカー：3週間出荷停止</div></div>
    </div>

    <div class="col-2-narrow" style="margin-top: 4mm;">
      <div>
        <h3>実際に起きた被害事例</h3>
        <table>
          <thead><tr><th style="width:32%;">企業</th><th style="width:25%;">攻撃手法</th><th>被害規模</th></tr></thead>
          <tbody>
            <tr><td>大手飲料メーカー（2023）</td><td>ランサムウェア</td><td>製造・物流停止 約3週間／損失数十億円</td></tr>
            <tr><td>大手自動車部品メーカー（2022）</td><td>VPN脆弱性経由</td><td>全工場1日停止／損失数百億円</td></tr>
            <tr><td>地方病院（2021）</td><td>電子カルテ侵入</td><td>救急受入停止2ヶ月／地域医療麻痺</td></tr>
            <tr><td>EC事業者（多数）</td><td>SQLインジェクション</td><td>クレカ情報漏洩／賠償＋ブランド失墜</td></tr>
          </tbody>
        </table>
      </div>
      <div class="alert danger" style="align-self: center;">
        <strong>⚠ 共通する原因：</strong><br>
        いずれも「定期的な脆弱性診断を実施していなかった」「既知のCVEパッチ未適用」「セキュリティヘッダー未設定」など、
        <strong>事前に検出できた脆弱性</strong>を放置していたことが大きな要因です。
      </div>
    </div>
  </div>
  <div class="page-no">P.3</div>
</div>

<!-- ═══════════════ Ch2: 7つの脅威 ═══════════════ -->
<div class="page">
  <div class="page-header"><span class="brand">Sequlia</span><span>02 ／ あなたのサイトに潜む7つの脅威</span></div>
  <div class="page-content">
    <span class="tier-tag">CHAPTER 02</span>
    <h2>あなたのサイトに潜む<span class="accent">7つ</span>の主要な脅威</h2>
    <p class="lead">下記7つの脅威はすべて Sequlia の174項目で自動検出可能。人間の目視では発見が困難な「設定の見落とし」を、AIと自動検査エンジンが網羅的にチェックします。</p>

    <div class="threat-list">
      <div class="threat-item">
        <div class="head"><span class="num-circle">①</span><span class="ttl">SQLインジェクション</span></div>
        <div class="desc">入力フォーム経由でデータベースに不正クエリを注入。<strong>顧客情報・クレカ情報の全件流出</strong>に直結。</div>
      </div>
      <div class="threat-item">
        <div class="head"><span class="num-circle">②</span><span class="ttl">クロスサイトスクリプティング（XSS）</span></div>
        <div class="desc">悪意あるJavaScriptを埋め込み、訪問者のセッションCookieを盗取。<strong>なりすましログイン</strong>が可能に。</div>
      </div>
      <div class="threat-item">
        <div class="head"><span class="num-circle">③</span><span class="ttl">古いソフトウェア・既知CVE脆弱性</span></div>
        <div class="desc">jQuery 1.x、WordPress旧版、Apache等の古いバージョンには<strong>公開済みの攻撃コード</strong>が出回っています。</div>
      </div>
      <div class="threat-item">
        <div class="head"><span class="num-circle">④</span><span class="ttl">セキュリティヘッダーの欠落</span></div>
        <div class="desc">HSTS / CSP / X-Frame-Options 未設定で、<strong>クリックジャッキング・中間者攻撃</strong>が成立。</div>
      </div>
      <div class="threat-item">
        <div class="head"><span class="num-circle">⑤</span><span class="ttl">認証・セッション管理の不備</span></div>
        <div class="desc">Cookie の Secure / HttpOnly 未設定 → <strong>セッションハイジャック</strong>。JWT署名欠落 → <strong>権限なりすまし</strong>。</div>
      </div>
      <div class="threat-item">
        <div class="head"><span class="num-circle">⑥</span><span class="ttl">設定ミス・管理画面の露出</span></div>
        <div class="desc">/.git や /.env が公開、phpMyAdmin がデフォルト認証、<strong>ディレクトリリスティング有効</strong>等。</div>
      </div>
      <div class="threat-item" style="grid-column: 1 / -1;">
        <div class="head"><span class="num-circle">⑦</span><span class="ttl">サプライチェーン攻撃</span></div>
        <div class="desc">外部CDN・ライブラリ経由でマルウェア配布。<strong>1つの依存パッケージが全顧客を巻き込む</strong>事故に。</div>
      </div>
    </div>

    <div class="alert info">
      <strong>💡 ポイント：</strong> これら7つの脅威は<strong>すべて Sequlia の174項目に含まれており、自動検出可能</strong>です。
    </div>
  </div>
  <div class="page-no">P.4</div>
</div>

<!-- ═══════════════ Ch3: 6つの理由 ═══════════════ -->
<div class="page">
  <div class="page-header"><span class="brand">Sequlia</span><span>03 ／ Sequliaが選ばれる6つの理由</span></div>
  <div class="page-content">
    <span class="tier-tag">CHAPTER 03</span>
    <h2>Sequliaが選ばれる<span class="accent">6つ</span>の理由</h2>

    <div class="kpi-grid-4">
      <div class="kpi"><div class="num">174</div><div class="lbl">検査項目数</div></div>
      <div class="kpi"><div class="num">23</div><div class="lbl">診断カテゴリ</div></div>
      <div class="kpi"><div class="num">3分</div><div class="lbl">診断開始まで</div></div>
      <div class="kpi"><div class="num">★3</div><div class="lbl">SCS対応</div></div>
    </div>

    <div class="feat-grid-3" style="margin-top: 4mm;">
      <div class="feat-card">
        <div class="ico">🤖</div>
        <div class="ttl">① AI×自動診断エンジン</div>
        <div class="desc">最新の脅威データベース（CVE/NVD）と自動同期。23カテゴリの専門エンジンが並列で174項目を網羅検査。</div>
      </div>
      <div class="feat-card">
        <div class="ico">⚡</div>
        <div class="ttl">② 最短3分で診断開始</div>
        <div class="desc">URLを入れるだけ。インストール不要、設定不要。リアルタイムで脆弱性が検出され、結果は即座にダッシュボードへ。</div>
      </div>
      <div class="feat-card">
        <div class="ico">🛡️</div>
        <div class="ttl">③ 安全な非侵襲的検査</div>
        <div class="desc">対象サイトに負荷を掛けない受動的スキャン。本番環境でも安心して実行できます。</div>
      </div>
      <div class="feat-card">
        <div class="ico">📊</div>
        <div class="ttl">④ 経産省SCS★3対応レポート</div>
        <div class="desc">SCS評価制度の主要要件をカバー。取引先・サプライヤー監査・ISMS更新時にそのまま提示できる証跡。</div>
      </div>
      <div class="feat-card">
        <div class="ico">💰</div>
        <div class="ttl">⑤ 圧倒的なコストパフォーマンス</div>
        <div class="desc">従来は1回数十万円〜。Sequliaは月¥4,980から無制限スキャン可能で<strong>約100分の1</strong>のコスト。</div>
      </div>
      <div class="feat-card">
        <div class="ico">🇯🇵</div>
        <div class="ttl">⑥ 日本語・国内法準拠</div>
        <div class="desc">UI・レポート・サポートすべて日本語対応。個人情報保護法・不正アクセス禁止法・JIS規格に準拠した実装。</div>
      </div>
    </div>

    <div class="alert success" style="margin-top: 4mm;">
      <strong>✓ 結論：</strong> Sequliaは「専門知識がなくても」「予算が限られていても」「すぐに始められる」<strong>中小企業向け最適解</strong>です。
    </div>
  </div>
  <div class="page-no">P.5</div>
</div>

<!-- ═══════════════ Ch4-A: 174項目（Tier1-2） ═══════════════ -->
<div class="page">
  <div class="page-header"><span class="brand">Sequlia</span><span>04 ／ 23カテゴリ・174項目の診断内容（前半）</span></div>
  <div class="page-content">
    <span class="tier-tag">CHAPTER 04</span>
    <h2>23カテゴリ・<span class="accent">174項目</span>の徹底診断 — Tier 1 / 2</h2>
    <p class="lead">OWASP Top 10（2021）全カテゴリに準拠。被害発生確率の高い項目から順に検査することで、早期に脆弱性を発見します。</p>

    <div class="col-2">
      <div>
        <h3>Tier 1：基本セキュリティ（最初に実行・高頻度ヒット）</h3>
        <table>
          <thead><tr><th style="width:42%;">カテゴリ</th><th style="width:13%;">項目数</th><th>主な検査内容</th></tr></thead>
          <tbody>
            <tr><td>ベストプラクティス基本検査</td><td>10</td><td>HSTS / CSP / Permissions-Policy / security.txt</td></tr>
            <tr><td>セキュリティヘッダー検査</td><td>10</td><td>HSTS / CSP / X-Frame-Options / Cookie属性</td></tr>
            <tr><td>サイト構造・隠しパス検出</td><td>8</td><td>.well-known / robots.txt / sitemap 解析</td></tr>
            <tr><td>古いソフトウェア・既知脆弱性検出</td><td>8</td><td>jQuery / WordPress / Server Banner CVE照合</td></tr>
            <tr><td>設定ミス・管理画面露出検査</td><td>15</td><td>ディレクトリリスティング / .git / .env</td></tr>
          </tbody>
        </table>
      </div>
      <div>
        <h3>Tier 2：能動的検出層（中頻度ヒット）</h3>
        <table>
          <thead><tr><th style="width:42%;">カテゴリ</th><th style="width:13%;">項目数</th><th>主な検査内容</th></tr></thead>
          <tbody>
            <tr><td>情報漏洩・機密ファイル露出検査</td><td>10</td><td>バックアップ / sourcemap / Git露出</td></tr>
            <tr><td>DNS・サブドメイン情報収集</td><td>10</td><td>DNS / Whois / SPF / DKIM / DMARC</td></tr>
            <tr><td>攻撃対象面（Attack Surface）分析</td><td>7</td><td>SCS★3要件のインターネット公開資産分析</td></tr>
            <tr><td>CORS設定確認</td><td>7</td><td>Originリフレクション / wildcard誤設定</td></tr>
            <tr><td>CSRF確認</td><td>6</td><td>CSRFトークン / SameSite cookie</td></tr>
            <tr><td>匿名API露出確認</td><td>7</td><td>OWASP API Top 10 / 認証なしAPI</td></tr>
            <tr><td>レートリミット</td><td>5</td><td>ブルートフォース耐性 / DoS耐性</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="alert info" style="margin-top: 3mm;">
      <strong>📌 検査方針：</strong> 全項目が<strong>受動的・非破壊的</strong>。対象サイトのデータを書き換えたり、サーバに過負荷を掛けたりしません。平均HTTPリクエスト数は数百件程度。
    </div>
  </div>
  <div class="page-no">P.6</div>
</div>

<!-- ═══════════════ Ch4-B: 174項目（Tier3-4） ═══════════════ -->
<div class="page">
  <div class="page-header"><span class="brand">Sequlia</span><span>04 ／ 23カテゴリ・174項目の診断内容（後半）</span></div>
  <div class="page-content">
    <span class="tier-tag">CHAPTER 04</span>
    <h2>23カテゴリ・<span class="accent">174項目</span>の徹底診断 — Tier 3 / 4</h2>

    <div class="col-2">
      <div>
        <h3>Tier 3：高度な脆弱性検出層</h3>
        <table>
          <thead><tr><th style="width:42%;">カテゴリ</th><th style="width:13%;">項目数</th><th>主な検査内容</th></tr></thead>
          <tbody>
            <tr><td>オープンリダイレクト</td><td>7</td><td>フィッシング悪用可能なリダイレクト</td></tr>
            <tr><td>ユーザー列挙</td><td>5</td><td>ログイン画面でのユーザー存在確認</td></tr>
            <tr><td>キャッシュポイズニング</td><td>5</td><td>Webキャッシュポイズニング検出</td></tr>
            <tr><td>JWT脆弱性</td><td>6</td><td>署名検証欠落 / alg:none攻撃</td></tr>
            <tr><td>パブリッククラウドストレージ</td><td>6</td><td>S3 / GCS / Azure Blob 公開バケット</td></tr>
            <tr><td>OAuthフロー欠陥</td><td>7</td><td>state欠落 / リダイレクトURI検証</td></tr>
            <tr><td>GraphQL脆弱性</td><td>7</td><td>Introspection / 深度制限 / バッチ攻撃</td></tr>
          </tbody>
        </table>
      </div>
      <div>
        <h3>Tier 4：インジェクション系（高度な能動検査）</h3>
        <table>
          <thead><tr><th style="width:42%;">カテゴリ</th><th style="width:13%;">項目数</th><th>主な検査内容</th></tr></thead>
          <tbody>
            <tr><td>XSS安全確認</td><td>10</td><td>反射型 / 保存型 / DOM型 XSS</td></tr>
            <tr><td>SQLi安全確認</td><td>8</td><td>エラーベース / ブラインドSQLi</td></tr>
            <tr><td>SSRF安全確認</td><td>6</td><td>SSRF / SSTI 安全プローブ</td></tr>
            <tr><td>HTTPスマグリング</td><td>4</td><td>CL-TE / TE-CL リクエストスマグリング</td></tr>
          </tbody>
        </table>

        <h3 style="margin-top: 5mm;">合計</h3>
        <div class="kpi-grid-4">
          <div class="kpi"><div class="num">23</div><div class="lbl">カテゴリ</div></div>
          <div class="kpi"><div class="num">174</div><div class="lbl">項目</div></div>
          <div class="kpi"><div class="num">A01-A10</div><div class="lbl">OWASP全準拠</div></div>
          <div class="kpi"><div class="num">3-8分</div><div class="lbl">完了時間</div></div>
        </div>
      </div>
    </div>
  </div>
  <div class="page-no">P.7</div>
</div>

<!-- ═══════════════ Ch5: SCS対応 ═══════════════ -->
<div class="page">
  <div class="page-header"><span class="brand">Sequlia</span><span>05 ／ 経産省 SCS★3 対応の詳細</span></div>
  <div class="page-content">
    <span class="tier-tag">CHAPTER 05</span>
    <h2>経産省 <span class="accent">SCS評価制度 ★3</span> への完全対応</h2>
    <p class="lead">経済産業省が推進する「サプライチェーン強化に向けた連携プログラム（SCS）」は、企業のサイバーセキュリティ対策レベルを5段階で評価する制度。<strong>★3レベル</strong>では、インターネット公開機器・サービスへの定期的な脆弱性診断が要件となります。</p>

    <div class="col-2">
      <div>
        <h3>SequliaがカバーするSCS★3要件（6項目）</h3>
        <table>
          <thead><tr><th style="width:25%;">要件ID</th><th>要件内容</th><th style="width:18%;">対応</th></tr></thead>
          <tbody>
            <tr><td>S3-RISK-01</td><td>IT資産の把握（公開資産の自動検出）</td><td>✓ 完全対応</td></tr>
            <tr><td>S3-RISK-02</td><td>脆弱性情報の収集と管理（CVE照合）</td><td>✓ 完全対応</td></tr>
            <tr><td>S3-PROT-01</td><td>インターネット公開機器の脆弱性診断</td><td>✓ コア機能</td></tr>
            <tr><td>S3-PROT-02</td><td>Webアプリの安全確認（OWASP Top 10）</td><td>✓ 完全対応</td></tr>
            <tr><td>S3-PROT-03</td><td>ソフトウェアの脆弱性パッチ管理</td><td>✓ 部分対応</td></tr>
            <tr><td>S3-PROT-05</td><td>セキュリティ設定の適正化</td><td>✓ 完全対応</td></tr>
          </tbody>
        </table>
      </div>
      <div>
        <h3>SCS★3 対応の運用フロー（推奨）</h3>
        <ol style="font-size: 9.5pt; line-height: 1.9; margin-left: 4mm;">
          <li><strong>月次スキャン実施</strong>：全公開URLに月1回以上の自動診断</li>
          <li><strong>結果記録の自動化</strong>：実施日時・スコア・件数を履歴管理（証跡）</li>
          <li><strong>取引先提示</strong>：診断結果サマリPDFをサプライヤー監査時に提示</li>
          <li><strong>継続改善サイクル</strong>：高リスク項目を14日以内にパッチ適用</li>
          <li><strong>年次レポート提出</strong>：SCS★3審査時に1年分の履歴を提出</li>
        </ol>

        <div class="alert success" style="margin-top: 5mm;">
          <strong>✓ 取引先からの監査リクエストに即対応：</strong><br>
          上場企業・大手企業からの「SCS対応していますか？」という問いに、Sequliaの診断履歴を提示するだけで応えられます。
        </div>
      </div>
    </div>
  </div>
  <div class="page-no">P.8</div>
</div>

<!-- ═══════════════ Ch6: 価格 ═══════════════ -->
<div class="page">
  <div class="page-header"><span class="brand">Sequlia</span><span>06 ／ 料金プラン・コスト比較</span></div>
  <div class="page-content">
    <span class="tier-tag">CHAPTER 06</span>
    <h2>あなたに最適な<span class="accent">料金プラン</span>をお選びください</h2>

    <div class="pricing-grid-4" style="margin-top: 4mm;">
      <div class="price-card">
        <div class="name">Free</div>
        <div class="amount">¥0 <span>/月</span></div>
        <ul>
          <li>月3回までスキャン</li>
          <li>全174項目の診断</li>
          <li>結果はWeb上で閲覧</li>
          <li>コミュニティサポート</li>
        </ul>
      </div>
      <div class="price-card popular">
        <div class="name">Standard</div>
        <div class="amount">¥4,980 <span>/月</span></div>
        <ul>
          <li>月30回までスキャン</li>
          <li>全174項目の診断</li>
          <li>PDFレポート出力</li>
          <li>Slack/Discord通知</li>
          <li>メールサポート</li>
        </ul>
      </div>
      <div class="price-card">
        <div class="name">Pro</div>
        <div class="amount">¥19,800 <span>/月</span></div>
        <ul>
          <li>月200回までスキャン</li>
          <li>ログイン認証後ページ診断</li>
          <li>API連携</li>
          <li>優先サポート</li>
          <li>SCS★3対応レポート</li>
        </ul>
      </div>
      <div class="price-card">
        <div class="name">Enterprise</div>
        <div class="amount" style="font-size: 13pt;">個別見積</div>
        <ul>
          <li>無制限スキャン</li>
          <li>オンプレ対応</li>
          <li>SAML SSO</li>
          <li>専任CS / SLA保証</li>
          <li>カスタム診断項目</li>
        </ul>
      </div>
    </div>

    <h3 style="margin-top: 5mm;">従来の専門業者との比較</h3>
    <table>
      <thead><tr><th>項目</th><th>従来（専門業者）</th><th style="background:#16a34a;">Sequlia Standard</th><th>削減効果</th></tr></thead>
      <tbody>
        <tr><td>初回費用</td><td>¥30〜100万円</td><td>¥0</td><td><strong style="color:#16a34a;">100%削減</strong></td></tr>
        <tr><td>月額費用</td><td>¥10〜50万円</td><td>¥4,980</td><td><strong style="color:#16a34a;">約100分の1</strong></td></tr>
        <tr><td>診断頻度</td><td>年1〜4回</td><td>月30回（無制限相当）</td><td><strong style="color:#16a34a;">100倍以上</strong></td></tr>
        <tr><td>結果取得まで</td><td>2〜4週間</td><td>3〜8分</td><td><strong style="color:#16a34a;">数千倍速</strong></td></tr>
        <tr><td>診断項目数</td><td>50〜100項目</td><td>174項目</td><td><strong style="color:#16a34a;">約2倍</strong></td></tr>
      </tbody>
    </table>
  </div>
  <div class="page-no">P.9</div>
</div>

<!-- ═══════════════ Ch7: 導入事例 ═══════════════ -->
<div class="page">
  <div class="page-header"><span class="brand">Sequlia</span><span>07 ／ 導入事例・お客様の声</span></div>
  <div class="page-content">
    <span class="tier-tag">CHAPTER 07</span>
    <h2>多くの企業が、<span class="accent">セキュリティ診断の習慣化</span>に活用</h2>

    <div class="testimonial-grid">
      <div class="testimonial">
        <div class="stars">★★★★★</div>
        <div class="quote">「これまで年1回の手動診断だけだったWebサイトを、月次の自動診断に切り替えました。セキュリティヘッダーの見落としを2件発見でき、大手取引先のSCS監査もスムーズに通過しました。」</div>
        <div class="person"><strong>田中 健二 様</strong>情報システム部 部長<br>株式会社テックソリューション</div>
      </div>
      <div class="testimonial">
        <div class="stars">★★★★★</div>
        <div class="quote">「専門業者依頼で年間100万円超だったのが、Sequliaに切り替えて年間6万円に。検出項目数は3倍以上に増え、コスト削減と網羅性の両方を実現できました。」</div>
        <div class="person"><strong>佐藤 美咲 様</strong>経営企画室<br>中堅製造業</div>
      </div>
      <div class="testimonial">
        <div class="stars">★★★★★</div>
        <div class="quote">「ECサイトのSQLi/XSS検査が自動で回ることで、マーケチームが安心して新機能をデプロイできるように。検出からパッチ適用までのリードタイムが大幅に短縮されました。」</div>
        <div class="person"><strong>山田 隆 様</strong>CTO<br>EC事業者（年商数十億円）</div>
      </div>
    </div>

    <h3 style="margin-top: 5mm;">業種別導入実績</h3>
    <table>
      <thead><tr><th style="width:22%;">業種</th><th style="width:25%;">導入規模</th><th>主な活用シーン</th></tr></thead>
      <tbody>
        <tr><td>SaaS / Web系</td><td>年商数千万〜数十億円</td><td>本番デプロイ前の自動チェック / CI/CD組込</td></tr>
        <tr><td>EC事業</td><td>会員数千〜数十万人</td><td>クレカ情報保護 / PCI DSS補助 / 顧客データ守備</td></tr>
        <tr><td>製造業</td><td>大手取引先あり</td><td>SCS監査対応 / サプライチェーン要件 / ISMS</td></tr>
        <tr><td>医療・教育</td><td>個人情報多数</td><td>個人情報保護法対応 / 機微情報保護</td></tr>
        <tr><td>地方自治体・公共</td><td>多数のサイト運営</td><td>NISC ガイドライン対応 / 住民情報保護</td></tr>
      </tbody>
    </table>
  </div>
  <div class="page-no">P.10</div>
</div>

<!-- ═══════════════ Ch8: お問い合わせ ═══════════════ -->
<div class="page">
  <div class="page-header"><span class="brand">Sequlia</span><span>08 ／ お問い合わせ・3ステップ導入</span></div>
  <div class="page-content">
    <span class="tier-tag">CHAPTER 08</span>
    <h2>今すぐ、<span class="accent">無料で診断</span>を始められます</h2>
    <p class="lead">クレジットカード登録不要。アカウント作成して、URLを入れるだけ。最短3分で結果を確認できます。</p>

    <div class="steps-grid">
      <div class="step-card">
        <div class="num">1</div>
        <div class="ttl">無料アカウント作成</div>
        <div class="desc">メール または Google アカウントで30秒で登録完了</div>
      </div>
      <div class="step-card">
        <div class="num">2</div>
        <div class="ttl">URLを入力</div>
        <div class="desc">診断したいWebサイトのURLを貼り付けるだけ</div>
      </div>
      <div class="step-card">
        <div class="num">3</div>
        <div class="ttl">診断結果を確認</div>
        <div class="desc">3〜8分後、ダッシュボードで詳細レポート閲覧</div>
      </div>
    </div>

    <div class="contact-box">
      <h3>📞 お問い合わせ・無料デモ</h3>
      <div class="col-2">
        <table>
          <tr><th>サービスURL</th><td>https://seculens.fly.dev</td></tr>
          <tr><th>運営</th><td>Sequlia（屋号）</td></tr>
          <tr><th>運営責任者</th><td>Taiki Kanetsuka</td></tr>
        </table>
        <table>
          <tr><th>所在地</th><td>〒156-0043 東京都世田谷区松原2-46-9</td></tr>
          <tr><th>メール</th><td>nugeirba@gmail.com</td></tr>
          <tr><th>電話</th><td>090-8612-8918（平日 10:00-18:00）</td></tr>
        </table>
      </div>
    </div>

    <div class="alert success" style="text-align: center; padding: 4mm;">
      <strong style="font-size: 12pt;">🎁 今なら：無料アカウント作成で、月3回まで全174項目の診断が完全無料</strong><br>
      <span style="font-size: 9pt; color: #14532d;">https://seculens.fly.dev/signup から30秒で登録完了</span>
    </div>

    <div class="note" style="margin-top: 4mm;">
      本資料の内容は ${today} 時点の情報です。最新版は当社サービスサイトの「資料ダウンロード」から取得可能です。
      本資料は社内検討・取引先への提示用に自由にご利用いただけます。 ／ © 2026 Sequlia. All rights reserved.
    </div>
  </div>
  <div class="page-no">P.11</div>
</div>

</body></html>`;

console.log("[generate-pdf] launching chromium...");
const browser = await chromium.launch({ headless: true });
try {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  console.log("[generate-pdf] rendering HTML...");
  await page.setContent(html, { waitUntil: "networkidle" });
  console.log("[generate-pdf] generating PDF (landscape A4)...");
  const outDir = path.join(root, "public", "docs");
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "Sequlia_Service_Overview.pdf");
  await page.pdf({
    path: outPath,
    format: "A4",
    landscape: true,
    printBackground: true,
    preferCSSPageSize: true,
  });
  await ctx.close();
  const stat = await fs.stat(outPath);
  console.log(`[generate-pdf] done: ${outPath} (${(stat.size / 1024).toFixed(1)} KB)`);
} finally {
  await browser.close().catch(() => undefined);
}
