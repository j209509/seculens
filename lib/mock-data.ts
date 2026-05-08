export type RiskLevel = "critical" | "high" | "medium" | "low" | "info";

export interface Vulnerability {
  id: string;
  name: string;
  nameJa: string;
  category: string;
  riskLevel: RiskLevel;
  cvssScore: number;
  description: string;
  impact: string;
  recommendation: string;
  affectedUrl: string;
  owasp: string;
  detectedAt: string;
}

export interface ScanResult {
  id: string;
  url: string;
  company: string;
  status: "completed" | "running" | "failed";
  startedAt: string;
  completedAt: string;
  totalVulnerabilities: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  riskScore: number;
  vulnerabilities: Vulnerability[];
}

export const MOCK_SCAN_HISTORY: ScanResult[] = [
  {
    id: "scan-001",
    url: "https://www.techsolution.co.jp",
    company: "株式会社テックソリューション",
    status: "completed",
    startedAt: "2026-04-19T09:15:00",
    completedAt: "2026-04-19T09:17:32",
    totalVulnerabilities: 8,
    critical: 1,
    high: 2,
    medium: 3,
    low: 2,
    info: 0,
    riskScore: 78,
    vulnerabilities: [
      {
        id: "v-001",
        name: "SQL Injection",
        nameJa: "SQLインジェクション",
        category: "インジェクション",
        riskLevel: "critical",
        cvssScore: 9.8,
        description:
          "ログインフォームのユーザー名フィールドでSQLインジェクション脆弱性が検出されました。攻撃者はこの脆弱性を悪用してデータベースに不正アクセスし、機密情報の漏洩や改ざんを行う可能性があります。",
        impact:
          "顧客情報、認証情報、財務データなどの機密情報が漏洩する可能性があります。データベースの完全な制御権が攻撃者に渡る恐れがあります。",
        recommendation:
          "プリペアドステートメント（パラメータ化クエリ）を使用してください。ORMフレームワークの活用を推奨します。入力値のサニタイゼーションとバリデーションを実装してください。WAF（Webアプリケーションファイアウォール）の導入も効果的です。",
        affectedUrl: "https://www.techsolution.co.jp/login",
        owasp: "A03:2021 - インジェクション",
        detectedAt: "2026-04-19T09:16:05",
      },
      {
        id: "v-002",
        name: "Cross-Site Scripting (XSS)",
        nameJa: "クロスサイトスクリプティング（XSS）",
        category: "XSS",
        riskLevel: "high",
        cvssScore: 7.4,
        description:
          "検索フィールドに反射型XSS脆弱性が検出されました。ユーザーが入力したスクリプトがページに反映される可能性があります。",
        impact:
          "セッションハイジャック、フィッシング攻撃、マルウェアの配布などに悪用される可能性があります。",
        recommendation:
          "出力時のHTMLエスケープ処理を徹底してください。Content Security Policy (CSP) ヘッダーを設定してください。DOMベースのXSSを防ぐため、innerHTMLの使用を避けてください。",
        affectedUrl: "https://www.techsolution.co.jp/search",
        owasp: "A03:2021 - インジェクション",
        detectedAt: "2026-04-19T09:16:22",
      },
      {
        id: "v-003",
        name: "Broken Authentication",
        nameJa: "認証の不備",
        category: "認証・セッション管理",
        riskLevel: "high",
        cvssScore: 7.1,
        description:
          "セッション管理に問題が検出されました。セッションIDが推測可能な値を使用しており、セッション固定攻撃のリスクがあります。",
        impact: "不正なユーザーがアカウントを乗っ取り、権限なしにシステムにアクセスできる可能性があります。",
        recommendation:
          "暗号学的に安全な乱数を使用してセッションIDを生成してください。ログイン後にセッションIDを再生成してください。適切なセッションタイムアウトを設定してください。",
        affectedUrl: "https://www.techsolution.co.jp/dashboard",
        owasp: "A07:2021 - 識別と認証の失敗",
        detectedAt: "2026-04-19T09:16:45",
      },
      {
        id: "v-004",
        name: "Missing Security Headers",
        nameJa: "セキュリティヘッダーの欠如",
        category: "セキュリティ設定",
        riskLevel: "medium",
        cvssScore: 5.3,
        description:
          "重要なセキュリティヘッダーが設定されていません。X-Frame-Options、X-Content-Type-Options、Strict-Transport-Securityが欠如しています。",
        impact: "クリックジャッキング攻撃、MIMEタイプスニッフィング、中間者攻撃のリスクが高まります。",
        recommendation:
          "X-Frame-Options: DENYを設定してください。X-Content-Type-Options: nosniffを追加してください。HSTS（HTTP Strict Transport Security）を有効化してください。",
        affectedUrl: "https://www.techsolution.co.jp",
        owasp: "A05:2021 - セキュリティの設定ミス",
        detectedAt: "2026-04-19T09:17:00",
      },
    ],
  },
  {
    id: "scan-002",
    url: "https://shop.sample-shoji.com",
    company: "サンプル商事株式会社",
    status: "completed",
    startedAt: "2026-04-18T14:30:00",
    completedAt: "2026-04-18T14:33:15",
    totalVulnerabilities: 5,
    critical: 0,
    high: 1,
    medium: 2,
    low: 2,
    info: 0,
    riskScore: 52,
    vulnerabilities: [
      {
        id: "v-005",
        name: "Insecure Direct Object Reference",
        nameJa: "安全でない直接オブジェクト参照",
        category: "アクセス制御",
        riskLevel: "high",
        cvssScore: 7.5,
        description:
          "注文詳細ページのURLパラメータを変更することで、他ユーザーの注文情報にアクセスできる脆弱性が検出されました。",
        impact: "顧客の個人情報、注文履歴、支払い情報が他のユーザーに閲覧される可能性があります。",
        recommendation:
          "サーバー側でアクセス制御を徹底してください。間接参照マップを使用してください。リソースへのアクセス前に必ず認可チェックを実装してください。",
        affectedUrl: "https://shop.sample-shoji.com/orders/12345",
        owasp: "A01:2021 - アクセス制御の破損",
        detectedAt: "2026-04-18T14:31:30",
      },
    ],
  },
  {
    id: "scan-003",
    url: "https://portal.innovation-lab.jp",
    company: "イノベーションラボ合同会社",
    status: "completed",
    startedAt: "2026-04-17T11:00:00",
    completedAt: "2026-04-17T11:02:45",
    totalVulnerabilities: 3,
    critical: 0,
    high: 0,
    medium: 1,
    low: 2,
    info: 0,
    riskScore: 28,
    vulnerabilities: [],
  },
  {
    id: "scan-004",
    url: "https://api.digitalwave.co.jp",
    company: "デジタルウェーブ株式会社",
    status: "completed",
    startedAt: "2026-04-16T16:45:00",
    completedAt: "2026-04-16T16:48:20",
    totalVulnerabilities: 7,
    critical: 0,
    high: 2,
    medium: 3,
    low: 2,
    info: 0,
    riskScore: 61,
    vulnerabilities: [],
  },
  {
    id: "scan-005",
    url: "https://www.nextstep-consulting.jp",
    company: "ネクストステップコンサルティング",
    status: "completed",
    startedAt: "2026-04-15T10:20:00",
    completedAt: "2026-04-15T10:22:55",
    totalVulnerabilities: 2,
    critical: 0,
    high: 0,
    medium: 1,
    low: 1,
    info: 0,
    riskScore: 18,
    vulnerabilities: [],
  },
  {
    id: "scan-006",
    url: "https://members.future-bridge.co.jp",
    company: "フューチャーブリッジ株式会社",
    status: "completed",
    startedAt: "2026-04-14T09:00:00",
    completedAt: "2026-04-14T09:03:30",
    totalVulnerabilities: 6,
    critical: 1,
    high: 1,
    medium: 2,
    low: 2,
    info: 0,
    riskScore: 74,
    vulnerabilities: [],
  },
  {
    id: "scan-007",
    url: "https://www.globalnet-japan.com",
    company: "グローバルネットジャパン株式会社",
    status: "failed",
    startedAt: "2026-04-13T15:30:00",
    completedAt: "2026-04-13T15:30:45",
    totalVulnerabilities: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
    riskScore: 0,
    vulnerabilities: [],
  },
];

