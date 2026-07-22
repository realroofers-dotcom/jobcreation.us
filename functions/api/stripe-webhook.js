// Requires: STRIPE_WEBHOOK_SECRET secret, JOURNAL_DB binding, RESEND_API_KEY secret.
// Replaces the earlier version of this file - now also handles membership
// subscriptions (both the first payment and every renewal after it).

import { buildReceipt, sendReceiptEmail, computeDeductible, makeReceiptNumber } from "../lib/receipt.js";

async function verifyStripeSignature(payload, sigHeader, secret) {
  const parts = Object.fromEntries(sigHeader.split(",").map((p) => p.split("=")));
  const signedPayload = `${parts.t}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const expected = [...new Uint8Array(sigBuffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return expected === parts.v1;
}

async function logAndEmail(env, { category, donorName, donorEmail, amount, fairMarketValue, method, notes, stripeSessionId }) {
  const deductibleAmount = computeDeductible(category, amount, fairMarketValue);
  const receiptNumber = makeReceiptNumber();
  const createdAt = new Date().toISOString();

  await env.JOURNAL_DB.prepare(
    `INSERT INTO journal (created_at, category, donor_name, donor_email, amount, fair_market_value, deductible_amount, method, notes, receipt_number, stripe_session_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(createdAt, category, donorName, donorEmail, amount, fairMarketValue, deductibleAmount, method, notes || "", receiptNumber, stripeSessionId || null).run();

  if (donorEmail) {
    const { subject, text } = buildReceipt({
      receiptNumber,
      date: createdAt.slice(0, 10),
      donorName,
      amount,
      category,
      fairMarketValue,
      deductibleAmount,
      method,
    });
    try {
      await sendReceiptEmail(env, donorEmail, subject, text);
    } catch (e) {
      // journal entry is already safe even if the email fails
    }
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const payload = await request.text();
  const sig = request.headers.get("stripe-signature");

  if (!sig || !env.STRIPE_WEBHOOK_SECRET) {
    return new Response("Missing signature", { status: 400 });
  }
  const valid = await verifyStripeSignature(payload, sig, env.STRIPE_WEBHOOK_SECRET);
  if (!valid) {
    return new Response("Invalid signature", { status: 400 });
  }

  const event = JSON.parse(payload);

  // One-time donation / event fee checkout
  if (event.type === "checkout.session.completed" && event.data.object.mode === "payment") {
    const session = event.data.object;
    const amount = session.amount_total / 100;
    const donorEmail = session.customer_details?.email || session.customer_email || "";
    const donorName = session.metadata?.donorName || session.customer_details?.name || "Anonymous";
    const category = session.metadata?.category || "donation";
    const fairMarketValue = parseFloat(session.metadata?.fairMarketValue) || 0;
    await logAndEmail(env, {
      category, donorName, donorEmail, amount, fairMarketValue,
      method: "Stripe (card)", stripeSessionId: session.id,
    });
  }

  // First payment of a new membership subscription
  if (event.type === "checkout.session.completed" && event.data.object.mode === "subscription"
      && event.data.object.metadata?.kind === "membership") {
    const session = event.data.object;
    const amount = session.amount_total / 100;
    const memberEmail = session.customer_details?.email || session.customer_email || "";
    const memberName = session.metadata?.memberName || "Anonymous";
    const plan = session.metadata?.plan || "monthly";
    const pledgeText = session.metadata?.pledgeText || "";
    const createdAt = new Date().toISOString();

    await env.JOURNAL_DB.prepare(
      `INSERT INTO memberships (created_at, member_name, member_email, plan, fee_amount, pledge_text, agreed_at, stripe_customer_id, stripe_subscription_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`
    ).bind(createdAt, memberName, memberEmail, plan, amount, pledgeText, createdAt, session.customer, session.subscription).run();

    await logAndEmail(env, {
      category: "membership", donorName: memberName, donorEmail: memberEmail, amount,
      fairMarketValue: 0, method: "Stripe (card)", stripeSessionId: session.id,
    });
  }

  // Every renewal payment on an existing subscription
  if (event.type === "invoice.paid" && event.data.object.subscription) {
    const invoice = event.data.object;
    // Skip the very first invoice - that one is already handled by checkout.session.completed above
    if (invoice.billing_reason !== "subscription_create") {
      const amount = invoice.amount_paid / 100;
      const subscriptionId = invoice.subscription;
      const member = await env.JOURNAL_DB.prepare(
        `SELECT member_name, member_email FROM memberships WHERE stripe_subscription_id = ? LIMIT 1`
      ).bind(subscriptionId).first();
      if (member) {
        await logAndEmail(env, {
          category: "membership", donorName: member.member_name, donorEmail: member.member_email,
          amount, fairMarketValue: 0, method: "Stripe (card, renewal)", notes: "Subscription renewal",
        });
      }
    }
  }

  // Cancellations
  if (event.type === "customer.subscription.deleted") {
    const subscriptionId = event.data.object.id;
    await env.JOURNAL_DB.prepare(
      `UPDATE memberships SET status = 'canceled' WHERE stripe_subscription_id = ?`
    ).bind(subscriptionId).run();
  }

  return new Response("ok", { status: 200 });
}
