// SCS = サプライチェーン強化に向けたセキュリティ対策評価制度
// 経産省・IPA 主管。2027年2〜3月より本格運用開始予定。
// ★3（基礎）: 26評価項目 / 83評価基準、専門家確認付き自己評価、有効期間1年
// ★4（標準）: 44評価項目 / 157評価基準、第三者機関評価、有効期間3年

export type ScsStar = 3 | 4;

export type ScsCategory =
  | "governance"          // ガバナンスの整備
  | "supplier_mgmt"       // 取引先管理
  | "risk_identification" // リスクの特定
  | "protection"          // 攻撃等の防御
  | "detection"           // 攻撃等の検知
  | "response"            // インシデントへの対応
  | "recovery";           // インシデントからの復旧

export const SCS_CATEGORY_LABELS: Record<ScsCategory, { ja: string; en: string; icon: string }> = {
  governance:          { ja: "ガバナンスの整備",      en: "Governance",          icon: "🏛️" },
  supplier_mgmt:       { ja: "取引先管理",            en: "Supplier Management", icon: "🤝" },
  risk_identification: { ja: "リスクの特定",           en: "Risk Identification", icon: "🔍" },
  protection:          { ja: "攻撃等の防御",           en: "Protection",          icon: "🛡️" },
  detection:           { ja: "攻撃等の検知",           en: "Detection",           icon: "📡" },
  response:            { ja: "インシデントへの対応",    en: "Response",            icon: "🚨" },
  recovery:            { ja: "インシデントからの復旧",  en: "Recovery",            icon: "♻️" },
};

export type SecuLensCoverage = "full" | "partial" | "guide" | "none";

export interface ScsRequirement {
  id: string;
  star: ScsStar;
  category: ScsCategory;
  title: string;
  description: string;
  coverage: SecuLensCoverage;
  coverageNote: string;
  relatedChecks?: string[];  // SecuLens check names that satisfy this
}

