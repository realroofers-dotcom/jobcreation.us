// BUILT 2026-09-30 · jobcreation cars-api-2c · Cars for Homeless (carsforhomeless.com). 2c: automatic screening + draft donor story + email to Mark; 2b: donor car photo + estimated value.
import { sendReceiptEmail } from "../lib/receipt.js";
// The donor decides who receives the car: applicants apply, the system screens them (status "screened" or "review"),
// Mark checks them off (status "approved"),
// and approved applicants who agreed to share their story are shown to donors (first name, state, story only).
//
// POST  (public)            kind=applicant: full application (schema-8). kind=donor: car pledge + chosen applicant.
// GET   ?public=approved    (public)  approved applicants for donors to choose from; no private fields.
// GET   (admin)             all sign-ups; header x-admin-password = ADMIN_PASSWORD. ?kind=donor|applicant
// PATCH (admin)             { id, status, notes, public_blurb }
// Requires the D1 database "jobcreation" bound as JOURNAL_DB, and the R2 bucket "carsforhomeless-photos" bound as
// CARS_BUCKET for donor car photos (without CARS_BUCKET, photos fall back to the car_photos table in D1).

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

const clip = (v, n) => (v == null ? "" : String(v)).trim().slice(0, n);
const STATUSES = ["new", "screened", "review", "contacted", "approved", "matched", "given", "declined"];
const REASONS = ["Job loss", "Eviction or rent increase", "Medical bills or illness", "Family breakup or domestic violence",
  "Fire, flood or disaster", "Car or housing repossessed", "Other"];
// Never keep ID or bank numbers, even if someone types them in: 9+ digit runs are masked.
const scrub = (s) => s.replace(/\d[\d -]{7,}\d/g, "[number removed]");
const yes = (v) => v === true || v === "on" || v === "yes" || v === "Yes" || v === "true";

function isAdmin(request, env) {
  const pw = request.headers.get("x-admin-password") || "";
  return !!env.ADMIN_PASSWORD && pw === env.ADMIN_PASSWORD;
}

