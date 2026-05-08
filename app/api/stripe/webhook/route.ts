import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { priceIdToPlan } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[stripe/webhook] STRIPE_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret) as Stripe.Event;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "invalid signature";
    console.error("[stripe/webhook] signature verification failed:", msg);
    return NextResponse.json({ error: `Webhook Error: ${msg}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
        const customerId =
          typeof session.customer === "string"
            ? session.customer
            : session.customer?.id;
        if (subscriptionId && customerId) {
          const subscription = (await stripe.subscriptions.retrieve(
            subscriptionId
          )) as Stripe.Subscription;
          await applySubscription(customerId, subscription);
        }
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer.id;
        await applySubscription(customerId, subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer.id;
        await prisma.user.updateMany({
          where: { stripeCustomerId: customerId },
          data: {
            plan: "free",
            stripeSubscriptionId: null,
            stripePriceId: null,
            stripeCurrentPeriodEnd: null,
          },
        });
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        console.warn(
          "[stripe/webhook] invoice.payment_failed",
          invoice.id,
          invoice.customer
        );
        break;
      }

      default:
        // Ignore other events.
        break;
    }
  } catch (err) {
    console.error("[stripe/webhook] handler error:", err);
    // Still return 200 so Stripe doesn't infinitely retry on app bugs;
    // detailed error is logged for debugging.
  }

  return NextResponse.json({ received: true });
}

async function applySubscription(
  customerId: string,
  subscription: Stripe.Subscription
) {
  const item = subscription.items.data[0];
  const priceId = item?.price?.id ?? null;
  const plan = priceIdToPlan(priceId) ?? "free";
  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : null;

  await prisma.user.updateMany({
    where: { stripeCustomerId: customerId },
    data: {
      plan,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      stripeCurrentPeriodEnd: periodEnd,
    },
  });
}