// ★3 requirements (26 items) - SecuLensが対応するもの中心
export const SCS_STAR3_REQUIREMENTS: ScsRequirement[] = [
  // ===== ガバナンスの整備 =====
  {
    id: "s3-gov-01",
    star: 3,
    category: "governance",
    title: "セキュリティ方針・規程の整備",
    description: "情報セキュリティ方針を策定し、組織内に周知している",
    coverage: "guide",
    coverageNote: "SecuLensはポリシーテンプレートと診断根拠資料の生成を支援",
  },
  {
    id: "s3-gov-02",
    star: 3,
    category: "governance",
    title: "責任者・担当者の明確化",
    description: "情報セキュリティ担当者を定め、責任範囲を明確にしている",
    coverage: "guide",
    coverageNote: "SecuLensのレポートを担当者アサインの根拠資料として活用可能",
  },

  // ===== リスクの特定 =====
  {
    id: "s3-risk-01",
    star: 3,
    category: "risk_identification",
    title: "IT資産の把握",
    description: "自社のIT資産（サーバー、端末、クラウドサービス等）を一覧化している",
    coverage: "partial",
    coverageNote: "SecuLensはインターネット公開資産を自動検出・一覧化する",
    relatedChecks: ["外部攻撃対象面分析", "外部受動観測"],
  },
  {
    id: "s3-risk-02",
    star: 3,
    category: "risk_identification",
    title: "脆弱性情報の収集と管理",
    description: "CVE等の脆弱性情報を継続的に収集し、自社システムへの影響を把握している",
    coverage: "full",
    coverageNote: "SecuLensが既知脆弱性（CVE）を自動検出・レポート出力",
    relatedChecks: ["アウトデートソフトウェア", "外部その他"],
  },

  // ===== 攻撃等の防御 =====
  {
    id: "s3-prot-01",
    star: 3,
    category: "protection",
    title: "インターネット公開機器・サービスの脆弱性診断",
    description: "インターネット上に公開された機器・サービスに対し、脆弱性診断を定期的に実施する（年1回以上推奨）",
    coverage: "full",
    coverageNote: "SecuLensのコア機能。110+チェック・OWASP Top10準拠で完全対応",
    relatedChecks: [
      "Well-Known & Robots", "外部受動観測", "外部低コスト確認", "情報収集", "外部その他",
      "攻撃対象面分析", "CORS設定確認", "CSRF確認", "XSS安全確認", "SQLi安全確認",
    ],
  },
  {
    id: "s3-prot-02",
    star: 3,
    category: "protection",
    title: "Webアプリケーションの安全確認",
    description: "OWASP Top10に基づくWebアプリケーションの脆弱性を定期的に確認する",
    coverage: "full",
    coverageNote: "OWASP Top10（A01〜A10）全カテゴリに対応。インジェクション・認証・設定ミス等を自動検査",
    relatedChecks: [
      "XSS安全確認", "SQLi安全確認", "SSRF安全確認", "JWT脆弱性", "OAuthフロー欠陥",
      "CSRF確認", "CORS設定確認", "HTTPスマグリング",
    ],
  },
  {
    id: "s3-prot-03",
    star: 3,
    category: "protection",
    title: "ソフトウェアの脆弱性パッチ管理",
    description: "高危険度の脆弱性パッチは14日以内に適用するプロセスを有している",
    coverage: "partial",
    coverageNote: "SecuLensは老朽化ソフトウェア・未パッチ状態を検出し、優先度付きで報告",
    relatedChecks: ["アウトデートソフトウェア"],
  },
  {
    id: "s3-prot-04",
    star: 3,
    category: "protection",
    title: "認証・アクセス制御の強化",
    description: "多要素認証（MFA）の導入、特権アカウントの適切な管理を実施している",
    coverage: "partial",
    coverageNote: "SecuLensはMFA欠落・認証バイパス・JWT脆弱性を検出。実装確認は別途必要",
    relatedChecks: ["JWT脆弱性", "2FA/OTPバイパス", "ユーザー列挙", "レートリミット"],
  },
  {
    id: "s3-prot-05",
    star: 3,
    category: "protection",
    title: "セキュリティ設定の適正化",
    description: "サーバー・クラウドサービスのセキュリティ設定を適正に維持している",
    coverage: "full",
    coverageNote: "SecuLensはHTTPヘッダー・CORS・クッキー属性・クラウドストレージ設定を自動検査",
    relatedChecks: ["CORS設定確認", "パブリッククラウドストレージ", "外部受動観測"],
  },
  {
    id: "s3-prot-06",
    star: 3,
    category: "protection",
    title: "マルウェア対策",
    description: "エンドポイントにウイルス対策ソフトウェアを導入・最新状態を維持している",
    coverage: "none",
    coverageNote: "エンドポイント管理ツール（EDR等）が必要。SecuLensは対象外",
  },
  {
    id: "s3-prot-07",
    star: 3,
    category: "protection",
    title: "バックアップとオフライン保管",
    description: "重要データをバックアップし、オフライン環境への保管を実施している",
    coverage: "none",
    coverageNote: "バックアップシステムの設定・運用管理ツールが別途必要",
  },

  // ===== 攻撃等の検知 =====
  {
    id: "s3-det-01",
    star: 3,
    category: "detection",
    title: "ログの取得・保管",
    description: "システム・ユーザー操作のログを取得し、一定期間保管している",
    coverage: "guide",
    coverageNote: "SecuLensの診断ログは証跡として利用可能。サーバーログ管理は別途必要",
  },
  {
    id: "s3-det-02",
    star: 3,
    category: "detection",
    title: "不審な通信・アクセスの検知",
    description: "不審なネットワーク通信やアクセスを検知する仕組みを整備している",
    coverage: "partial",
    coverageNote: "SecuLensはオープンリダイレクト・SSRF・不審なAPIエンドポイントを検出",
    relatedChecks: ["オープンリダイレクト", "SSRF安全確認", "匿名API露出確認"],
  },

  // ===== インシデントへの対応 =====
  {
    id: "s3-resp-01",
    star: 3,
    category: "response",
    title: "インシデント対応手順の整備",
    description: "サイバー攻撃を受けた場合の対応手順書を作成・周知している",
    coverage: "guide",
    coverageNote: "SecuLensの診断レポートは初動対応の根拠資料として活用可能",
  },
  {
    id: "s3-resp-02",
    star: 3,
    category: "response",
    title: "連絡体制・エスカレーション",
    description: "インシデント発生時の社内外への連絡体制を明確にしている",
    coverage: "none",
    coverageNote: "組織内の体制整備が必要。SecuLensは対象外",
  },

  // ===== インシデントからの復旧 =====
  {
    id: "s3-rec-01",
    star: 3,
    category: "recovery",
    title: "事業継続計画（BCP）の策定",
    description: "サイバーインシデント発生を想定した事業継続計画を策定している",
    coverage: "none",
    coverageNote: "BCPは組織のプロセス・体制整備が必要。SecuLensは根拠資料として支援",
  },
];

