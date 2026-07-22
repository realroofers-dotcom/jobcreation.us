// Requires a secret STRIPE_SECRET_KEY (Settings > Functions > Environment variables > add as secret).
// Called from the site's donate form: POST { amount, category, donorName, donorEmail, fairMarketValue }
// Returns { url } - redirect the browser there to complete payment on Stripe's hosted checkout page.

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.STRIPE_SECRET_KEY) {
    return new Response(JSON.stringify({ error: "Stripe is not configured yet" }), {
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

  const amountCents = Math.round(parseFloat(body.amount) * 100);
  const category = ["donation", "event_fee", "membership"].includes(body.category) ? body.category : "donation";
  const donorEmail = (body.donorEmail || "").toString().trim().slice(0, 200);
  const donorName = (body.donorName || "").toString().trim().slice(0, 100);
  const fairMarketValue = parseFloat(body.fairMarketValue) || 0;

  if (!amountCents || amountCents < 100) {
    return new Response(JSON.stringify({ error: "Minimum amount is $1" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const productName =
    category === "donation" ? "Donation to JobCreation.us" :
    category === "event_fee" ? "Event ticket - JobCreation.us" :
    "Membership - JobCreation.us";

  const params = new URLSearchParams();
  params.append("mode", "payment");
  params.append("success_url", "https://jobcreation.us/thank-you.html");
  params.append("cancel_url", "https://jobcreation.us/#involved");
  params.append("line_items[0][price_data][currency]", "usd");
  params.append("line_items[0][price_data][product_data][name]", productName);
  params.append("line_items[0][price_data][unit_amount]", String(amountCents));
  params.append("line_items[0][quantity]", "1");
  if (donorEmail) params.append("customer_email", donorEmail);
  params.append("metadata[category]", category);
  params.append("metadata[donorName]", donorName || "Anonymous");
  params.append("metadata[fairMarketValue]", String(fairMarketValue));

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
