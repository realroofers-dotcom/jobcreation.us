// BUILT 2026-09-29 · jobcreation events-api-1b · Public list of active Foundation events, from D1 (JOURNAL_DB).
// Shared by jobcreation.us, the Hikers Ball site and gigapoo (TrailShrinks), so other origins may read it (CORS).
// ?type=hike|gala|training|trip|art  limits the list to one type. ?upcoming=1 drops events that have ended.

const ALLOWED = /^https:\/\/(www\.)?(jobcreation\.us|thehikersball\.com|hikersball\.com|gigapoo\.com|trailshrinks\.com)$/i;

function cors(request) {
  const origin = request.headers.get("Origin") || "";
  return ALLOWED.test(origin)
    ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin", "Access-Control-Allow-Methods": "GET, OPTIONS" }
    : {};
}

export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: cors(request) });
}

export async function onRequestGet({ request, env }) {
  const headers = { "Content-Type": "application/json", "Cache-Control": "public, max-age=60", ...cors(request) };
  if (!env.JOURNAL_DB) return new Response(JSON.stringify({ items: [], error: "Database not connected" }), { headers });

  const q = new URL(request.url).searchParams;
  const type = (q.get("type") || "").toLowerCase().replace(/[^a-z_]/g, "");
  const today = new Date().toISOString().slice(0, 10);
  let sql = `SELECT id, type, title, city, event_date, end_date, fee_amount, fair_market_value, description,
                    organizer_phone, meeting_address, meeting_lat, meeting_lng
             FROM events WHERE active = 1`;
  const binds = [];
  if (type) { sql += " AND type = ?"; binds.push(type); }
  if (q.get("upcoming")) { sql += " AND COALESCE(end_date, event_date, '9999') >= ?"; binds.push(today); }
  sql += " ORDER BY event_date ASC LIMIT 200";

  const { results } = await env.JOURNAL_DB.prepare(sql).bind(...binds).all();
  return new Response(JSON.stringify({ items: results || [] }), { headers });
}
