// プラン定義
export type PlanId = "free" | "standard" | "pro" | "enterprise";

export type PlanConfig = {
  id: PlanId;
  name: string;
  price: number;          // 月額（円）
  currency: "JPY";
  features: string[];
  limits: {
    scansPerMonth: number;       // 月のスキャン回数 (-1 = unlimited)
    maxDomainsPerMonth: number;  // 月内のユニーク診断対象ドメイン数 (-1 = unlimited)
    checksEnabled: number;       // 有効化される診断項目数 (-1 = all)
    maxConcurrentScans: number;
    authenticatedScans: boolean; // ログイン後ページ診断
    apiAccess: boolean;
    prioritySupport: boolean;
    customDomains: boolean;
    maxCertTier: 0 | 2 | 3 | 4;  // 発行可能な証明書の最上位ティア (0 = 不可)
  };
  // Stripe Price ID (env var key — 実値は環境変数から)
  stripePriceEnvKey?: string;
};

export const PLANS: Record<PlanId, PlanConfig> = {
  free: {
    id: "free",
    name: "Free",
    price: 0,
    currency: "JPY",
    features: [
      "1ドメインまで対象",
      "月10回までスキャン",
      "全174項目の診断",
      "結果はWeb上で閲覧",
      "コミュニティサポート",
    ],
    limits: {
      scansPerMonth: 10,
      maxDomainsPerMonth: 1,
      checksEnabled: -1,
      maxConcurrentScans: 1,
      authenticatedScans: false,
      apiAccess: false,
      prioritySupport: false,
      customDomains: false,
      maxCertTier: 0,
    },
  },
  standard: {
    id: "standard",
    name: "Standard",
    price: 4980,
    currency: "JPY",
    features: [
      "3ドメインまで対象",
      "月30回までスキャン",
      "全174項目の診断",
      "公式証明書 ★2 ★3 発行可能",
      "PDFレポート出力",
      "Slack/Discord通知",
      "メールサポート",
    ],
    limits: {
      scansPerMonth: 30,
      maxDomainsPerMonth: 3,
      checksEnabled: -1,
      maxConcurrentScans: 2,
      authenticatedScans: false,
      apiAccess: false,
      prioritySupport: false,
      customDomains: false,
      maxCertTier: 3,
    },
    stripePriceEnvKey: "STRIPE_PRICE_STANDARD",
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: 19800,
    currency: "JPY",
    features: [
      "10ドメインまで対象",
      "月100回までスキャン",
      "全174項目の診断",
      "公式証明書 ★2 ★3 ★4 発行可能",
      "ログイン認証後ページ診断",
      "API連携",
      "優先サポート",
      "経産省SCS★3対応レポート",
    ],
    limits: {
      scansPerMonth: 100,
      maxDomainsPerMonth: 10,
      checksEnabled: -1,
      maxConcurrentScans: 5,
      authenticatedScans: true,
      apiAccess: true,
      prioritySupport: true,
      customDomains: false,
      maxCertTier: 4,
    },
    stripePriceEnvKey: "STRIPE_PRICE_PRO",
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    price: 0, // 要問い合わせ
    currency: "JPY",
    features: [
      "無制限ドメイン・無制限スキャン",
      "全証明書発行可能（カスタム含む）",
      "オンプレ対応",
      "SAML SSO",
      "専任CS",
      "SLA保証",
      "カスタム診断項目",
    ],
    limits: {
      scansPerMonth: -1,
      maxDomainsPerMonth: -1,
      checksEnabled: -1,
      maxConcurrentScans: -1,
      authenticatedScans: true,
      apiAccess: true,
      prioritySupport: true,
      customDomains: true,
      maxCertTier: 4,
    },
  },
};

export function getPlan(planId: string): PlanConfig {
  return PLANS[planId as PlanId] ?? PLANS.free;
}

export function getStripePriceId(planId: PlanId): string | undefined {
  const cfg = PLANS[planId];
  if (!cfg.stripePriceEnvKey) return undefined;
  return process.env[cfg.stripePriceEnvKey];
}
