import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "特定商取引法に基づく表記 | Sequlia",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

const ROW_LABEL: React.CSSProperties = {
  width: 220,
  padding: "14px 16px",
  background: "#f8fafc",
  borderBottom: "1px solid #e2e8f0",
  fontWeight: 600,
  color: "#334155",
  verticalAlign: "top",
  fontSize: 14,
};
const ROW_VAL: React.CSSProperties = {
  padding: "14px 16px",
  borderBottom: "1px solid #e2e8f0",
  color: "#0f172a",
  fontSize: 14,
  lineHeight: 1.7,
};

export default function TokushohoPage() {
  return (
    <article>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>
        特定商取引法に基づく表記
      </h1>
      <p style={{ color: "#64748b", fontSize: 13, marginBottom: 24 }}>
        Disclosure Based on the Act on Specified Commercial Transactions
      </p>

      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            <tr>
              <td style={ROW_LABEL}>販売事業者</td>
              <td style={ROW_VAL}>Sequlia（屋号）</td>
            </tr>
            <tr>
              <td style={ROW_LABEL}>運営責任者</td>
              <td style={ROW_VAL}>Taiki Kanetsuka</td>
            </tr>
            <tr>
              <td style={ROW_LABEL}>所在地</td>
              <td style={ROW_VAL}>
                〒156-0043<br />
                東京都世田谷区松原2-46-9
              </td>
            </tr>
            <tr>
              <td style={ROW_LABEL}>電話番号</td>
              <td style={ROW_VAL}>
                090-8612-8918<br />
                <span style={{ fontSize: 12, color: "#64748b" }}>
                  （受付時間：平日 10:00-18:00／請求があった場合は遅滞なく開示します）
                </span>
              </td>
            </tr>
            <tr>
              <td style={ROW_LABEL}>メールアドレス</td>
              <td style={ROW_VAL}>nugeirba@gmail.com</td>
            </tr>
            <tr>
              <td style={ROW_LABEL}>ウェブサイトURL</td>
              <td style={ROW_VAL}>https://seculens.fly.dev</td>
            </tr>
            <tr>
              <td style={ROW_LABEL}>販売価格</td>
              <td style={ROW_VAL}>
                各プランの販売ページに表示する価格（消費税込）<br />
                <span style={{ fontSize: 13, color: "#475569" }}>
                  ・Free: ¥0／月<br />
                  ・Standard: ¥4,980／月（税込）<br />
                  ・Pro: ¥19,800／月（税込）<br />
                  ・Enterprise: 個別見積（要お問い合わせ）
                </span>
              </td>
            </tr>
            <tr>
              <td style={ROW_LABEL}>商品代金以外の必要料金</td>
              <td style={ROW_VAL}>
                インターネット接続にかかる通信料はお客様のご負担となります。<br />
                その他、商品代金以外の費用は発生いたしません。
              </td>
            </tr>
            <tr>
              <td style={ROW_LABEL}>支払方法</td>
              <td style={ROW_VAL}>
                クレジットカード決済（Stripe）<br />
                対応カードブランド: Visa / Mastercard / American Express / JCB / Diners Club
              </td>
            </tr>
            <tr>
              <td style={ROW_LABEL}>支払時期</td>
              <td style={ROW_VAL}>
                初回ご契約時にクレジットカードへ即時課金し、以降は毎月の契約更新日に自動課金されます。
              </td>
            </tr>
            <tr>
              <td style={ROW_LABEL}>役務（サービス）の提供時期</td>
              <td style={ROW_VAL}>
                クレジットカード決済が完了した時点で、ご契約いただいたプランの機能が即時利用可能となります。
              </td>
            </tr>
            <tr>
              <td style={ROW_LABEL}>解約・返金について</td>
              <td style={ROW_VAL}>
                <strong>解約</strong>: ダッシュボード内「課金・プラン」ページの「サブスクリプション管理」より、いつでもお手続きいただけます。解約手続き完了後、現在の課金期間終了時まではサービスをご利用いただけます。<br />
                <br />
                <strong>返金</strong>: サービスの性質上、原則として日割り返金は行っておりません。ただし、当社の責に帰すべき事由によりサービスが正常に提供できなかった場合は、個別に対応させていただきます。<br />
                <br />
                <strong>クーリング・オフ</strong>: 本サービスはデジタルコンテンツのため、特定商取引法に基づくクーリング・オフ制度の対象外となります。
              </td>
            </tr>
            <tr>
              <td style={ROW_LABEL}>動作環境</td>
              <td style={ROW_VAL}>
                最新のモダンブラウザ（Chrome / Edge / Safari / Firefox の各最新版）<br />
                安定したインターネット接続環境
              </td>
            </tr>
            <tr>
              <td style={ROW_LABEL}>その他特記事項</td>
              <td style={ROW_VAL}>
                ・本サービスはお客様ご自身が運営・管理するウェブサイト、または正当な権限を有するウェブサイトに対してのみご利用いただけます。<br />
                ・第三者が運営するウェブサイトを無断で診断する行為は、不正アクセス行為の禁止等に関する法律（不正アクセス禁止法）等に抵触する可能性があります。
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 24, color: "#64748b", fontSize: 12 }}>
        最終更新日: 2026年5月8日
      </p>
    </article>
  );
}
