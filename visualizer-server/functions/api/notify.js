// Text Jonathan a message from his Quo business line.
// POST /api/notify  header X-Owner-Key = OWNER_KEY secret, JSON body {"text": "..."}.
// Secrets (Cloudflare, never in code): QUO_API_KEY, QUO_FROM (e.g. +15617942790), NOTIFY_TO (his cell, +1XXXXXXXXXX).
// Quo charges about $0.01 per text segment (160 plain characters), paid from prepaid Quo API credits.
const MAX_CHARS = 1200; // keeps one brief to about 8 segments (~$0.08) at most

export async function onRequestPost({ request, env }) {
  if (!env.OWNER_KEY || request.headers.get("X-Owner-Key") !== env.OWNER_KEY) return new Response("Forbidden", { status: 403 });
  if (!env.QUO_API_KEY || !env.QUO_FROM || !env.NOTIFY_TO) return Response.json({ ok: false, error: "quo_not_set_up" }, { status: 503 });
  let body;
  try { body = await request.json(); } catch { return Response.json({ ok: false, error: "bad_request" }, { status: 400 }); }
  // plain characters only, so each text segment holds 160 characters instead of 70
  const text = String(body.text || "")
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...")
    .replace(/[^\x0A\x20-\x7E]/g, "").trim().slice(0, MAX_CHARS);
  if (!text) return Response.json({ ok: false, error: "empty" }, { status: 400 });
  const r = await fetch("https://api.openphone.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: env.QUO_API_KEY },
    body: JSON.stringify({ content: text, from: env.QUO_FROM, to: [env.NOTIFY_TO] }),
  });
  const out = await r.text();
  return Response.json({ ok: r.ok, status: r.status, chars: text.length, segments: Math.ceil(text.length / 153), quo: out.slice(0, 300) }, { status: r.ok ? 200 : 502 });
}
