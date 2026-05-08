import { NextResponse } from "next/server";
import { chromium } from "playwright";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/docs/service-overview
 * Sequlia サービス概要 + SCS対応詳細 PDF を動的生成
 * Playwright (chromium) で HTML → PDF 変換
 */
export async function GET() {
  try {
    const html = generateHtml();
    const browser = await chromium.launch({ headless: true });
    try {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.setContent(html, { waitUntil: "networkidle" });
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "20mm", bottom: "20mm", left: "18mm", right: "18mm" },
      });
      await ctx.close();
      return new NextResponse(new Uint8Array(pdf), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="Sequlia_Service_Overview.pdf"`,
          "Cache-Control": "public, max-age=3600",
        },
      });
    } finally {
      await browser.close().catch(() => undefined);
    }
  } catch (e) {
    console.error("[api/docs/service-overview]", e);
    return NextResponse.json({ error: "PDF生成に失敗しました" }, { status: 500 });
  }
}

function generateHtml(): string {
  const today = new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });
  return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><title>Sequlia サービス概要</title>
<style>
  * { box-sizing: border-box; }
  @page { size: A4; }
  body { font-family: "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif;
         color: #0f172a; line-height: 1.7; margin: 0; padding: 0; font-size: 11pt; }
  h1 { font-size: 26pt; color: #2563eb; margin: 0 0 6pt; font-weight: 800; letter-spacing: -0.02em; }
  h2 { font-size: 16pt; color: #1e3a8a; border-left: 5pt solid #2563eb; padding-left: 12pt;
       margin: 24pt 0 12pt; font-weight: 700; page-break-after: avoid; }
  h3 { font-size: 13pt; color: #1e3a8a; margin: 16pt 0 8pt; font-weight: 700; page-break-after: avoid; }
  p { margin: 0 0 10pt; }
  ul, ol { margin: 0 0 12pt; padding-left: 22pt; }
  li { margin-bottom: 4pt; }
  table { width: 100%; border-collapse: collapse; margin: 10pt 0 16pt; font-size: 10pt; }
  th, td { border: 1pt solid #cbd5e1; padding: 8pt 10pt; text-align: left; vertical-align: top; }
  th { background: #eff6ff; color: #1e3a8a; font-weight: 700; }
  .cover { text-align: center; padding: 60pt 0 40pt; border-bottom: 3pt solid #2563eb; margin-bottom: 30pt; }
  .cover .logo { font-size: 36pt; font-weight: 800; color: #2563eb; letter-spacing: -0.02em; margin-bottom: 8pt; }
  .cover .sub { font-size: 14pt; color: #64748b; }
  .cover .meta { margin-top: 30pt; font-size: 10pt; color: #94a3b8; }
  .badge { display: inline-block; background: #2563eb; color: #fff; padding: 3pt 10pt;
           border-radius: 4pt; font-size: 9pt; font-weight: 700; margin-right: 6pt; }
  .badge.scs { background: #f59e0b; }
  .badge.ipa { background: #16a34a; }
  .price-row { display: flex; justify-content: space-between; align-items: baseline;
               border-bottom: 1pt dashed #cbd5e1; padding: 6pt 0; }
  .price-row .name { font-weight: 700; color: #0f172a; font-size: 13pt; }
  .price-row .amount { font-weight: 800; color: #2563eb; font-size: 14pt; }
  .callout { background: #eff6ff; border-left: 4pt solid #2563eb; padding: 12pt 14pt;
             border-radius: 4pt; margin: 12pt 0; }
  .callout strong { color: #1e3a8a; }
  .footer { margin-top: 40pt; padding-top: 14pt; border-top: 1pt solid #cbd5e1;
            font-size: 9pt; color: #64748b; text-align: center; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12pt; }
  .feat { background: #f8fafc; border: 1pt solid #e2e8f0; border-radius: 6pt; padding: 12pt; }
  .feat .ico { font-size: 18pt; }
  .feat .ttl { font-weight: 700; color: #1e3a8a; margin: 4pt 0; }
  .page-break { page-break-after: always; }
</style></head>
<body>

<!-- ────────── 表紙 ────────── -->
<div class="cover">
  <div class="logo">Sequlia</div>
  <div class="sub">AI駆動Webセキュリティ診断サービス</div>
  <div style="margin-top: 18pt;">
    <span class="badge scs">経産省 SCS★3 対応</span>
    <span class="badge ipa">IPA SECURITY ACTION ★2</span>
    <span class="badge">OWASP Top 10 準拠</span>
  </div>
  <div class="meta">サービス概要書 / 発行日: ${today}</div>
</div>

<!-- ────────── 1. サービス概要 ────────── -->
<h2>1. サービス概要</h2>
<p>Sequlia（セキュリア）は、AI技術と多数のセキュリティ検査エンジンを組み合わせたWebアプリケーション脆弱性診断クラウドサービスです。
URLを入力するだけで、最短3分から、<strong>OWASP Top 10完全準拠の174項目</strong>を自動で網羅検査します。</p>

<div class="grid-2">
  <div class="feat">
    <div class="ico">🎯</div>
    <div class="ttl">高精度スキャン</div>
    <div>23カテゴリ・174項目を自動診断</div>
  </div>
  <div class="feat">
    <div class="ico">⚡</div>
    <div class="ttl">スピード診断</div>
    <div>最短3分で結果を確認</div>
  </div>
  <div class="feat">
    <div class="ico">🛡️</div>
    <div class="ttl">安全な非侵襲検査</div>
    <div>受動的スキャンで本番環境も安心</div>
  </div>
  <div class="feat">
    <div class="ico">🤖</div>
    <div class="ttl">AI解析レポート</div>
    <div>検出結果を日本語で分かりやすく</div>
  </div>
</div>

<!-- ────────── 2. 診断項目 ────────── -->
<h2>2. 診断項目（23カテゴリ・174項目）</h2>

<h3>Tier 1：基本セキュリティ（早期検出層）</h3>
<table>
  <thead><tr><th>カテゴリ</th><th>項目数</th><th>主な検査内容</th></tr></thead>
  <tbody>
    <tr><td>ベストプラクティス基本検査</td><td>10</td><td>HSTS / CSP / Permissions-Policy / security.txt 等</td></tr>
    <tr><td>セキュリティヘッダー検査</td><td>10</td><td>HSTS / CSP / X-Frame-Options / Cookie属性</td></tr>
    <tr><td>サイト構造・隠しパス検出</td><td>8</td><td>.well-known / robots.txt / sitemap 解析</td></tr>
    <tr><td>古いソフトウェア・既知脆弱性検出</td><td>8</td><td>jQuery / WordPress / Server Banner CVE照合</td></tr>
    <tr><td>設定ミス・管理画面露出検査</td><td>15</td><td>ディレクトリリスティング / 管理パス / .git / .env</td></tr>
  </tbody>
</table>

<h3>Tier 2：能動的検出層</h3>
<table>
  <thead><tr><th>カテゴリ</th><th>項目数</th><th>主な検査内容</th></tr></thead>
  <tbody>
    <tr><td>情報漏洩・機密ファイル露出検査</td><td>10</td><td>バックアップ / sourcemap / Git露出</td></tr>
    <tr><td>DNS・サブドメイン情報収集</td><td>10</td><td>DNS / Whois / サブドメイン列挙</td></tr>
    <tr><td>攻撃対象面（Attack Surface）分析</td><td>7</td><td>SCS★3要件のインターネット公開資産分析</td></tr>
    <tr><td>CORS設定確認</td><td>7</td><td>Originリフレクション / wildcard誤設定</td></tr>
    <tr><td>CSRF確認</td><td>6</td><td>CSRFトークン欠落の確認</td></tr>
    <tr><td>匿名API露出確認</td><td>7</td><td>OWASP API Top10 認証なしAPI検出</td></tr>
    <tr><td>レートリミット</td><td>5</td><td>ブルートフォース耐性確認</td></tr>
  </tbody>
</table>

<h3>Tier 3：高度な脆弱性検出層</h3>
<table>
  <thead><tr><th>カテゴリ</th><th>項目数</th><th>主な検査内容</th></tr></thead>
  <tbody>
    <tr><td>オープンリダイレクト</td><td>7</td><td>フィッシング悪用可能なリダイレクト</td></tr>
    <tr><td>ユーザー列挙</td><td>5</td><td>ログイン画面でのユーザー存在確認</td></tr>
    <tr><td>キャッシュポイズニング</td><td>5</td><td>Webキャッシュポイズニング検出</td></tr>
    <tr><td>JWT脆弱性</td><td>6</td><td>署名検証欠落 / alg:none 攻撃</td></tr>
    <tr><td>パブリッククラウドストレージ</td><td>6</td><td>S3 / GCS / Azure Blob 公開バケット</td></tr>
    <tr><td>OAuthフロー欠陥</td><td>7</td><td>state欠落 / リダイレクトURI検証</td></tr>
    <tr><td>GraphQL脆弱性</td><td>7</td><td>Introspection / 深度制限 / バッチ攻撃</td></tr>
  </tbody>
</table>

<h3>Tier 4：インジェクション系（重い能動検査）</h3>
<table>
  <thead><tr><th>カテゴリ</th><th>項目数</th><th>主な検査内容</th></tr></thead>
  <tbody>
    <tr><td>XSS安全確認</td><td>10</td><td>反射型 / 保存型 / DOM型 XSS</td></tr>
    <tr><td>SQLi安全確認</td><td>8</td><td>エラーベース / ブラインドSQLi</td></tr>
    <tr><td>SSRF安全確認</td><td>6</td><td>SSRF / SSTI 安全プローブ</td></tr>
    <tr><td>HTTPスマグリング</td><td>4</td><td>CL-TE / TE-CL リクエストスマグリング</td></tr>
  </tbody>
</table>

<div class="page-break"></div>

<!-- ────────── 3. SCS対応詳細 ────────── -->
<h2>3. 経産省 SCS評価制度 ★3 対応詳細</h2>

<p>経済産業省「サプライチェーン強化に向けた連携プログラム（SCS）」は、企業のサイバーセキュリティ対策レベルを5段階で評価する制度です。
特に <strong>★3レベル</strong> では、インターネット公開機器・サービスへの定期的な脆弱性診断が要件に含まれます。</p>

<div class="callout">
  <strong>SequliaがカバーするSCS★3要件：</strong>
  <ul style="margin: 6pt 0 0;">
    <li>S3-RISK-01: IT資産の把握（インターネット公開資産の自動検出・一覧化）</li>
    <li>S3-RISK-02: 脆弱性情報の収集と管理（CVE自動照合・レポート出力）</li>
    <li>S3-PROT-01: インターネット公開機器・サービスの脆弱性診断（コア機能・完全対応）</li>
    <li>S3-PROT-02: Webアプリケーションの安全確認（OWASP Top10完全準拠）</li>
    <li>S3-PROT-03: ソフトウェアの脆弱性パッチ管理（古いソフトウェア検出）</li>
    <li>S3-PROT-05: セキュリティ設定の適正化（ヘッダー・CORS・Cookie設定検査）</li>
  </ul>
</div>

<h3>SCS★3 対応の運用例</h3>
<ol>
  <li><strong>月次スキャン実施</strong>：全公開URLに対しSequliaで月1回以上の自動診断を実施</li>
  <li><strong>結果記録</strong>：実施日時・スコア・検出件数を自動的に履歴管理</li>
  <li><strong>取引先提示</strong>：診断結果サマリPDFをサプライヤー監査時に提示可能</li>
  <li><strong>継続改善</strong>：高リスク項目を14日以内にパッチ適用するプロセスを運用</li>
</ol>

<!-- ────────── 4. 料金プラン ────────── -->
<h2>4. 料金プラン</h2>

<div class="price-row">
  <div>
    <div class="name">Free</div>
    <div style="color:#64748b; font-size:10pt;">月3回 / 全174項目</div>
  </div>
  <div class="amount">¥0 <span style="font-size:10pt; color:#64748b;">/月</span></div>
</div>

<div class="price-row">
  <div>
    <div class="name">Standard <span class="badge" style="font-size:8pt; padding:1pt 5pt;">人気</span></div>
    <div style="color:#64748b; font-size:10pt;">月30回 / PDF出力 / Slack通知 / メールサポート</div>
  </div>
  <div class="amount">¥4,980 <span style="font-size:10pt; color:#64748b;">/月（税込）</span></div>
</div>

<div class="price-row">
  <div>
    <div class="name">Pro</div>
    <div style="color:#64748b; font-size:10pt;">月200回 / 認証スキャン / API連携 / SCS★3レポート / 優先サポート</div>
  </div>
  <div class="amount">¥19,800 <span style="font-size:10pt; color:#64748b;">/月（税込）</span></div>
</div>

<div class="price-row">
  <div>
    <div class="name">Enterprise</div>
    <div style="color:#64748b; font-size:10pt;">無制限 / SAML SSO / 専任CS / SLA保証 / オンプレ対応</div>
  </div>
  <div class="amount" style="font-size:12pt;">個別見積</div>
</div>

<!-- ────────── 5. お問い合わせ ────────── -->
<h2>5. お問い合わせ</h2>

<table>
  <tbody>
    <tr><th style="width:30%;">サービスURL</th><td>https://seculens.fly.dev</td></tr>
    <tr><th>運営</th><td>Sequlia（屋号）／ 運営責任者: Taiki Kanetsuka</td></tr>
    <tr><th>所在地</th><td>〒156-0043 東京都世田谷区松原2-46-9</td></tr>
    <tr><th>メール</th><td>nugeirba@gmail.com</td></tr>
    <tr><th>電話</th><td>090-8612-8918（受付：平日 10:00-18:00）</td></tr>
  </tbody>
</table>

<div class="callout" style="margin-top: 20pt;">
  <strong>本資料の利用について：</strong>
  本資料は社内検討・取引先への提示用に自由にご利用いただけます。
  最新版は当社サービスサイトの「資料ダウンロード」からいつでも取得可能です。
</div>

<div class="footer">
  © 2026 Sequlia. All rights reserved. ／ 本資料の内容は予告なく変更される場合があります。
</div>

</body></html>`;
}
