// GET /api/photo?key=rsvp-photos/12/173...-abc.jpg
// Streams the actual image bytes out of R2. Requires PHOTOS_BUCKET binding.

export async function onRequestGet(context) {
  const { request, env } = context;
  const key = new URL(request.url).searchParams.get("key");

  if (!key || !key.startsWith("rsvp-photos/")) {
    return new Response("Not found", { status: 404 });
  }

  const object = await env.PHOTOS_BUCKET.get(key);
  if (!object) {
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");

  return new Response(object.body, { headers });
}
