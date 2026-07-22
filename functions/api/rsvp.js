// Replaces the earlier functions/api/rsvp.js.
// Photo is now required: no photo, no RSVP - enforced server-side, not just
// in the form. Requires an R2 bucket bound as PHOTOS_BUCKET (Settings >
// Functions > R2 bucket bindings), in addition to JOURNAL_DB and
// (optionally) STRIPE_SECRET_KEY as before.

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Invalid request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const eventId = parseInt(body.eventId, 10);
  const name = (body.name || "").toString().trim().slice(0, 100);
  const email = (body.email || "").toString().trim().slice(0, 200);
  const isSweep = body.isSweep === true;
  const photoDataUrl = (body.photo || "").toString();

  if (!eventId || !name || !email) {
    return new Response(JSON.stringify({ error: "Missing event, name, or email" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!photoDataUrl.startsWith("data:image/")) {
    return new Response(JSON.stringify({ error: "A photo is required to RSVP - no photo, no attendance." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!env.PHOTOS_BUCKET) {
    return new Response(JSON.stringify({ error: "Photo storage is not configured yet." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const event = await env.JOURNAL_DB.prepare(
    `SELECT id, title, fee_amount FROM events WHERE id = ? AND active = 1`
  ).bind(eventId).first();

  if (!event) {
    return new Response(JSON.stringify({ error: "Event not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Decode and upload the photo to R2 before anything else - if this fails,
  // the RSVP itself should fail, since a photo is mandatory.
  let photoKey;
  try {
    const [, meta, base64Data] = photoDataUrl.match(/^data:(image\/\w+);base64,(.+)$/) || [];
    if (!base64Data) throw new Error("Malformed photo data");
    const contentType = meta || "image/jpeg";
    const ext = contentType.split("/")[1] || "jpg";
    const binary = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    photoKey = `rsvp-photos/${eventId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    await env.PHOTOS_BUCKET.put(photoKey, binary, { httpMetadata: { contentType } });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Couldn't process that photo - try a different one." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const baseFee = event.fee_amount || 0;
  const feeCharged = isSweep ? Math.round(baseFee * 0.85 * 100) / 100 : baseFee;
  const createdAt = new Date().toISOString();

  const existing = await env.JOURNAL_DB.prepare(
    `SELECT email, sweep_count FROM members WHERE email = ?`
  ).bind(email).first();

  if (existing) {
    await env.JOURNAL_DB.prepare(
      `UPDATE members SET name = ?, sweep_count = sweep_count + ?, updated_at = ? WHERE email = ?`
    ).bind(name, isSweep ? 1 : 0, createdAt, email).run();
  } else {
    await env.JOURNAL_DB.prepare(
      `INSERT INTO members (email, name, sweep_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
    ).bind(email, name, isSweep ? 1 : 0, createdAt, createdAt).run();
  }

  if (feeCharged <= 0) {
    await env.JOURNAL_DB.prepare(
      `INSERT INTO event_rsvps (created_at, event_id, member_name, member_email, is_sweep, fee_charged, photo_key)
       VALUES (?, ?, ?, ?, ?, 0, ?)`
    ).bind(createdAt, eventId, name, email, isSweep ? 1 : 0, photoKey).run();

    return new Response(JSON.stringify({ ok: true, feeCharged: 0, isSweep }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!env.STRIPE_SECRET_KEY) {
    return new Response(JSON.stringify({ error: "Payments are not configured yet - contact the organizer directly." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const params = new URLSearchParams();
  params.append("mode", "payment");
  params.append("success_url", "https://jobcreation.us/thank-you.html");
  params.append("cancel_url", "https://jobcreation.us/");
  params.append("customer_email", email);
  params.append("line_items[0][price_data][currency]", "usd");
  params.append("line_items[0][price_data][product_data][name]", `${event.title}${isSweep ? " (sweep discount applied)" : ""}`);
  params.append("line_items[0][price_data][unit_amount]", String(Math.round(feeCharged * 100)));
  params.append("line_items[0][quantity]", "1");
  params.append("metadata[kind]", "event_rsvp");
  params.append("metadata[eventId]", String(eventId));
  params.append("metadata[name]", name);
  params.append("metadata[isSweep]", isSweep ? "true" : "false");

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

  await env.JOURNAL_DB.prepare(
    `INSERT INTO event_rsvps (created_at, event_id, member_name, member_email, is_sweep, fee_charged, stripe_session_id, photo_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(createdAt, eventId, name, email, isSweep ? 1 : 0, feeCharged, session.id, photoKey).run();

  return new Response(JSON.stringify({ url: session.url, feeCharged, isSweep }), {
    headers: { "Content-Type": "application/json" },
  });
}
