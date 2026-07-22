// Replaces the earlier version of this file. Adds "service_revenue" as a
// valid category (roofing repair jobs / paid inspections), which always
// logs as $0 deductible and uses the ordinary-receipt template.
//
// Requires a D1 database bound as JOURNAL_DB, secret ADMIN_PASSWORD, secret RESEND_API_KEY.

import { buildReceipt, sendReceiptEmail, computeDeductible, makeReceiptNumber } from "../../lib/receipt.js";

const VALID_CATEGORIES = ["donation", "event_fee", "membership", "service_revenue"];

export async function onRequestPost(context) {
  const { request, env } = context;

  const password = request.headers.get("x-admin-password") || "";
  if (!env.ADMIN_PASSWORD || password !== env.ADMIN_PASSWORD) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
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

  const donorName = (body.donorName || "").toString().trim().slice(0, 100);
  const donorEmail = (body.donorEmail || "").toString().trim().slice(0, 200);
  const amount = parseFloat(body.amount);
  const category = VALID_CATEGORIES.includes(body.category) ? body.category : "donation";
  const fairMarketValue = parseFloat(body.fairMarketValue) || 0;
  const method = (body.method || "check").toString().trim().slice(0, 30);
  const notes = (body.notes || "").toString().trim().slice(0, 500);
  const serviceDescription = (body.serviceDescription || "").toString().trim().slice(0, 300);

  if (!donorName || !donorEmail || !amount || amount <= 0) {
    return new Response(JSON.stringify({ error: "Missing donor name, email, or a valid amount" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const deductibleAmount = computeDeductible(category, amount, fairMarketValue);
  const receiptNumber = makeReceiptNumber();
  const createdAt = new Date().toISOString();
  const combinedNotes = category === "service_revenue" && serviceDescription
    ? `${serviceDescription}${notes ? " — " + notes : ""}`
    : notes;

  await env.JOURNAL_DB.prepare(
    `INSERT INTO journal (created_at, category, donor_name, donor_email, amount, fair_market_value, deductible_amount, method, notes, receipt_number)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(createdAt, category, donorName, donorEmail, amount, fairMarketValue, deductibleAmount, method, combinedNotes, receiptNumber).run();

  const { subject, text } = buildReceipt({
    receiptNumber,
    date: createdAt.slice(0, 10),
    donorName,
    amount,
    category,
    fairMarketValue,
    deductibleAmount,
    method,
    serviceDescription,
  });

  try {
    await sendReceiptEmail(env, donorEmail, subject, text);
  } catch (err) {
    return new Response(JSON.stringify({ ok: true, receiptNumber, emailError: err.message }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, receiptNumber }), {
    headers: { "Content-Type": "application/json" },
  });
}
