// Requires the same ADMIN_PASSWORD secret and JOURNAL_DB binding as admin/log.js
// GET /api/admin/journal            -> JSON list
// GET /api/admin/journal?format=csv -> CSV download (for handing to an accountant)

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const password = request.headers.get("x-admin-password") || url.searchParams.get("password") || "";

  if (!env.ADMIN_PASSWORD || password !== env.ADMIN_PASSWORD) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { results } = await env.JOURNAL_DB.prepare(
    `SELECT * FROM journal ORDER BY created_at DESC`
  ).all();

  if (url.searchParams.get("format") === "csv") {
    const header = "id,created_at,category,donor_name,donor_email,amount,fair_market_value,deductible_amount,method,notes,receipt_number\n";
    const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = results.map((r) =>
      [r.id, r.created_at, r.category, escape(r.donor_name), r.donor_email, r.amount,
       r.fair_market_value, r.deductible_amount, r.method, escape(r.notes), r.receipt_number].join(",")
    ).join("\n");
    return new Response(header + rows, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=journal.csv",
      },
    });
  }

  return new Response(JSON.stringify({ items: results }), {
    headers: { "Content-Type": "application/json" },
  });
}
