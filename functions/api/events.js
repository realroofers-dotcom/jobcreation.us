export async function onRequestGet(context) {
  const { env } = context;
  const { results } = await env.JOURNAL_DB.prepare(
    `SELECT id, type, title, city, event_date, end_date, fee_amount, fair_market_value, description,
            organizer_phone, meeting_address, meeting_lat, meeting_lng
     FROM events WHERE active = 1 ORDER BY event_date ASC`
  ).all();

  return new Response(JSON.stringify({ items: results }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
