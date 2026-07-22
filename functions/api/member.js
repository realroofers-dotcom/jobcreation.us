// Public endpoint. GET /api/member?email=someone@example.com
// Returns their name and how many times they've swept, for showing the
// broom count on a profile or RSVP confirmation.

export async function onRequestGet(context) {
  const { request, env } = context;
  const email = new URL(request.url).searchParams.get("email");

  if (!email) {
    return new Response(JSON.stringify({ error: "Missing email" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const member = await env.JOURNAL_DB.prepare(
    `SELECT name, sweep_count FROM members WHERE email = ?`
  ).bind(email).first();

  if (!member) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({
    name: member.name,
    sweepCount: member.sweep_count,
    brooms: "\u{1F9F9}".repeat(Math.min(member.sweep_count, 10)),
  }), {
    headers: { "Content-Type": "application/json" },
  });
}
