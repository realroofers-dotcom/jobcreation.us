// Replaces the earlier functions/api/admin/events.js. Now requires an
// organizer phone number and a meeting point (address, optionally with
// lat/lng for a precise "Get Directions" pin) on every event.
// Requires ADMIN_PASSWORD secret and JOURNAL_DB binding.

export async function onRequestGet(context) {
  const { request, env } = context;
  const password = request.headers.get("x-admin-password") ||
    new URL(request.url).searchParams.get("password") || "";
  if (!env.ADMIN_PASSWORD || password !== env.ADMIN_PASSWORD) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const { results } = await env.JOURNAL_DB.prepare(
    `SELECT * FROM events ORDER BY event_date DESC`
  ).all();
  return new Response(JSON.stringify({ items: results }), {
    headers: { "Content-Type": "application/json" },
  });
}

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

  const type = ["hike", "gala", "training", "trip"].includes(body.type) ? body.type : "hike";
  const title = (body.title || "").toString().trim().slice(0, 150);
  const city = (body.city || "").toString().trim().slice(0, 100);
  const eventDate = (body.eventDate || "").toString().trim().slice(0, 30);
  const endDate = (body.endDate || "").toString().trim().slice(0, 30);
  const feeAmount = parseFloat(body.feeAmount) || 0;
  const fairMarketValue = parseFloat(body.fairMarketValue) || 0;
  const description = (body.description || "").toString().trim().slice(0, 1000);
  const organizerPhone = (body.organizerPhone || "").toString().trim().slice(0, 30);
  const meetingAddress = (body.meetingAddress || "").toString().trim().slice(0, 300);
  const meetingLat = body.meetingLat !== undefined && body.meetingLat !== "" ? parseFloat(body.meetingLat) : null;
  const meetingLng = body.meetingLng !== undefined && body.meetingLng !== "" ? parseFloat(body.meetingLng) : null;

  if (!title) {
    return new Response(JSON.stringify({ error: "Title is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!organizerPhone) {
    return new Response(JSON.stringify({ error: "Organizer phone number is required, so hikers can reach someone if they get lost" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!meetingAddress) {
    return new Response(JSON.stringify({ error: "A meeting point address is required for the directions button" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const createdAt = new Date().toISOString();

  await env.JOURNAL_DB.prepare(
    `INSERT INTO events (created_at, type, title, city, event_date, end_date, fee_amount, fair_market_value, description, active, organizer_phone, meeting_address, meeting_lat, meeting_lng)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`
  ).bind(createdAt, type, title, city, eventDate, endDate || null, feeAmount, fairMarketValue, description, organizerPhone, meetingAddress, meetingLat, meetingLng).run();

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
}
