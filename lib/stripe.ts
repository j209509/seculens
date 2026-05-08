import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Add it to your environment to use Stripe."
    );
  }
  _stripe = new Stripe(key, {
    // Pin per spec; cast because the installed stripe-node typings target a newer pinned version.
    apiVersion: "2024-12-18.acacia" as Stripe.LatestApiVersion,
    typescript: true,
    appInfo: {
      name: "Sequlia",
    },
  });
  return _stripe;
}

// Convenience proxy — accessing `stripe.x` triggers lazy init.
export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    const client = getStripe() as unknown as Record<string | symbol, unknown>;
    return client[prop as string];
  },
});
