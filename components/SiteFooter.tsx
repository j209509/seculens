import Link from "next/link";

/**
 * Stripe審査対応SaaSフッター（全ページ共通）
 * 必須項目: 事業者名・所在地・連絡先・特商法・プラポリ・利用規約・価格情報
 */
export function SiteFooter() {
  return (
    <footer style={F.footer}>
      <div style={F.container}>
        {/* Top: 4列グリッド */}
        <div style={F.grid}>
          {/* ブランド・事業者情報 */}
          <div style={F.col}>
            <Link href="/" style={F.brand}>
              <svg viewBox="0 0 32 32" width={28} height={28} fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M16 2L4 6v9c0 7.5 5.1 13.6 12 15 6.9-1.4 12-7.5 12-15V6L16 2z" fill="#3b82f6" />
                <path d="M16 6.5L8 9v6c0 5.3 3.4 9.6 8 10.6 4.6-1 8-5.3 8-10.6V9L16 6.5z" fill="#0f172a" />
                <circle cx="16" cy="14" r="3.5" fill="none" stroke="#3b82f6" strokeWidth="2" />
                <line x1="18.5" y1="16.5" x2="21" y2="19" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span style={F.brandName}>Sequlia</span>
            </Link>
            <p style={F.tag}>AI×OWASP Top10完全準拠の Web脆弱性診断 SaaS。URLを入れるだけ、最短3分で結果。</p>
            <div style={F.bizBlock}>
              <div style={F.bizRow}><span style={F.bizLabel}>事業者</span><span>Sequlia（屋号）</span></div>
              <div style={F.bizRow}><span style={F.bizLabel}>運営責任者</span><span>Taiki Kanetsuka</span></div>
              <div style={F.bizRow}>
                <span style={F.bizLabel}>所在地</span>
                <span>〒156-0043<br />東京都世田谷区松原2-46-9</span>
              </div>
              <div style={F.bizRow}>
                <span style={F.bizLabel}>連絡先</span>
                <span>
                  <a href="mailto:nugeirba@gmail.com" style={F.linkInline}>nugeirba@gmail.com</a><br />
                  TEL: 090-8612-8918<br />
                  <span style={F.sub}>受付：平日 10:00-18:00</span>
                </span>
              </div>
            </div>
          </div>

          {/* サービス */}
          <div style={F.col}>
            <h4 style={F.colH}>サービス</h4>
            <ul style={F.list}>
              <li><Link href="/" style={F.link}>トップ</Link></li>
              <li><Link href="/#features" style={F.link}>機能・特徴</Link></li>
              <li><Link href="/pricing" style={F.link}>料金プラン</Link></li>
              <li><Link href="/#scs" style={F.link}>SCS★3対応</Link></li>
              <li><Link href="/#incidents" style={F.link}>被害事例</Link></li>
              <li><a href="/docs/Sequlia_Service_Overview.pdf" target="_blank" rel="noopener noreferrer" style={F.link}>サービス資料 (PDF)</a></li>
            </ul>
          </div>

          {/* アカウント・サポート */}
          <div style={F.col}>
            <h4 style={F.colH}>アカウント</h4>
            <ul style={F.list}>
              <li><Link href="/signup" style={F.link}>無料登録</Link></li>
              <li><Link href="/login" style={F.link}>ログイン</Link></li>
              <li><Link href="/dashboard" style={F.link}>ダッシュボード</Link></li>
              <li><Link href="/billing" style={F.link}>課金・プラン</Link></li>
              <li><Link href="/history" style={F.link}>診断履歴</Link></li>
            </ul>
            <h4 style={{ ...F.colH, marginTop: 22 }}>サポート</h4>
            <ul style={F.list}>
              <li><a href="mailto:nugeirba@gmail.com" style={F.link}>お問い合わせ</a></li>
              <li><Link href="/#faq" style={F.link}>よくある質問</Link></li>
            </ul>
          </div>

          {/* 法務 */}
          <div style={F.col}>
            <h4 style={F.colH}>法務・コンプライアンス</h4>
            <ul style={F.list}>
              <li><Link href="/legal/terms" style={F.link}>利用規約</Link></li>
              <li><Link href="/legal/privacy" style={F.link}>プライバシーポリシー</Link></li>
              <li><Link href="/legal/tokushoho" style={F.link}>特定商取引法に基づく表記</Link></li>
            </ul>

            <h4 style={{ ...F.colH, marginTop: 22 }}>認定</h4>
            <div style={F.badges}>
              <span style={F.badge}>
                <span style={F.badgeStar}>★3</span>
                <span>経産省 SCS<br />評価制度対応</span>
              </span>
              <span style={F.badge}>
                <span style={{ ...F.badgeStar, color: "#fbbf24" }}>★2</span>
                <span>IPA SECURITY<br />ACTION</span>
              </span>
            </div>

            <h4 style={{ ...F.colH, marginTop: 22 }}>決済</h4>
            <div style={F.payments}>
              <span style={F.payChip}>VISA</span>
              <span style={F.payChip}>Mastercard</span>
              <span style={F.payChip}>AMEX</span>
              <span style={F.payChip}>JCB</span>
              <span style={F.payChip}>Diners</span>
            </div>
            <div style={F.payNote}>決済処理は Stripe を利用しています。当社はカード情報を保持しません。</div>
          </div>
        </div>

        {/* Mid: 免責 */}
        <div style={F.disclaim}>
          <strong style={F.disclaimTitle}>免責事項</strong>
          <p style={F.disclaimText}>
            Sequliaは受動的スキャンによる脆弱性診断サービスです。診断結果は検出可能な範囲のものであり、すべての脆弱性の検出を保証するものではありません。
            診断対象サイトに対する責任はサイト管理者にあり、診断後の対応・修正は利用者の責任で実施するものとします。
            診断対象は<strong>利用者が運営・管理するサイト、または正当な権限を有するサイトに限ります</strong>。第三者サイトへの無断診断は不正アクセス禁止法等に抵触する可能性があります。
          </p>
        </div>

        {/* Bottom strip */}
        <div style={F.bottom}>
          <div style={F.copy}>© 2026 Sequlia. All rights reserved.</div>
          <div style={F.bottomLinks}>
            <Link href="/legal/terms" style={F.bottomLink}>利用規約</Link>
            <span style={F.dot}>·</span>
            <Link href="/legal/privacy" style={F.bottomLink}>プライバシーポリシー</Link>
            <span style={F.dot}>·</span>
            <Link href="/legal/tokushoho" style={F.bottomLink}>特定商取引法に基づく表記</Link>
            <span style={F.dot}>·</span>
            <a href="mailto:nugeirba@gmail.com" style={F.bottomLink}>お問い合わせ</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

const F: Record<string, React.CSSProperties> = {
  footer: {
    background: "#0b1220",
    color: "#cbd5e1",
    padding: "64px 0 24px",
    borderTop: "1px solid #1e293b",
    fontSize: 13,
    lineHeight: 1.7,
  },
  container: { maxWidth: 1200, margin: "0 auto", padding: "0 24px" },
  grid: {
    display: "grid",
    gridTemplateColumns: "1.5fr 1fr 1fr 1.3fr",
    gap: 40,
    paddingBottom: 40,
    borderBottom: "1px solid #1e293b",
  },
  col: { minWidth: 0 },
  brand: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    color: "#fff",
    textDecoration: "none",
    marginBottom: 12,
  },
  brandName: { fontSize: 18, fontWeight: 800, color: "#fff" },
  tag: { color: "#94a3b8", fontSize: 12.5, marginBottom: 18, lineHeight: 1.75 },
  bizBlock: {
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: 10,
    padding: "14px 16px",
    fontSize: 12,
  },
  bizRow: {
    display: "grid",
    gridTemplateColumns: "80px 1fr",
    gap: 10,
    padding: "6px 0",
    borderBottom: "1px solid rgba(30,41,59,.6)",
  },
  bizLabel: { color: "#64748b", fontWeight: 600, fontSize: 11 },
  sub: { color: "#64748b", fontSize: 11 },
  colH: {
    color: "#fff",
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 12,
    letterSpacing: ".02em",
  },
  list: { listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 7 },
  link: { color: "#94a3b8", textDecoration: "none", fontSize: 13, transition: "color .15s" },
  linkInline: { color: "#60a5fa", textDecoration: "none" },
  badges: { display: "flex", flexDirection: "column", gap: 8 },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    background: "rgba(96,165,250,.08)",
    border: "1px solid rgba(96,165,250,.25)",
    borderRadius: 10,
    fontSize: 11,
    color: "#cbd5e1",
    lineHeight: 1.4,
  },
  badgeStar: {
    color: "#60a5fa",
    fontWeight: 900,
    fontSize: 18,
    minWidth: 30,
    textAlign: "center" as const,
  },
  payments: { display: "flex", flexWrap: "wrap" as const, gap: 6 },
  payChip: {
    padding: "4px 8px",
    background: "#fff",
    color: "#0f172a",
    fontSize: 10,
    fontWeight: 800,
    borderRadius: 4,
    letterSpacing: ".02em",
  },
  payNote: { color: "#64748b", fontSize: 11, marginTop: 8, lineHeight: 1.6 },
  disclaim: {
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: 10,
    padding: "16px 20px",
    marginTop: 32,
  },
  disclaimTitle: { color: "#fbbf24", fontSize: 12, fontWeight: 700, display: "block", marginBottom: 6 },
  disclaimText: { color: "#94a3b8", fontSize: 12, margin: 0, lineHeight: 1.8 },
  bottom: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap" as const,
    gap: 14,
    marginTop: 24,
    paddingTop: 20,
    borderTop: "1px solid #1e293b",
  },
  copy: { color: "#64748b", fontSize: 12 },
  bottomLinks: { display: "flex", flexWrap: "wrap" as const, alignItems: "center", gap: 4 },
  bottomLink: { color: "#94a3b8", textDecoration: "none", fontSize: 12 },
  dot: { color: "#475569", padding: "0 4px" },
};
