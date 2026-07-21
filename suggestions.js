// Requires a KV namespace bound to this Pages project as "SUGGESTIONS_KV".
// In Cloudflare: Workers & Pages > your project > Settings > Functions >
// KV namespace bindings > Variable name: SUGGESTIONS_KV > pick or create a namespace.

const STORAGE_KEY = "suggestions";
const MAX_ITEMS = 200;

async function getItems(kv) {
  const raw = await kv.get(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

export async function onRequestGet(context) {
  const kv = context.env.SUGGESTIONS_KV;
  if (!kv) {
    return new Response(JSON.stringify({ items: [], error: "KV not bound" }), {
      headers: { "Content-Type": "application/json" },
    });
  }
  const items = await getItems(kv);
  return new Response(JSON.stringify({ items }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function onRequestPost(context) {
  const kv = context.env.SUGGESTIONS_KV;
  if (!kv) {
    return new Response(JSON.stringify({ error: "KV not bound" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body;
  try {
    body = await context.request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Invalid request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const name = (body.name || "").toString().trim().slice(0, 60);
  const message = (body.message || "").toString().trim().slice(0, 500);

  if (!message) {
    return new Response(JSON.stringify({ error: "Message required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const items = await getItems(kv);
  items.push({
    name: name || "Anonymous",
    message,
    createdAt: new Date().toISOString(),
  });

  const trimmed = items.slice(-MAX_ITEMS);
  await kv.put(STORAGE_KEY, JSON.stringify(trimmed));

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
}
