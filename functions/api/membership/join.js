// Public endpoint - no password. Person agrees to the pledge and picks a plan,
// this starts a Stripe subscription checkout. The actual membership row gets
// created by the webhook once payment succeeds (see stripe-webhook.js), so we
// never end up with a "member" who never actually paid.
//
// Requires secret STRIPE_SECRET_KEY.

const PLAN_PRICES = {
  monthly: { amountCents: 1800, interval: "month" },
  annual: { amountCents: 19000, interval: "year" },
};

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.STRIPE_SECRET_KEY) {
    return new Response(JSON.stringify({ error: "Payments are not configured yet - contact us to join by check in the meantime." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Invalid request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const memberName = (body.memberName || "").toString().trim().slice(0, 100);
  const memberEmail = (body.memberEmail || "").toString().trim().slice(0, 200);
  const plan = PLAN_PRICES[body.plan] ? body.plan : null;
  const agreed = body.agreedPledge === true;
  const pledgeText = (body.pledgeText || "").toString().trim().slice(0, 1000);

  if (!memberName || !memberEmail || !plan) {
    return new Response(JSON.stringify({ error: "Missing name, email, or plan" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!agreed || !pledgeText) {
    return new Response(JSON.stringify({ error: "You must agree to the pledge to join" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { amountCents, interval } = PLAN_PRICES[plan];

  const params = new URLSearchParams();
  params.append("mode", "subscription");
  params.append("success_url", "https://jobcreation.us/thank-you.html");
  params.append("cancel_url", "https://jobcreation.us/join.html");
  params.append("customer_email", memberEmail);
  params.append("line_items[0][price_data][currency]", "usd");
  params.append("line_items[0][price_data][product_data][name]", "JobCreation.us membership");
  params.append("line_items[0][price_data][unit_amount]", String(amountCents));
  params.append("line_items[0][price_data][recurring][interval]", interval);
  params.append("line_items[0][quantity]", "1");
  params.append("metadata[kind]", "membership");
  params.append("metadata[plan]", plan);
  params.append("metadata[memberName]", memberName);
  params.append("metadata[pledgeText]", pledgeText);
  params.append("subscription_data[metadata][kind]", "membership");
  params.append("subscription_data[metadata][plan]", plan);
  params.append("subscription_data[metadata][memberName]", memberName);
  params.append("subscription_data[metadata][pledgeText]", pledgeText);

  const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const session = await stripeRes.json();
  if (!stripeRes.ok) {
    return new Response(JSON.stringify({ error: session.error?.message || "Stripe error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ url: session.url }), {
    headers: { "Content-Type": "application/json" },
  });
}
