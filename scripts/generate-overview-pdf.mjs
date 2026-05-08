// Sequlia サービス資料 PDF 生成スクリプト
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
@page { size: A4; margin: 0; }
body { font-family: "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif;
       color: #0f172a; line-height: 1.7; font-size: 10.5pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

/* ─── ページ共通レイアウト ─── */
.page { width: 210mm; min-height: 297mm; padding: 22mm 18mm; page-break-after: always; position: relative; }
.page:last-child { page-break-after: auto; }
.page-no { position: absolute; bottom: 10mm; right: 18mm; font-size: 8.5pt; color: #94a3b8; }
.page-header { position: absolute; top: 8mm; left: 18mm; right: 18mm; display: flex; justify-content: space-between;
               font-size: 8.5pt; color: #64748b; padding-bottom: 4mm; border-bottom: 1px solid #e2e8f0; }
.page-header .brand { color: #2563eb; font-weight: 700; }

/* ─── タイポグラフィ ─── */
h1 { font-size: 28pt; color: #0f172a; font-weight: 800; letter-spacing: -0.02em; line-height: 1.25; }
h2 { font-size: 18pt; color: #0f172a; font-weight: 800; margin-bottom: 4mm; line-height: 1.3; }
h2 .accent { color: #2563eb; }
h3 { font-size: 13pt; color: #1e3a8a; font-weight: 700; margin: 6mm 0 3mm; line-height: 1.4; }
h4 { font-size: 11pt; color: #2563eb; font-weight: 700; margin: 4mm 0 2mm; }
p { margin-bottom: 3mm; }
ul, ol { margin-left: 6mm; margin-bottom: 3mm; }
li { margin-bottom: 1.5mm; }
strong { color: #0f172a; font-weight: 700; }

/* ─── 表紙 ─── */
.cover { background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 50%, #2563eb 100%);
         color: #fff; min-height: 297mm; padding: 0; display: flex; flex-direction: column;
         justify-content: space-between; position: relative; overflow: hidden; }
.cover::before { content: ""; position: absolute; top: -10%; right: -10%; width: 500px; height: 500px;
                 background: radial-gradient(circle, rgba(96,165,250,0.3) 0%, transparent 70%); }
.cover::after { content: ""; position: absolute; bottom: -20%; left: -10%; width: 600px; height: 600px;
                background: radial-gradient(circle, rgba(56,189,248,0.2) 0%, transparent 70%); }
.cover-top { padding: 30mm 22mm 0; position: relative; z-index: 2; }
.cover-logo { font-size: 48pt; font-weight: 900; letter-spacing: -0.03em; color: #fff;
              text-shadow: 0 4px 24px rgba(37,99,235,0.4); }
.cover-tag { font-size: 13pt; color: #93c5fd; font-weight: 500; margin-top: 4mm; letter-spacing: 0.05em; }
.cover-mid { padding: 0 22mm; position: relative; z-index: 2; }
.cover-mid h1 { font-size: 36pt; color: #fff; font-weight: 900; line-height: 1.2; letter-spacing: -0.02em; }
.cover-mid h1 em { color: #fbbf24; font-style: normal; }
.cover-mid p { font-size: 14pt; color: #cbd5e1; margin-top: 8mm; line-height: 1.7; max-width: 140mm; }
.cover-badges { margin-top: 12mm; display: flex; gap: 6mm; flex-wrap: wrap; }
.badge-cover { background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.25); border-radius: 6mm;
               padding: 3mm 8mm; font-size: 11pt; font-weight: 700; color: #fff; }
.cover-bottom { padding: 22mm; background: rgba(0,0,0,0.3); border-top: 1px solid rgba(255,255,255,0.15);
                position: relative; z-index: 2; display: flex; justify-content: space-between; align-items: center; }
.cover-bottom .meta { font-size: 10pt; color: #94a3b8; }
.cover-bottom .meta strong { color: #fff; }
.cover-bottom .stamp { display: inline-flex; gap: 4mm; }
.stamp-circle { width: 22mm; height: 22mm; border-radius: 50%; background: linear-gradient(135deg, #f59e0b, #d97706);
                display: flex; flex-direction: column; align-items: center; justify-content: center;
                color: #fff; font-weight: 800; text-align: center; line-height: 1.1; box-shadow: 0 6px 16px rgba(245,158,11,0.4); }
.stamp-circle.green { background: linear-gradient(135deg, #16a34a, #15803d); box-shadow: 0 6px 16px rgba(22,163,74,0.4); }
.stamp-circle .lbl { font-size: 6pt; }
.stamp-circle .num { font-size: 10pt; }

/* ─── KPI/Stat hero ─── */
.kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4mm; margin: 5mm 0 8mm; }
.kpi { background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border: 1px solid #bfdbfe;
       border-radius: 4mm; padding: 5mm 4mm; text-align: center; }
.kpi .num { font-size: 22pt; font-weight: 800; color: #2563eb; line-height: 1.1; letter-spacing: -0.02em; }
.kpi .lbl { font-size: 8.5pt; color: #475569; margin-top: 1mm; font-weight: 600; }

/* ─── アラートボックス ─── */
.alert { border-radius: 3mm; padding: 5mm 6mm; margin: 4mm 0; border-left: 4px solid; }
.alert.danger { background: #fef2f2; border-color: #dc2626; }
.alert.danger strong { color: #991b1b; }
.alert.warn { background: #fffbeb; border-color: #f59e0b; }
.alert.warn strong { color: #92400e; }
.alert.info { background: #eff6ff; border-color: #2563eb; }
.alert.info strong { color: #1e3a8a; }
.alert.success { background: #f0fdf4; border-color: #16a34a; }
.alert.success strong { color: #14532d; }

/* ─── テーブル ─── */
table { width: 100%; border-collapse: collapse; margin: 4mm 0; font-size: 9.5pt; }
th, td { border: 1px solid #e2e8f0; padding: 3mm 4mm; text-align: left; vertical-align: top; }
th { background: #1e3a8a; color: #fff; font-weight: 700; }
tr:nth-child(even) td { background: #f8fafc; }
.tier-badge { display: inline-block; background: #2563eb; color: #fff; padding: 0.5mm 2mm;
              border-radius: 2mm; font-size: 8pt; font-weight: 700; }

/* ─── 統計カード（攻撃インパクト） ─── */
.threat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin: 5mm 0; }
.threat-card { background: #fef2f2; border: 1px solid #fecaca; border-radius: 4mm; padding: 5mm; }
.threat-card .num { font-size: 22pt; font-weight: 800; color: #dc2626; line-height: 1; }
.threat-card .lbl { font-size: 9pt; color: #991b1b; font-weight: 600; margin-top: 1mm; }
.threat-card .desc { font-size: 9pt; color: #64748b; margin-top: 2mm; line-height: 1.6; }

/* ─── 機能ハイライト ─── */
.feat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin: 4mm 0; }
.feat-card { background: linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%); border: 1px solid #e2e8f0;
             border-radius: 4mm; padding: 5mm; }
.feat-card .ico { font-size: 22pt; }
.feat-card .ttl { font-size: 12pt; font-weight: 800; color: #1e3a8a; margin: 2mm 0; }
.feat-card .desc { font-size: 9.5pt; color: #475569; line-height: 1.7; }

/* ─── 価格 ─── */
.pricing-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4mm; margin: 5mm 0; }
.price-card { border: 1.5px solid #e2e8f0; border-radius: 4mm; padding: 6mm; background: #fff; position: relative; }
.price-card.popular { border: 2px solid #2563eb; box-shadow: 0 4px 12px rgba(37,99,235,0.15); }
.price-card.popular::before { content: "人気"; position: absolute; top: -3mm; left: 5mm; background: #f59e0b;
                              color: #fff; padding: 1mm 3mm; border-radius: 1.5mm; font-size: 8pt; font-weight: 800; }
.price-card .name { font-size: 14pt; font-weight: 800; color: #0f172a; }
.price-card .amount { font-size: 24pt; font-weight: 900; color: #2563eb; line-height: 1.1; margin: 2mm 0; }
.price-card .amount span { font-size: 10pt; color: #94a3b8; font-weight: 500; }
.price-card ul { font-size: 9pt; color: #475569; margin: 3mm 0 0; list-style: none; padding: 0; }
.price-card li { padding-left: 5mm; position: relative; margin-bottom: 1mm; }
.price-card li::before { content: "✓"; position: absolute; left: 0; color: #16a34a; font-weight: 800; }

/* ─── 顧客の声 ─── */
.testimonial { background: #f8fafc; border-left: 4px solid #2563eb; padding: 5mm; margin: 4mm 0; border-radius: 0 3mm 3mm 0; }
.testimonial .quote { font-size: 10pt; color: #0f172a; line-height: 1.7; font-style: italic; margin-bottom: 3mm; }
.testimonial .person { font-size: 8.5pt; color: #64748b; }
.testimonial .person strong { color: #1e3a8a; }

/* ─── お問い合わせ ─── */
.contact-box { background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); color: #fff;
               padding: 8mm; border-radius: 4mm; margin: 6mm 0; }
.contact-box h3 { color: #fff; margin: 0 0 3mm; }
.contact-box p { color: #cbd5e1; }
.contact-box table { border: none; }
.contact-box th, .contact-box td { border: none; background: transparent; color: #fff; padding: 2mm 0; }
.contact-box th { width: 30mm; color: #93c5fd; }

/* ─── 章扉 ─── */
.chapter-cover { background: #0f172a; color: #fff; min-height: 297mm; display: flex; flex-direction: column;
                 justify-content: center; padding: 0 30mm; position: relative; }
.chapter-cover::before { content: ""; position: absolute; top: 0; right: 0; width: 60%; height: 100%;
                         background: linear-gradient(135deg, transparent 0%, rgba(37,99,235,0.2) 100%); }
.chapter-cover .ch-num { font-size: 80pt; font-weight: 900; color: #2563eb; line-height: 1; opacity: 0.4; }
.chapter-cover .ch-ttl { font-size: 32pt; font-weight: 900; margin-top: 4mm; color: #fff; line-height: 1.2; }
.chapter-cover .ch-sub { font-size: 13pt; color: #93c5fd; margin-top: 4mm; }

/* ─── 強調ヘッダ ─── */
.section-banner { background: linear-gradient(90deg, #2563eb 0%, #1e3a8a 100%); color: #fff;
                  padding: 4mm 6mm; border-radius: 3mm; margin: 6mm 0 4mm; }
.section-banner h2 { color: #fff; margin: 0; font-size: 14pt; }

.note { font-size: 8.5pt; color: #94a3b8; margin-top: 3mm; line-height: 1.6; }
</style></head>
<body>

<!-- ═══════════════ 表紙 ═══════════════ -->
<div class="cover">
  <div class="cover-top">
    <div class="cover-logo">Sequlia</div>
    <div class="cover-tag">SECULIA / セキュリア</div>
  </div>

  <div class="cover-mid">
    <h1>あなたのWebサイトを、<br />サイバー攻撃から<em>守る</em>。</h1>
    <p>AI駆動の自動セキュリティ診断で、見えない脅威を可視化。<br />
    OWASP Top 10 完全準拠・23カテゴリ・174項目を最短3分で網羅検査します。</p>
    <div class="cover-badges">
      <div class="badge-cover">経産省 SCS★3 対応</div>
      <div class="badge-cover">IPA SECURITY ACTION ★2</div>
      <div class="badge-cover">OWASP Top 10 準拠</div>
    </div>
  </div>

  <div class="cover-bottom">
    <div class="meta">
      <div><strong>Sequlia サービス資料</strong></div>
      <div>発行日: ${today}</div>
      <div>版: 2026 v1.0</div>
    </div>
    <div class="stamp">
      <div class="stamp-circle">
        <div class="lbl">経産省</div>
        <div class="num">SCS</div>
        <div class="num">★★★</div>
      </div>
      <div class="stamp-circle green">
        <div class="lbl">IPA</div>
        <div class="num">★★</div>
      </div>
    </div>
  </div>
</div>

<!-- ═══════════════ 目次 ═══════════════ -->
<div class="page">
  <div class="page-header"><span class="brand">Sequlia</span><span>目次</span></div>
  <h1 style="margin-top: 8mm;">目次</h1>
  <div style="margin-top: 8mm; font-size: 11pt; line-height: 2.6;">
    <div style="display:flex; justify-content: space-between; border-bottom: 1px dashed #cbd5e1; padding: 1mm 0;">
      <span><strong style="color:#2563eb;">01</strong> &nbsp; なぜ今、Webセキュリティ対策が急務なのか</span><span>3</span></div>
    <div style="display:flex; justify-content: space-between; border-bottom: 1px dashed #cbd5e1; padding: 1mm 0;">
      <span><strong style="color:#2563eb;">02</strong> &nbsp; あなたのサイトに潜む7つの脅威</span><span>4</span></div>
    <div style="display:flex; justify-content: space-between; border-bottom: 1px dashed #cbd5e1; padding: 1mm 0;">
      <span><strong style="color:#2563eb;">03</strong> &nbsp; Sequliaが選ばれる5つの理由</span><span>5</span></div>
    <div style="display:flex; justify-content: space-between; border-bottom: 1px dashed #cbd5e1; padding: 1mm 0;">
      <span><strong style="color:#2563eb;">04</strong> &nbsp; 23カテゴリ・174項目の診断内容</span><span>6</span></div>
    <div style="display:flex; justify-content: space-between; border-bottom: 1px dashed #cbd5e1; padding: 1mm 0;">
      <span><strong style="color:#2563eb;">05</strong> &nbsp; 経産省 SCS★3 対応の詳細</span><span>8</span></div>
    <div style="display:flex; justify-content: space-between; border-bottom: 1px dashed #cbd5e1; padding: 1mm 0;">
      <span><strong style="color:#2563eb;">06</strong> &nbsp; 料金プラン</span><span>9</span></div>
    <div style="display:flex; justify-content: space-between; border-bottom: 1px dashed #cbd5e1; padding: 1mm 0;">
      <span><strong style="color:#2563eb;">07</strong> &nbsp; 導入事例・お客様の声</span><span>10</span></div>
    <div style="display:flex; justify-content: space-between; padding: 1mm 0;">
      <span><strong style="color:#2563eb;">08</strong> &nbsp; お問い合わせ</span><span>11</span></div>
  </div>
  <div class="page-no">2</div>
</div>

<!-- ═══════════════ 第1章: 危機感 ═══════════════ -->
<div class="page">
  <div class="page-header"><span class="brand">Sequlia</span><span>01 &nbsp; なぜ今、Webセキュリティ対策が急務なのか</span></div>
  <div style="margin-top: 8mm;">
    <div class="tier-badge">CHAPTER 01</div>
    <h2 style="margin-top: 3mm;">今この瞬間も、<span class="accent">あなたのサイトは狙われている</span></h2>
  </div>

  <p style="margin-top: 4mm; font-size: 11pt; color: #475569;">
    日本国内のサイバー攻撃は<strong>過去5年で約3倍</strong>に増加。中小企業の<strong>61%</strong>がサプライチェーン攻撃の入り口として狙われています。
    Webサイトは「企業の正面玄関」。脆弱性を放置することは、玄関に鍵をかけずに営業しているのと同じです。
  </p>

  <div class="threat-grid">
    <div class="threat-card">
      <div class="num">¥3,860万</div>
      <div class="lbl">情報漏洩 1件あたりの平均被害額</div>
      <div class="desc">出典: IBM「Cost of a Data Breach Report」日本企業の平均値</div>
    </div>
    <div class="threat-card">
      <div class="num">277日</div>
      <div class="lbl">侵害発覚までの平均日数</div>
      <div class="desc">攻撃者が9ヶ月以上潜伏してデータを盗み続けるケースが多発</div>
    </div>
    <div class="threat-card">
      <div class="num">61%</div>
      <div class="lbl">中小企業が標的になる割合</div>
      <div class="desc">「うちは小さいから狙われない」は完全な誤解</div>
    </div>
    <div class="threat-card">
      <div class="num">数十億円</div>
      <div class="lbl">大企業の事業停止損失</div>
      <div class="desc">2023年大手飲料メーカー：ランサムウェアで3週間出荷停止</div>
    </div>
  </div>

  <h3>実際に起きた被害事例</h3>
  <table>
    <thead><tr><th style="width:25%;">企業</th><th style="width:20%;">攻撃手法</th><th>被害規模</th></tr></thead>
    <tbody>
      <tr><td>大手飲料メーカー（2023）</td><td>ランサムウェア</td><td>製造・物流停止 約3週間 / 損失数十億円</td></tr>
      <tr><td>大手自動車部品メーカー（2022）</td><td>VPN脆弱性経由</td><td>全工場1日停止 / 損失数百億円</td></tr>
      <tr><td>地方病院（2021）</td><td>電子カルテ侵入</td><td>救急受入停止2ヶ月 / 地域医療麻痺</td></tr>
      <tr><td>EC事業者（多数）</td><td>SQLインジェクション</td><td>クレカ情報漏洩 / 損害賠償＋ブランド失墜</td></tr>
    </tbody>
  </table>

  <div class="alert danger">
    <strong>⚠️ 共通する原因：</strong> いずれも「定期的な脆弱性診断を実施していなかった」「既知のCVEパッチ未適用」「セキュリティヘッダー未設定」など、
    <strong>事前に検出できた脆弱性</strong> を放置していたことが大きな要因です。
  </div>

  <div class="page-no">3</div>
</div>

<!-- ═══════════════ 第2章: 7つの脅威 ═══════════════ -->
<div class="page">
  <div class="page-header"><span class="brand">Sequlia</span><span>02 &nbsp; あなたのサイトに潜む7つの脅威</span></div>
  <div style="margin-top: 8mm;">
    <div class="tier-badge">CHAPTER 02</div>
    <h2 style="margin-top: 3mm;"><span class="accent">7つの</span>主要な脅威と被害パターン</h2>
  </div>

  <h3>① SQLインジェクション</h3>
  <p>入力フォーム経由でデータベースに不正クエリを注入。<strong>顧客情報・クレカ情報の全件流出</strong>に直結。</p>

  <h3>② クロスサイトスクリプティング（XSS）</h3>
  <p>悪意あるJavaScriptをサイトに埋め込み、訪問者のセッションCookieを盗取。<strong>なりすましログイン</strong>が可能に。</p>

  <h3>③ 古いソフトウェア・既知CVE脆弱性</h3>
  <p>jQuery 1.x、WordPress旧版、Apache/Nginxの古いバージョンには<strong>公開済みの攻撃コード</strong>が出回っています。</p>

  <h3>④ セキュリティヘッダーの欠落</h3>
  <p>HSTS / CSP / X-Frame-Options 未設定で、<strong>クリックジャッキング・中間者攻撃</strong>が成立。</p>

  <h3>⑤ 認証・セッション管理の不備</h3>
  <p>Cookie の Secure / HttpOnly / SameSite 未設定 → <strong>セッションハイジャック</strong>。JWT署名検証欠落 → <strong>権限なりすまし</strong>。</p>

  <h3>⑥ 設定ミス・管理画面の露出</h3>
  <p>/.git や /.env ファイルが公開、phpMyAdmin がデフォルト認証のまま、<strong>ディレクトリリスティング有効</strong>等。</p>

  <h3>⑦ サプライチェーン攻撃</h3>
  <p>外部CDN・ライブラリ経由でマルウェア配布。<strong>1つの依存パッケージが全顧客を巻き込む</strong>事故に。</p>

  <div class="alert warn">
    <strong>💡 ポイント：</strong> これら7つの脅威は <strong>すべて Sequlia の174項目に含まれており、自動検出可能</strong> です。
    人間の目視では発見が困難な「設定の見落とし」を、AIと自動検査エンジンが網羅的にチェックします。
  </div>

  <div class="page-no">4</div>
</div>

<!-- ═══════════════ 第3章: Sequliaが選ばれる理由 ═══════════════ -->
<div class="page">
  <div class="page-header"><span class="brand">Sequlia</span><span>03 &nbsp; Sequliaが選ばれる5つの理由</span></div>
  <div style="margin-top: 8mm;">
    <div class="tier-badge">CHAPTER 03</div>
    <h2 style="margin-top: 3mm;">Sequliaが選ばれる<span class="accent">5つの理由</span></h2>
  </div>

  <div class="kpi-grid">
    <div class="kpi"><div class="num">174</div><div class="lbl">検査項目数</div></div>
    <div class="kpi"><div class="num">23</div><div class="lbl">診断カテゴリ</div></div>
    <div class="kpi"><div class="num">3分</div><div class="lbl">診断開始まで</div></div>
    <div class="kpi"><div class="num">★3</div><div class="lbl">SCS対応</div></div>
  </div>

  <div class="feat-grid">
    <div class="feat-card">
      <div class="ico">🤖</div>
      <div class="ttl">① AI×自動診断エンジン</div>
      <div class="desc">最新の脅威データベース（CVE/NVD）と自動同期。23カテゴリの専門エンジンが並列で174項目を網羅検査します。</div>
    </div>
    <div class="feat-card">
      <div class="ico">⚡</div>
      <div class="ttl">② 最短3分で診断開始</div>
      <div class="desc">URLを入れるだけ。インストール不要、設定不要。リアルタイムで脆弱性が検出され、結果は即座にダッシュボードに表示。</div>
    </div>
    <div class="feat-card">
      <div class="ico">🛡️</div>
      <div class="ttl">③ 安全な非侵襲的検査</div>
      <div class="desc">対象サイトに負荷を掛けない受動的スキャンを採用。本番環境でも安心して実行できます。</div>
    </div>
    <div class="feat-card">
      <div class="ico">📊</div>
      <div class="ttl">④ 経産省SCS★3対応レポート</div>
      <div class="desc">SCS評価制度の主要要件をカバー。取引先・サプライヤー監査・ISMS更新時にそのまま提示できる証跡を自動生成。</div>
    </div>
    <div class="feat-card">
      <div class="ico">💰</div>
      <div class="ttl">⑤ 圧倒的なコストパフォーマンス</div>
      <div class="desc">従来の専門業者依頼は1回数十万円〜。Sequliaは月額¥4,980から無制限スキャン可能で約100分の1のコスト。</div>
    </div>
    <div class="feat-card">
      <div class="ico">🇯🇵</div>
      <div class="ttl">⑥ 日本語・国内法準拠</div>
      <div class="desc">UI・レポート・サポートすべて日本語対応。個人情報保護法・不正アクセス禁止法・JIS規格を踏まえた実装。</div>
    </div>
  </div>

  <div class="alert success">
    <strong>✓ 結論：</strong> Sequliaは「専門知識がなくても」「予算が限られていても」「すぐに始められる」<strong>中小企業向け最適解</strong>です。
  </div>

  <div class="page-no">5</div>
</div>

<!-- ═══════════════ 第4章: 174項目詳細（前半） ═══════════════ -->
<div class="page">
  <div class="page-header"><span class="brand">Sequlia</span><span>04 &nbsp; 23カテゴリ・174項目の診断内容</span></div>
  <div style="margin-top: 8mm;">
    <div class="tier-badge">CHAPTER 04</div>
    <h2 style="margin-top: 3mm;">23カテゴリ・<span class="accent">174項目</span>の徹底診断</h2>
  </div>

  <p>OWASP Top 10（2021）全カテゴリに準拠。被害発生確率の高い項目から順に検査することで、早期に脆弱性を発見します。</p>

  <h3>Tier 1：基本セキュリティ（高頻度ヒット層・最初に実行）</h3>
  <table>
    <thead><tr><th style="width:30%;">カテゴリ</th><th style="width:13%;">項目数</th><th>主な検査内容</th></tr></thead>
    <tbody>
      <tr><td>ベストプラクティス基本検査</td><td>10</td><td>HSTS / CSP / Permissions-Policy / security.txt / robots.txt / Cross-Origin-* / Referrer-Policy / X-Content-Type-Options / Server情報開示 等</td></tr>
      <tr><td>セキュリティヘッダー検査</td><td>10</td><td>HSTS / CSP / X-Frame-Options / X-XSS-Protection / Cookie の Secure / HttpOnly / SameSite 属性</td></tr>
      <tr><td>サイト構造・隠しパス検出</td><td>8</td><td>.well-known / robots.txt / sitemap.xml 解析 / 隠しURL抽出 / クローラー設定の漏洩</td></tr>
      <tr><td>古いソフトウェア・既知脆弱性検出</td><td>8</td><td>jQuery / Bootstrap / WordPress / Apache / Nginx / Express / Server Banner からのCVE照合</td></tr>
      <tr><td>設定ミス・管理画面露出検査</td><td>15</td><td>ディレクトリリスティング / phpMyAdmin / .git / .env / バックアップファイル / 管理画面パス全網羅</td></tr>
    </tbody>
  </table>

  <h3>Tier 2：能動的検出層（中頻度ヒット）</h3>
  <table>
    <thead><tr><th style="width:30%;">カテゴリ</th><th style="width:13%;">項目数</th><th>主な検査内容</th></tr></thead>
    <tbody>
      <tr><td>情報漏洩・機密ファイル露出検査</td><td>10</td><td>バックアップ / sourcemap / Git露出 / Next.js _buildManifest / 設定ファイル / API キー露出</td></tr>
      <tr><td>DNS・サブドメイン情報収集</td><td>10</td><td>DNS / Whois / サブドメイン列挙 / SPF / DKIM / DMARC / CAA / NS情報</td></tr>
      <tr><td>攻撃対象面（Attack Surface）分析</td><td>7</td><td>SCS★3要件「インターネット公開資産の把握」を完全自動化</td></tr>
      <tr><td>CORS設定確認</td><td>7</td><td>Originリフレクション / wildcard誤設定 / credentials併用 / Pre-flight検査</td></tr>
      <tr><td>CSRF確認</td><td>6</td><td>CSRFトークン / SameSite cookie / Originヘッダー検証</td></tr>
      <tr><td>匿名API露出確認</td><td>7</td><td>OWASP API Top 10 / 認証なしREST/GraphQL露出 / 機密データ漏洩</td></tr>
      <tr><td>レートリミット</td><td>5</td><td>ブルートフォース耐性 / DoS耐性 / API スロットリング</td></tr>
    </tbody>
  </table>

  <div class="page-no">6</div>
</div>

<!-- ═══════════════ 第4章: 174項目詳細（後半） ═══════════════ -->
<div class="page">
  <div class="page-header"><span class="brand">Sequlia</span><span>04 &nbsp; 23カテゴリ・174項目の診断内容（続き）</span></div>

  <h3 style="margin-top: 6mm;">Tier 3：高度な脆弱性検出層</h3>
  <table>
    <thead><tr><th style="width:30%;">カテゴリ</th><th style="width:13%;">項目数</th><th>主な検査内容</th></tr></thead>
    <tbody>
      <tr><td>オープンリダイレクト</td><td>7</td><td>フィッシング悪用可能なリダイレクトパラメータ検出</td></tr>
      <tr><td>ユーザー列挙</td><td>5</td><td>ログイン・パスワードリセット画面でのユーザー存在確認</td></tr>
      <tr><td>キャッシュポイズニング</td><td>5</td><td>Webキャッシュポイズニング / Hostヘッダー操作 / X-Forwarded-* 改ざん</td></tr>
      <tr><td>JWT脆弱性</td><td>6</td><td>署名検証欠落 / alg:none攻撃 / 弱い秘密鍵 / Algorithm Confusion</td></tr>
      <tr><td>パブリッククラウドストレージ</td><td>6</td><td>S3 / GCS / Azure Blob 公開バケット / 機密ファイル露出</td></tr>
      <tr><td>OAuthフロー欠陥</td><td>7</td><td>state欠落 / リダイレクトURI検証 / トークン漏洩 / PKCE未実装</td></tr>
      <tr><td>GraphQL脆弱性</td><td>7</td><td>Introspection公開 / 深度制限欠落 / バッチ攻撃 / フィールドサジェスト</td></tr>
    </tbody>
  </table>

  <h3>Tier 4：インジェクション系（高度な能動検査・最後に実行）</h3>
  <table>
    <thead><tr><th style="width:30%;">カテゴリ</th><th style="width:13%;">項目数</th><th>主な検査内容</th></tr></thead>
    <tbody>
      <tr><td>XSS安全確認</td><td>10</td><td>反射型 / 保存型 / DOM型 XSS の安全プローブ（破壊的でない検査）</td></tr>
      <tr><td>SQLi安全確認</td><td>8</td><td>エラーベース / ブラインド / Time-based SQLi の非破壊検査</td></tr>
      <tr><td>SSRF安全確認</td><td>6</td><td>SSRF / SSTI / メタデータエンドポイント アクセス試行</td></tr>
      <tr><td>HTTPスマグリング</td><td>4</td><td>CL-TE / TE-CL リクエストスマグリング / Cache poisoning経由</td></tr>
    </tbody>
  </table>

  <div class="alert info">
    <strong>📌 検査方針：</strong> 全項目が <strong>受動的・非破壊的</strong>。対象サイトのデータを書き換えたり、サーバに過負荷を掛けたりすることはありません。
    平均HTTPリクエスト数は数百件程度で、本番環境での運用に支障をきたさない範囲に収めています。
  </div>

  <div class="page-no">7</div>
</div>

<!-- ═══════════════ 第5章: SCS対応 ═══════════════ -->
<div class="page">
  <div class="page-header"><span class="brand">Sequlia</span><span>05 &nbsp; 経産省 SCS★3 対応の詳細</span></div>
  <div style="margin-top: 8mm;">
    <div class="tier-badge">CHAPTER 05</div>
    <h2 style="margin-top: 3mm;">経産省 <span class="accent">SCS評価制度 ★3</span> への完全対応</h2>
  </div>

  <p>経済産業省が推進する「サプライチェーン強化に向けた連携プログラム（SCS）」は、企業のサイバーセキュリティ対策レベルを5段階で評価する制度。<strong>★3レベル</strong>では、インターネット公開機器・サービスへの定期的な脆弱性診断が要件となります。</p>

  <div class="alert info">
    <strong>SequliaがカバーするSCS★3要件（6項目）：</strong>
  </div>

  <table>
    <thead><tr><th style="width:25%;">要件ID</th><th>要件内容</th><th style="width:18%;">Sequlia対応</th></tr></thead>
    <tbody>
      <tr><td>S3-RISK-01</td><td>IT資産の把握（インターネット公開資産の自動検出・一覧化）</td><td>✓ 完全対応</td></tr>
      <tr><td>S3-RISK-02</td><td>脆弱性情報の収集と管理（CVE自動照合）</td><td>✓ 完全対応</td></tr>
      <tr><td>S3-PROT-01</td><td>インターネット公開機器・サービスの脆弱性診断</td><td>✓ コア機能</td></tr>
      <tr><td>S3-PROT-02</td><td>Webアプリケーションの安全確認（OWASP Top 10）</td><td>✓ 完全対応</td></tr>
      <tr><td>S3-PROT-03</td><td>ソフトウェアの脆弱性パッチ管理（古いSW検出）</td><td>✓ 部分対応</td></tr>
      <tr><td>S3-PROT-05</td><td>セキュリティ設定の適正化（ヘッダー・CORS等）</td><td>✓ 完全対応</td></tr>
    </tbody>
  </table>

  <h3>SCS★3 対応の運用フロー（推奨）</h3>
  <ol style="font-size: 10pt;">
    <li><strong>月次スキャン実施</strong>：全公開URLに対しSequliaで月1回以上の自動診断を実施</li>
    <li><strong>結果記録の自動化</strong>：実施日時・スコア・検出件数を履歴管理（証跡）</li>
    <li><strong>取引先提示</strong>：診断結果サマリPDFをサプライヤー監査時に提示</li>
    <li><strong>継続改善サイクル</strong>：高リスク項目を14日以内にパッチ適用するプロセスを運用</li>
    <li><strong>年次レポート提出</strong>：SCS★3審査時に1年分の診断履歴を提出</li>
  </ol>

  <div class="alert success">
    <strong>✓ 取引先からの監査リクエストにも即対応：</strong> 上場企業・大手企業からの「SCS対応していますか？」という問いに、Sequliaの診断履歴を提示するだけで応えられます。
  </div>

  <div class="page-no">8</div>
</div>

<!-- ═══════════════ 第6章: 料金 ═══════════════ -->
<div class="page">
  <div class="page-header"><span class="brand">Sequlia</span><span>06 &nbsp; 料金プラン</span></div>
  <div style="margin-top: 8mm;">
    <div class="tier-badge">CHAPTER 06</div>
    <h2 style="margin-top: 3mm;">あなたに最適な<span class="accent">料金プラン</span>をお選びください</h2>
  </div>

  <div class="pricing-grid">
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
      <div class="amount">¥4,980 <span>/月（税込）</span></div>
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
      <div class="amount">¥19,800 <span>/月（税込）</span></div>
      <ul>
        <li>月200回までスキャン</li>
        <li>全174項目の診断</li>
        <li>ログイン認証後ページ診断</li>
        <li>API連携</li>
        <li>優先サポート</li>
        <li>SCS★3対応レポート</li>
      </ul>
    </div>
    <div class="price-card">
      <div class="name">Enterprise</div>
      <div class="amount" style="font-size: 16pt;">個別見積</div>
      <ul>
        <li>無制限スキャン</li>
        <li>オンプレ対応</li>
        <li>SAML SSO</li>
        <li>専任カスタマーサクセス</li>
        <li>SLA保証</li>
        <li>カスタム診断項目</li>
      </ul>
    </div>
  </div>

  <h3>従来のセキュリティ診断との比較</h3>
  <table>
    <thead><tr><th>項目</th><th>従来（専門業者）</th><th style="background:#16a34a;">Sequlia Standard</th></tr></thead>
    <tbody>
      <tr><td>初回費用</td><td>¥30〜100万円</td><td>¥0</td></tr>
      <tr><td>月額費用</td><td>¥10〜50万円</td><td>¥4,980</td></tr>
      <tr><td>診断頻度</td><td>年1〜4回</td><td>月30回（無制限相当）</td></tr>
      <tr><td>結果取得まで</td><td>2〜4週間</td><td>3〜8分</td></tr>
      <tr><td>診断項目数</td><td>50〜100項目</td><td>174項目</td></tr>
    </tbody>
  </table>

  <div class="page-no">9</div>
</div>

<!-- ═══════════════ 第7章: 導入事例 ═══════════════ -->
<div class="page">
  <div class="page-header"><span class="brand">Sequlia</span><span>07 &nbsp; 導入事例・お客様の声</span></div>
  <div style="margin-top: 8mm;">
    <div class="tier-badge">CHAPTER 07</div>
    <h2 style="margin-top: 3mm;">多くの企業が、<span class="accent">セキュリティ診断の習慣化</span>に活用</h2>
  </div>

  <div class="testimonial">
    <div class="quote">「これまで年1回の手動診断だけだったWebサイトを、Sequliaで月次の自動診断に切り替えました。セキュリティヘッダーの見落としを2件発見でき、結果として大手取引先からのSCS監査もスムーズに通過しました。」</div>
    <div class="person"><strong>田中 健二 様</strong> ／ 情報システム部 部長 ／ 株式会社テックソリューション</div>
  </div>

  <div class="testimonial">
    <div class="quote">「専門業者に依頼すると年間100万円超だったのが、Sequliaに切り替えて年間6万円に。それでも検出項目数は3倍以上に増え、コスト削減と網羅性の両方を実現できました。」</div>
    <div class="person"><strong>佐藤 美咲 様</strong> ／ 経営企画室 ／ 中堅製造業</div>
  </div>

  <div class="testimonial">
    <div class="quote">「ECサイトを運営しているのですが、SQLi/XSSの検査が自動で回ることでマーケティングチームが安心して新機能をデプロイできるようになりました。検出からパッチ適用までのリードタイムが大幅に短縮されました。」</div>
    <div class="person"><strong>山田 隆 様</strong> ／ CTO ／ EC事業者（年商数十億円）</div>
  </div>

  <h3>業種別導入実績</h3>
  <table>
    <thead><tr><th>業種</th><th>導入規模</th><th>主な活用シーン</th></tr></thead>
    <tbody>
      <tr><td>SaaS / Web系</td><td>年商数千万〜数十億円</td><td>本番デプロイ前の自動チェック</td></tr>
      <tr><td>EC事業</td><td>会員数千〜数十万人</td><td>クレカ情報保護 / PCI DSS補助</td></tr>
      <tr><td>製造業</td><td>大手取引先あり</td><td>SCS監査対応 / サプライチェーン要件</td></tr>
      <tr><td>医療・教育</td><td>個人情報多数</td><td>個人情報保護法対応</td></tr>
      <tr><td>地方自治体・公共</td><td>多数のサイト運営</td><td>NISC ガイドライン対応</td></tr>
    </tbody>
  </table>

  <div class="page-no">10</div>
</div>

<!-- ═══════════════ 第8章: お問い合わせ ═══════════════ -->
<div class="page">
  <div class="page-header"><span class="brand">Sequlia</span><span>08 &nbsp; お問い合わせ</span></div>
  <div style="margin-top: 8mm;">
    <div class="tier-badge">CHAPTER 08</div>
    <h2 style="margin-top: 3mm;">今すぐ、<span class="accent">無料で診断</span>を始められます</h2>
  </div>

  <p>クレジットカード登録不要。アカウント作成して、URLを入れるだけ。最短3分で結果を確認できます。</p>

  <div class="contact-box">
    <h3>📞 お問い合わせ・無料デモ</h3>
    <p>導入検討・お見積もり・カスタマイズ要望など、お気軽にお問い合わせください。</p>
    <table>
      <tr><th>サービスURL</th><td>https://seculens.fly.dev</td></tr>
      <tr><th>運営</th><td>Sequlia（屋号）</td></tr>
      <tr><th>運営責任者</th><td>Taiki Kanetsuka</td></tr>
      <tr><th>所在地</th><td>〒156-0043 東京都世田谷区松原2-46-9</td></tr>
      <tr><th>メール</th><td>nugeirba@gmail.com</td></tr>
      <tr><th>電話</th><td>090-8612-8918（受付：平日 10:00-18:00）</td></tr>
    </table>
  </div>

  <h3>3ステップで始められます</h3>
  <ol style="font-size: 11pt; line-height: 2.2;">
    <li><strong>無料アカウント作成</strong> - メールアドレスまたはGoogleアカウントで30秒で登録</li>
    <li><strong>URLを入力</strong> - 診断したいWebサイトのURLを貼り付け</li>
    <li><strong>診断結果を確認</strong> - 3〜8分後、ダッシュボードで詳細レポートを閲覧</li>
  </ol>

  <div class="alert success" style="margin-top: 8mm; text-align: center;">
    <strong style="font-size: 14pt;">🎁 今なら：無料アカウント作成で、月3回まで全174項目の診断が完全無料</strong>
    <p style="margin: 3mm 0 0; font-size: 10pt; color: #14532d;">https://seculens.fly.dev/signup から30秒で登録完了</p>
  </div>

  <div class="note">
    本資料の内容は ${today} 時点の情報です。最新版は当社サービスサイトの「資料ダウンロード」から取得可能です。<br>
    本資料は社内検討・取引先への提示用に自由にご利用いただけます。<br><br>
    © 2026 Sequlia. All rights reserved.
  </div>

  <div class="page-no">11</div>
</div>

</body></html>`;

// ─────── PDF生成 ───────
console.log("[generate-pdf] launching chromium...");
const browser = await chromium.launch({ headless: true });
try {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  console.log("[generate-pdf] rendering HTML...");
  await page.setContent(html, { waitUntil: "networkidle" });
  console.log("[generate-pdf] generating PDF...");
  const outDir = path.join(root, "public", "docs");
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "Sequlia_Service_Overview.pdf");
  await page.pdf({
    path: outPath,
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
  });
  await ctx.close();
  const stat = await fs.stat(outPath);
  console.log(`[generate-pdf] done: ${outPath} (${(stat.size / 1024).toFixed(1)} KB)`);
} finally {
  await browser.close().catch(() => undefined);
}
