// Requires ADMIN_PASSWORD secret, JOURNAL_DB binding, RESEND_API_KEY secret.
// Use this for: fee waived entirely, or paid by check/cash instead of Stripe.

import { buildReceipt, sendReceiptEmail, makeReceiptNumber } from "../../lib/receipt.js";

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

  const memberName = (body.memberName || "").toString().trim().slice(0, 100);
  const memberEmail = (body.memberEmail || "").toString().trim().slice(0, 200);
  const waived = body.waived === true;
  const amount = waived ? 0 : parseFloat(body.amount) || 0;
  const method = (body.method || "check").toString().trim().slice(0, 30);
  const pledgeText = (body.pledgeText || "").toString().trim().slice(0, 1000);
  const notes = (body.notes || "").toString().trim().slice(0, 500);

  if (!memberName || !memberEmail || !pledgeText) {
    return new Response(JSON.stringify({ error: "Missing name, email, or pledge text" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!waived && amount <= 0) {
    return new Response(JSON.stringify({ error: "Enter an amount, or check 'waived'" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const createdAt = new Date().toISOString();
  const status = waived ? "waived" : "active";

  await env.JOURNAL_DB.prepare(
    `INSERT INTO memberships (created_at, member_name, member_email, plan, fee_amount, pledge_text, agreed_at, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(createdAt, memberName, memberEmail, waived ? "waived" : "manual", amount, pledgeText, createdAt, status, notes).run();

  if (amount > 0) {
    const receiptNumber = makeReceiptNumber();
    await env.JOURNAL_DB.prepare(
      `INSERT INTO journal (created_at, category, donor_name, donor_email, amount, fair_market_value, deductible_amount, method, notes, receipt_number)
       VALUES (?, 'membership', ?, ?, ?, 0, ?, ?, ?, ?)`
    ).bind(createdAt, memberName, memberEmail, amount, amount, method, notes, receiptNumber).run();

    const { subject, text } = buildReceipt({
      receiptNumber,
      date: createdAt.slice(0, 10),
      donorName: memberName,
      amount,
      category: "membership",
      fairMarketValue: 0,
      deductibleAmount: amount,
      method,
    });
    try {
      await sendReceiptEmail(env, memberEmail, subject, text);
    } catch (err) {
      return new Response(JSON.stringify({ ok: true, waived: false, emailError: err.message }), {
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  return new Response(JSON.stringify({ ok: true, waived }), {
    headers: { "Content-Type": "application/json" },
  });
}
