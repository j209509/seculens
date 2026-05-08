import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { getStripePriceId, type PlanId } from "@/lib/plans";
import { appBaseUrl } from "@/lib/billing";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as { planId?: string };
    const planId = body.planId as PlanId | undefined;
    if (!planId || (planId !== "standard" && planId !== "pro")) {
      return NextResponse.json(
        { error: "Invalid planId. Expected 'standard' or 'pro'." },
        { status: 400 }
      );
    }

    const priceId = getStripePriceId(planId);
    if (!priceId) {
      return NextResponse.json(
        {
          error: `Stripe price ID not configured for plan '${planId}'. Set the env var (e.g. STRIPE_PRICE_${planId.toUpperCase()}).`,
        },
        { status: 500 }
      );
    }

    // Ensure Stripe customer exists.
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name ?? undefined,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      await prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const base = appBaseUrl();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base}/billing?success=1`,
      cancel_url: `${base}/billing?canceled=1`,
      metadata: { userId: user.id, planId },
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { userId: user.id, planId },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[stripe/checkout]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