// ★4 additional requirements (select items beyond ★3)
export const SCS_STAR4_ADDITIONAL: ScsRequirement[] = [
  {
    id: "s4-gov-01",
    star: 4,
    category: "governance",
    title: "CISO等の責任者任命",
    description: "CISO（最高情報セキュリティ責任者）または同等の役職を設置している",
    coverage: "guide",
    coverageNote: "SecuLensのリスクスコア・レポートをCISOへの経営報告資料として活用",
  },
  {
    id: "s4-sup-01",
    star: 4,
    category: "supplier_mgmt",
    title: "取引先のセキュリティ確認",
    description: "委託先・取引先のセキュリティ状況を定期的に確認・監査している",
    coverage: "full",
    coverageNote: "SecuLensで取引先URLを診断し、SCS準拠状況を可視化。サプライチェーン全体の管理が可能",
  },
  {
    id: "s4-sup-02",
    star: 4,
    category: "supplier_mgmt",
    title: "契約時のセキュリティ要件",
    description: "委託契約にセキュリティ要件（脆弱性診断の実施等）を明記している",
    coverage: "guide",
    coverageNote: "SecuLensの診断結果を契約時の証跡・要件確認書類として活用",
  },
  {
    id: "s4-risk-01",
    star: 4,
    category: "risk_identification",
    title: "高度な脆弱性診断の実施",
    description: "第三者機関による脆弱性診断・ペネトレーションテストを年1回以上実施",
    coverage: "full",
    coverageNote: "SecuLensはOWASP Top10全カテゴリ・110+チェックを自動実施。診断レポートを第三者評価の根拠として提出可能",
    relatedChecks: ["全チェック"],
  },
  {
    id: "s4-prot-01",
    star: 4,
    category: "protection",
    title: "継続的な脆弱性管理プログラム",
    description: "脆弱性診断を定期・継続的に実施し、結果をリスク管理に組み込んでいる",
    coverage: "full",
    coverageNote: "SecuLensは診断履歴・リスクスコアトレンドを蓄積。継続的なセキュリティ改善を支援",
  },
  {
    id: "s4-det-01",
    star: 4,
    category: "detection",
    title: "高度な脅威検知",
    description: "SIEM等による高度な脅威検知・相関分析を実施している",
    coverage: "partial",
    coverageNote: "SecuLensの診断ログをSIEM連携の基礎データとして活用可能",
  },
];

export const ALL_SCS_REQUIREMENTS = [...SCS_STAR3_REQUIREMENTS, ...SCS_STAR4_ADDITIONAL];

// Coverage statistics
export function calcScsCoverage(requirements: ScsRequirement[]) {
  const total = requirements.length;
  const full = requirements.filter(r => r.coverage === "full").length;
  const partial = requirements.filter(r => r.coverage === "partial").length;
  const guide = requirements.filter(r => r.coverage === "guide").length;
  const none = requirements.filter(r => r.coverage === "none").length;

  return { total, full, partial, guide, none };
}

// Map vulnerability severity to SCS impact level
export function severityToScsImpact(severity: string): string {
  switch (severity.toLowerCase()) {
    case "critical": return "★3/★4 即座対応必須（14日以内）";
    case "high":     return "★3/★4 優先対応（30日以内）";
    case "medium":   return "★3 対応推奨";
    case "low":      return "改善推奨";
    default:         return "参考情報";
  }
}

// Map finding type to SCS requirement IDs
export function findingToScsRequirements(findingType: string): string[] {
  const t = findingType.toLowerCase();
  const reqs: string[] = [];

  // Always applies to internet-exposed asset scanning requirement
  reqs.push("s3-prot-01");

  if (/xss|cross.site.script/.test(t)) reqs.push("s3-prot-02");
  if (/sql.inject|sqli/.test(t)) reqs.push("s3-prot-02");
  if (/ssrf|ssti/.test(t)) reqs.push("s3-prot-02", "s3-det-02");
  if (/cors/.test(t)) reqs.push("s3-prot-05");
  if (/jwt|oauth|認証|2fa|mfa/.test(t)) reqs.push("s3-prot-04");
  if (/outdated|outdate|脆弱性.*ソフト|cve/.test(t)) reqs.push("s3-prot-03", "s3-risk-02");
  if (/cloud|s3|gcs|azure/.test(t)) reqs.push("s3-prot-05");
  if (/csrf/.test(t)) reqs.push("s3-prot-02");
  if (/redirect|リダイレクト/.test(t)) reqs.push("s3-det-02");
  if (/graphql|api.*露出|anonymous/.test(t)) reqs.push("s3-det-02", "s3-prot-01");

  return [...new Set(reqs)];
}
