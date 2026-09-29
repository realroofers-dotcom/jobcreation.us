// BUILT 2026-09-29 · jobcreation cars-api-1a · Cars for Homes sign-ups.
// POST  (public)  saves a donor pledge or an application to D1 table car_signups (schema-7-cars.sql).
// GET   (admin)   lists sign-ups: header x-admin-password must equal the ADMIN_PASSWORD secret. ?kind=donor|applicant
// PATCH (admin)   { id, status, notes } updates a row's status (new | contacted | matched | given | declined).
// Requires the D1 database "jobcreation" bound as JOURNAL_DB.

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

const clip = (v, n) => (v == null ? "" : String(v)).trim().slice(0, n);
const STATUSES = ["new", "contacted", "matched", "given", "declined"];
// Never keep ID or bank numbers, even if someone types them in: 9+ digit runs are masked.
const scrub = (s) => s.replace(/\d[\d -]{7,}\d/g, "[number removed]");

function isAdmin(request, env) {
  const pw = request.headers.get("x-admin-password") || "";
  return !!env.ADMIN_PASSWORD && pw === env.ADMIN_PASSWORD;
}

export async function onRequestPost({ request, env }) {
  if (!env.JOURNAL_DB) return json({ error: "Database not connected" }, 503);
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: "Invalid request" }, 400); }
  if (b.website) return json({ ok: true }); // honeypot: bots fill the hidden field

  const kind = b.kind === "donor" ? "donor" : b.kind === "applicant" ? "applicant" : "";
  const name = clip(b.Name, 100), contact = clip(b.Contact, 120), location = clip(b.Location, 100);
  if (!kind || !name || !contact || !location) return json({ error: "Please fill in your name, contact and city." }, 400);

  const ip = request.headers.get("CF-Connecting-IP") || "";
  const country = (request.cf && request.cf.country) || "";
  const hourAgo = new Date(Date.now() - 3600e3).toISOString();
  const recent = await env.JOURNAL_DB.prepare("SELECT COUNT(*) AS n FROM car_signups WHERE ip = ? AND created_at > ?")
    .bind(ip, hourAgo).first();
  if (recent && recent.n >= 5) return json({ error: "Too many sign-ups from this connection. Please call 732-995-3914." }, 429);

  await env.JOURNAL_DB.prepare(
    `INSERT INTO car_signups (created_at, kind, name, contact, location, car, mileage, runs, title, license, dui, insurance, situation, ip, country)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    new Date().toISOString(), kind, name, contact, location,
    kind === "donor" ? clip(b.Car, 100) : null,
    kind === "donor" ? clip(b.Mileage, 30) : null,
    kind === "donor" ? clip(b.Runs, 20) : null,
    kind === "donor" ? clip(b.Title, 40) : null,
    kind === "applicant" ? clip(b.License, 10) : null,
    kind === "applicant" ? clip(b.DUI, 10) : null,
    kind === "applicant" ? clip(b.Insurance, 20) : null,
    kind === "applicant" ? scrub(clip(b.Situation, 1500)) : null,
    ip, country
  ).run();

  return json({ ok: true });
}

export async function onRequestGet({ request, env }) {
  if (!isAdmin(request, env)) return json({ error: "Unauthorized" }, 401);
  if (!env.JOURNAL_DB) return json({ error: "Database not connected" }, 503);
  const kind = new URL(request.url).searchParams.get("kind");
  const q = kind === "donor" || kind === "applicant"
    ? env.JOURNAL_DB.prepare("SELECT * FROM car_signups WHERE kind = ? ORDER BY created_at DESC LIMIT 500").bind(kind)
    : env.JOURNAL_DB.prepare("SELECT * FROM car_signups ORDER BY created_at DESC LIMIT 500");
  const { results } = await q.all();
  return json({ items: results || [] });
}

export async function onRequestPatch({ request, env }) {
  if (!isAdmin(request, env)) return json({ error: "Unauthorized" }, 401);
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: "Invalid request" }, 400); }
  const id = parseInt(b.id, 10);
  if (!id || !STATUSES.includes(b.status)) return json({ error: "Need id and a valid status" }, 400);
  await env.JOURNAL_DB.prepare("UPDATE car_signups SET status = ?, notes = ? WHERE id = ?")
    .bind(b.status, clip(b.notes, 1000), id).run();
  return json({ ok: true });
}
