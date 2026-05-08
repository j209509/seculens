import Link from "next/link";
import "../app/lp.css";

/**
 * 全ページ共通フッター（LP・法務ページ・料金ページ・サインアップ等）
 * (app) や /admin の管理系ページには表示しない
 */
export function SiteFooter() {
  return (
    <footer className="lp-footer">
      <div className="container">
        <div className="foot-grid">
          <div className="foot-brand">
            <div className="logo" style={{ color: "#fff" }}>
              <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M16 2L4 6v9c0 7.5 5.1 13.6 12 15 6.9-1.4 12-7.5 12-15V6L16 2z" fill="#3b82f6" />
                <path d="M16 6.5L8 9v6c0 5.3 3.4 9.6 8 10.6 4.6-1 8-5.3 8-10.6V9L16 6.5z" fill="#0f172a" />
                <circle cx="16" cy="14" r="3.5" fill="none" stroke="#3b82f6" strokeWidth="2" />
                <line x1="18.5" y1="16.5" x2="21" y2="19" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Sequlia
            </div>
            <p>あなたのWebサイト、今すぐ無料で脆弱性診断。</p>
            <div className="copy">© 2026 Sequlia, Inc.</div>
          </div>
          <div className="foot-links">
            <Link href="/">サービス</Link>
            <Link href="/#pricing">料金</Link>
            <Link href="/compliance">SCS対応</Link>
            <Link href="/history">診断履歴</Link>
            <Link href="/legal/privacy">プライバシーポリシー</Link>
            <Link href="/legal/terms">利用規約</Link>
            <Link href="/legal/tokushoho">特定商取引法に基づく表記</Link>
          </div>
          <div className="foot-cta">
            <Link href="/dashboard" className="btn btn-lg">ダッシュボードへ</Link>
          </div>
        </div>
        <div className="foot-bottom">
          <span>Sequlia は経産省 SCS評価制度 ★3 / IPA SECURITY ACTION ★2 に対応しています。</span>
          <span>v1.0 — 2026.05</span>
        </div>
      </div>
    </footer>
  );
}
