import { PLANS, type PlanId } from "./plans";

/**
 * Reverse-lookup: given a Stripe price ID, return the plan it belongs to,
 * by comparing against the env vars referenced by PLANS[*].stripePriceEnvKey.
 */
export function priceIdToPlan(priceId: string | null | undefined): PlanId | null {
  if (!priceId) return null;
  for (const planId of Object.keys(PLANS) as PlanId[]) {
    const cfg = PLANS[planId];
    if (!cfg.stripePriceEnvKey) continue;
    const envVal = process.env[cfg.stripePriceEnvKey];
    if (envVal && envVal === priceId) return planId;
  }
  return null;
}

/**
 * Client-side helper: POST to /api/stripe/checkout for the given plan and
 * return the Checkout URL to redirect to.
 */
export async function getCheckoutUrl(planId: PlanId): Promise<string> {
  const res = await fetch("/api/stripe/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ planId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || `Checkout failed (${res.status})`);
  }
  const data = (await res.json()) as { url?: string };
  if (!data.url) throw new Error("No checkout URL returned");
  return data.url;
}

export function appBaseUrl(): string {
  return process.env.APP_BASE_URL || "http://localhost:3000";
}
