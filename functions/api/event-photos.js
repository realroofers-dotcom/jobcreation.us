// GET /api/event-photos?eventId=12
// Returns everyone who RSVP'd to this event with a photo on file - the
// attendee gallery. Every RSVP has a photo, since it's required, so this
// list doubles as the attendance roster.

export async function onRequestGet(context) {
  const { request, env } = context;
  const eventId = parseInt(new URL(request.url).searchParams.get("eventId"), 10);

  if (!eventId) {
    return new Response(JSON.stringify({ error: "Missing eventId" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { results } = await env.JOURNAL_DB.prepare(
    `SELECT member_name, is_sweep, photo_key FROM event_rsvps
     WHERE event_id = ? AND photo_key IS NOT NULL ORDER BY created_at ASC`
  ).bind(eventId).all();

  const items = results.map((r) => ({
    name: r.member_name,
    isSweep: !!r.is_sweep,
    photoUrl: `/api/photo?key=${encodeURIComponent(r.photo_key)}`,
  }));

  return new Response(JSON.stringify({ items }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