export const MOCK_VULNERABILITIES_FOR_SCAN: Vulnerability[] = [
  {
    id: "new-v-001",
    name: "SQL Injection",
    nameJa: "SQLインジェクション",
    category: "インジェクション",
    riskLevel: "high",
    cvssScore: 8.6,
    description:
      "入力フォームにSQLインジェクション脆弱性が検出されました。攻撃者がデータベースに不正アクセスし、情報漏洩やデータ改ざんを行う可能性があります。",
    impact: "データベース内の全情報へのアクセス、認証情報の漏洩、データの改ざん・削除が行われる可能性があります。",
    recommendation:
      "プリペアドステートメントを使用し、入力値のバリデーションとサニタイゼーションを徹底してください。ORMの利用を推奨します。",
    affectedUrl: "/login",
    owasp: "A03:2021 - インジェクション",
    detectedAt: new Date().toISOString(),
  },
  {
    id: "new-v-002",
    name: "Cross-Site Scripting (XSS)",
    nameJa: "クロスサイトスクリプティング（XSS）",
    category: "XSS",
    riskLevel: "medium",
    cvssScore: 6.1,
    description:
      "検索フィールドおよびコメント入力欄に反射型XSS脆弱性が検出されました。悪意あるスクリプトがユーザーのブラウザで実行される可能性があります。",
    impact: "セッション情報の窃取、フィッシングサイトへのリダイレクト、ユーザーのブラウザでの任意のスクリプト実行が可能になります。",
    recommendation:
      "出力時のHTMLエスケープを徹底し、Content Security Policy (CSP) を設定してください。信頼できないデータをHTML、JS、CSSに挿入しないよう設計を見直してください。",
    affectedUrl: "/search",
    owasp: "A03:2021 - インジェクション",
    detectedAt: new Date().toISOString(),
  },
  {
    id: "new-v-003",
    name: "Broken Authentication",
    nameJa: "認証の不備",
    category: "認証・セッション管理",
    riskLevel: "high",
    cvssScore: 7.2,
    description:
      "パスワードリセット機能に脆弱性が検出されました。トークンの有効期限が設定されておらず、予測可能な値が使用されています。",
    impact: "アカウントの不正アクセス、パスワードリセット機能の悪用によるアカウント乗っ取りが可能になります。",
    recommendation:
      "暗号学的に安全な乱数でトークンを生成し、有効期限（15分以内）を設定してください。使用済みトークンは即座に無効化してください。",
    affectedUrl: "/forgot-password",
    owasp: "A07:2021 - 識別と認証の失敗",
    detectedAt: new Date().toISOString(),
  },
  {
    id: "new-v-004",
    name: "Missing Security Headers",
    nameJa: "セキュリティヘッダーの欠如",
    category: "セキュリティ設定",
    riskLevel: "medium",
    cvssScore: 5.0,
    description:
      "HTTPレスポンスに重要なセキュリティヘッダーが設定されていません。X-Frame-Options、X-XSS-Protection等が欠如しています。",
    impact: "クリックジャッキング攻撃やブラウザベースの攻撃に対する防御が不十分な状態です。",
    recommendation:
      "X-Frame-Options: DENY、X-Content-Type-Options: nosniff、Strict-Transport-Security、Referrer-Policyヘッダーを設定してください。",
    affectedUrl: "/",
    owasp: "A05:2021 - セキュリティの設定ミス",
    detectedAt: new Date().toISOString(),
  },
  {
    id: "new-v-005",
    name: "Outdated Dependencies",
    nameJa: "古いライブラリ・依存関係",
    category: "脆弱なコンポーネント",
    riskLevel: "low",
    cvssScore: 3.7,
    description:
      "既知の脆弱性を含む古いバージョンのライブラリが使用されています。jQuery v1.12.4およびBootstrap v3.3.7に脆弱性が確認されています。",
    impact: "既知の脆弱性を通じた攻撃を受けるリスクがあります。",
    recommendation:
      "依存ライブラリを定期的に更新し、既知の脆弱性がないことを確認してください。自動化された依存関係スキャンツール（npm audit、OWASP Dependency-Check等）を導入してください。",
    affectedUrl: "/",
    owasp: "A06:2021 - 脆弱で古くなったコンポーネント",
    detectedAt: new Date().toISOString(),
  },
  {
    id: "new-v-006",
    name: "Sensitive Data Exposure",
    nameJa: "機密データの露出",
    category: "暗号化の失敗",
    riskLevel: "low",
    cvssScore: 4.3,
    description:
      "エラーメッセージにスタックトレースやデータベース情報が含まれています。本番環境でのデバッグ情報の露出はセキュリティリスクとなります。",
    impact: "システムの内部構造、使用技術、エラーの詳細が攻撃者に明らかになり、より精巧な攻撃の足がかりになります。",
    recommendation:
      "本番環境ではデバッグモードを無効にし、エラーメッセージをユーザー向けの汎用メッセージに変更してください。詳細なエラーログはサーバー側で安全に記録してください。",
    affectedUrl: "/api/data",
    owasp: "A02:2021 - 暗号化の失敗",
    detectedAt: new Date().toISOString(),
  },
];

export const DASHBOARD_KPI = {
  totalScans: 47,
  totalVulnerabilities: 23,
  criticalRisk: 2,
  highRisk: 5,
  mediumRisk: 10,
  lowRisk: 6,
  resolvedThisMonth: 18,
  averageRiskScore: 54,
};

export const RISK_DISTRIBUTION = [
  { name: "Critical", value: 2, color: "#dc2626" },
  { name: "High", value: 5, color: "#ea580c" },
  { name: "Medium", value: 10, color: "#d97706" },
  { name: "Low", value: 6, color: "#16a34a" },
];

export const SCAN_TREND = [
  { month: "11月", scans: 28, vulnerabilities: 45 },
  { month: "12月", scans: 35, vulnerabilities: 52 },
  { month: "1月", scans: 31, vulnerabilities: 38 },
  { month: "2月", scans: 42, vulnerabilities: 61 },
  { month: "3月", scans: 38, vulnerabilities: 44 },
  { month: "4月", scans: 47, vulnerabilities: 23 },
];