function age(dob) {
  const d = new Date(dob + "T12:00:00Z");
  if (isNaN(d)) return -1;
  const now = new Date();
  let a = now.getUTCFullYear() - d.getUTCFullYear();
  if (now < new Date(Date.UTC(now.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))) a--;
  return a;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.JOURNAL_DB) return json({ error: "Database not connected" }, 503);
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: "Invalid request" }, 400); }
  if (b.website) return json({ ok: true }); // honeypot: bots fill the hidden field

  const kind = b.kind === "donor" ? "donor" : b.kind === "applicant" ? "applicant" : "";
  const name = clip(b.Name, 100), location = clip(b.Location, 100);
  const email = clip(b.Email, 120), phone = clip(b.Phone, 40);
  const contact = clip(b.Contact, 120) || [phone, email].filter(Boolean).join(" · ");
  if (!kind || !name || !contact || !location) return json({ error: "Please fill in your name, phone or email, and city and state." }, 400);

  const ip = request.headers.get("CF-Connecting-IP") || "";
  const country = (request.cf && request.cf.country) || "";
  const now = new Date().toISOString();
  const recent = await env.JOURNAL_DB.prepare("SELECT COUNT(*) AS n FROM car_signups WHERE ip = ? AND created_at > ?")
    .bind(ip, new Date(Date.now() - 3600e3).toISOString()).first();
  if (recent && recent.n >= 5) return json({ error: "Too many sign-ups from this connection. Please call 732-995-3914." }, 429);

  if (kind === "applicant") {
    const dob = clip(b.DOB, 10);
    const years = age(dob);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || years < 0 || years > 110) return json({ error: "Please enter your date of birth." }, 400);
    if (years < 18) return json({ error: "Applicants must be 18 or older." }, 400);
    const need = ["Birth state", "License state", "Reason", "Situation", "Plan", "Need", "Insurance plan"];
    for (const k of need) if (!clip(b[k], 5)) return json({ error: "Please answer every question on the application." }, 400);
    if (b.License !== "Yes") return json({ error: "A valid driver's license is required to receive a car." }, 400);
    if (b.DUI !== "No") return json({ error: "Applicants must have no DUI on their driving record." }, 400);
    const consents = {
      background_check: yes(b.ConsentBackground), drug_test: yes(b.ConsentDrug),
      keep_insured_and_licensed: yes(b.CommitInsured), share_story_with_donors: yes(b.ConsentShare),
      truthful: yes(b.Truthful), agreed_at: now,
    };
    if (!consents.background_check || !consents.drug_test || !consents.keep_insured_and_licensed || !consents.truthful)
      return json({ error: "You must agree to the background check, the drug test, keeping the car insured with a valid license, and that your answers are true." }, 400);

    const situation = scrub(clip(b.Situation, 2000)), plan = scrub(clip(b.Plan, 2000)), needCar = scrub(clip(b.Need, 1500));

    // Automatic screening. The hard rules (18+, license, no DUI, required agreements) are enforced above.
    // Anything below only flags the application for a closer look; Mark gives the final check-off either way.
    const flags = [];
    if (clip(b.Insurance, 20) !== "Yes") flags.push("Cannot pay for insurance yet");
    if (situation.length < 40 || plan.length < 40 || needCar.length < 25) flags.push("Very short answers");
    if (!consents.share_story_with_donors) flags.push("Did not agree to show story to donors (donors cannot choose them)");
    if (country && country !== "US") flags.push("Applied from outside the U.S. (" + country + ")");
    if (years > 85) flags.push("Age over 85: confirm license");
    const dup = await env.JOURNAL_DB.prepare(
      "SELECT id FROM car_signups WHERE kind = 'applicant' AND ((lower(name) = lower(?) AND dob = ?) OR (? <> '' AND lower(email) = lower(?))) LIMIT 1"
    ).bind(name, dob, email, email).first();
    if (dup) flags.push("Possible duplicate of application #" + dup.id);
    const status = flags.length ? "review" : "screened";
    const screen = { result: flags.length ? "needs a closer look" : "passed", flags, screened_at: now };

    // Draft of the story donors will see (first name and state are added on display). Mark can edit it in admin.
    const firstSentences = (t, n) => (t.match(/[^.!?]+[.!?]*/g) || [t]).slice(0, n).join(" ").trim();
    const blurb = scrub([firstSentences(needCar, 2), firstSentences(plan, 2)].filter(Boolean).join(" ")).slice(0, 500);

    const ins = await env.JOURNAL_DB.prepare(
      `INSERT INTO car_signups (created_at, kind, name, contact, email, location, dob, birth_state, license, license_state, dui,
         insurance, insurance_plan, reason_category, situation, plan_forward, need_car, consents, status, screen, public_blurb, ip, country)
       VALUES (?, 'applicant', ?, ?, ?, ?, ?, ?, 'Yes', ?, 'No', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      now, name, contact, email || null, location, dob, clip(b["Birth state"], 60), clip(b["License state"], 40),
      clip(b.Insurance, 20), scrub(clip(b["Insurance plan"], 500)),
      REASONS.includes(b.Reason) ? b.Reason : "Other",
      situation, plan, needCar, JSON.stringify(consents), status, JSON.stringify(screen), blurb, ip, country
    ).run();

    // Tell Mark there is someone waiting for his check-off (needs RESEND_API_KEY; skipped quietly if not set).
    if (env.RESEND_API_KEY) {
      const id = ins.meta && ins.meta.last_row_id;
      context.waitUntil(sendReceiptEmail(env, env.CARS_NOTIFY_EMAIL || "realroofers@gmail.com",
        `Cars for Homeless: application #${id} ${flags.length ? "needs a closer look" : "passed screening"}`,
        `${name}, ${location}\nReason: ${b.Reason}\nScreening: ${screen.result}${flags.length ? "\n- " + flags.join("\n- ") : ""}\n\n` +
        `Check off at https://jobcreation.us/admin.html (Cars for Homeless → Ready for your check-off).`).catch(() => {}));
    }
    return json({ ok: true });
  }

  // Donor pledge. The donor may choose an approved applicant; otherwise the Foundation suggests matches.
  let chosen = parseInt(b.Chosen, 10) || null;
  if (chosen) {
    const row = await env.JOURNAL_DB.prepare("SELECT id FROM car_signups WHERE id = ? AND kind = 'applicant' AND status = 'approved'")
      .bind(chosen).first();
    if (!row) chosen = null;
  }
  const est = Math.max(0, Math.min(500000, parseFloat(String(b.EstValue || "").replace(/[^0-9.]/g, "")) || 0)) || null;
  const ins = await env.JOURNAL_DB.prepare(
    `INSERT INTO car_signups (created_at, kind, name, contact, email, location, car, mileage, runs, title, chosen_applicant_id, est_value, notes, ip, country)
     VALUES (?, 'donor', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(now, name, contact, email || null, location, clip(b.Car, 100), clip(b.Mileage, 30), clip(b.Runs, 20), clip(b.Title, 40),
    chosen, est, clip(b.Note, 500) || null, ip, country).run();

  // Car photo: a JPEG data URL, already shrunk in the browser (site.js). Kept only if small and really an image.
  const photo = typeof b.Photo === "string" ? b.Photo : "";
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(photo);
  if (m && m[2].length <= 900000 && ins.meta && ins.meta.last_row_id) {
    const id = ins.meta.last_row_id;
    let stored = m[2];
    if (env.CARS_BUCKET) {
      // Preferred: the image bytes live in R2 (bucket "carsforhomeless-photos"); the database keeps only the key.
      const key = `cars/${id}-${Date.now()}.${m[1].split("/")[1].replace("jpeg", "jpg")}`;
      const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
      await env.CARS_BUCKET.put(key, bytes, { httpMetadata: { contentType: m[1] } });
      stored = "r2:" + key;
    }
    await env.JOURNAL_DB.prepare("INSERT INTO car_photos (signup_id, created_at, mime, data) VALUES (?, ?, ?, ?)")
      .bind(id, now, m[1], stored).run();
  }
  return json({ ok: true, chosen });
}

export async function onRequestGet({ request, env }) {
  if (!env.JOURNAL_DB) return json({ items: [], error: "Database not connected" }, 503);
  const q = new URL(request.url).searchParams;

  if (q.get("public") === "approved") {
    const { results } = await env.JOURNAL_DB.prepare(
      `SELECT id, name, location, reason_category, public_blurb, plan_forward, need_car, created_at
       FROM car_signups
       WHERE kind = 'applicant' AND status = 'approved' AND json_extract(consents, '$.share_story_with_donors') = 1
       ORDER BY created_at ASC LIMIT 200`
    ).all();
    const items = (results || []).map((r) => ({
      id: r.id,
      firstName: String(r.name).split(/\s+/)[0],
      state: String(r.location).split(",").pop().trim(),
      reason: r.reason_category,
      story: r.public_blurb || [r.need_car, r.plan_forward].filter(Boolean).join(" ").slice(0, 600),
      waitingSince: String(r.created_at).slice(0, 10),
    }));
    return new Response(JSON.stringify({ items }), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60" } });
  }

  if (!isAdmin(request, env) && !(q.get("photo") && q.get("pw") && q.get("pw") === env.ADMIN_PASSWORD))
    return json({ error: "Unauthorized" }, 401);

  // Staff view of a donor's car photo: /api/cars?photo=<signup id>&pw=<admin password> (used by admin.html)
  if (q.get("photo")) {
    const p = await env.JOURNAL_DB.prepare("SELECT mime, data FROM car_photos WHERE signup_id = ? ORDER BY id DESC LIMIT 1")
      .bind(parseInt(q.get("photo"), 10) || 0).first();
    if (!p) return new Response("No photo", { status: 404 });
    if (p.data.startsWith("r2:")) {
      const obj = env.CARS_BUCKET && (await env.CARS_BUCKET.get(p.data.slice(3)));
      if (!obj) return new Response("No photo", { status: 404 });
      return new Response(obj.body, { headers: { "Content-Type": p.mime, "Cache-Control": "private, max-age=300" } });
    }
    const bytes = Uint8Array.from(atob(p.data), (c) => c.charCodeAt(0));
    return new Response(bytes, { headers: { "Content-Type": p.mime, "Cache-Control": "private, max-age=300" } });
  }

  const kind = q.get("kind");
  if (q.get("queue")) {
    // Mark's check-off list: applications the system has screened, oldest first.
    const { results } = await env.JOURNAL_DB.prepare(
      "SELECT * FROM car_signups WHERE kind = 'applicant' AND status IN ('screened', 'review') ORDER BY status = 'review', created_at ASC LIMIT 200"
    ).all();
    return json({ items: results || [] });
  }
  const stmt = kind === "donor" || kind === "applicant"
    ? env.JOURNAL_DB.prepare("SELECT * FROM car_signups WHERE kind = ? ORDER BY created_at DESC LIMIT 500").bind(kind)
    : env.JOURNAL_DB.prepare("SELECT * FROM car_signups ORDER BY created_at DESC LIMIT 500");
  const { results } = await stmt.all();
  return json({ items: results || [] });
}

export async function onRequestPatch({ request, env }) {
  if (!isAdmin(request, env)) return json({ error: "Unauthorized" }, 401);
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: "Invalid request" }, 400); }
  const id = parseInt(b.id, 10);
  if (!id || !STATUSES.includes(b.status)) return json({ error: "Need id and a valid status" }, 400);
  await env.JOURNAL_DB.prepare("UPDATE car_signups SET status = ?, notes = ?, public_blurb = COALESCE(?, public_blurb) WHERE id = ?")
    .bind(b.status, clip(b.notes, 1000), b.public_blurb == null ? null : scrub(clip(b.public_blurb, 600)), id).run();
  return json({ ok: true });
}
