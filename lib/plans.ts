// プラン定義
export type PlanId = "free" | "standard" | "pro" | "enterprise";

export type PlanConfig = {
  id: PlanId;
  name: string;
  price: number;          // 月額（円）
  currency: "JPY";
  features: string[];
  limits: {
    scansPerMonth: number;     // 月のスキャン回数 (-1 = unlimited)
    checksEnabled: number;     // 有効化される診断項目数 (-1 = all)
    maxConcurrentScans: number;
    authenticatedScans: boolean; // ログイン後ページ診断
    apiAccess: boolean;
    prioritySupport: boolean;
    customDomains: boolean;
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
      "月3回までスキャン",
      "10項目の基本診断",
      "結果はWeb上で閲覧",
      "コミュニティサポート",
    ],
    limits: {
      scansPerMonth: 3,
      checksEnabled: 10,
      maxConcurrentScans: 1,
      authenticatedScans: false,
      apiAccess: false,
      prioritySupport: false,
      customDomains: false,
    },
  },
  standard: {
    id: "standard",
    name: "Standard",
    price: 4980,
    currency: "JPY",
    features: [
      "月30回までスキャン",
      "全110+項目の診断",
      "PDFレポート出力",
      "Slack/Discord通知",
      "メールサポート",
    ],
    limits: {
      scansPerMonth: 30,
      checksEnabled: -1,
      maxConcurrentScans: 2,
      authenticatedScans: false,
      apiAccess: false,
      prioritySupport: false,
      customDomains: false,
    },
    stripePriceEnvKey: "STRIPE_PRICE_STANDARD",
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: 19800,
    currency: "JPY",
    features: [
      "月200回までスキャン",
      "全110+項目の診断",
      "ログイン認証後ページ診断",
      "API連携",
      "優先サポート",
      "経産省SCS★3対応レポート",
    ],
    limits: {
      scansPerMonth: 200,
      checksEnabled: -1,
      maxConcurrentScans: 5,
      authenticatedScans: true,
      apiAccess: true,
      prioritySupport: true,
      customDomains: false,
    },
    stripePriceEnvKey: "STRIPE_PRICE_PRO",
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    price: 0, // 要問い合わせ
    currency: "JPY",
    features: [
      "無制限スキャン",
      "オンプレ対応",
      "SAML SSO",
      "専任CS",
      "SLA保証",
      "カスタム診断",
    ],
    limits: {
      scansPerMonth: -1,
      checksEnabled: -1,
      maxConcurrentScans: -1,
      authenticatedScans: true,
      apiAccess: true,
      prioritySupport: true,
      customDomains: true,
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
