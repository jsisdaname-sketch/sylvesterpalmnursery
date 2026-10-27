// Sylvester Palm Nursery — "See it in your yard" AI preview.
// The website sends the customer's photo + the palm they picked; we ask Gemini to place that palm in the photo.
// The Gemini key lives only here (Cloudflare secret GEMINI_API_KEY), never in the website code.
// Limits: 4 previews per visitor per day, 50 per day for the whole site (max ~$2/day), photos up to ~3 MB.

const MODEL = "gemini-3.1-flash-image";
const PER_IP_PER_DAY = 4;
const SITE_PER_DAY = 50;
const MAX_B64 = 4_200_000; // ~3 MB image

const ALLOWED = [
  /^https:\/\/(www\.)?sylvesterpalmnursery\.com$/,
  /^https:\/\/([a-z0-9-]+\.)?sp-site-preview\.pages\.dev$/,
  /^https:\/\/([a-z0-9-]+\.)?[a-z0-9-]+\.netlify\.app$/,
  /^http:\/\/localhost(:\d+)?$/,
];

const PALMS = {
  sylvester: "Sylvester palm (Phoenix sylvestris): one thick, straight trunk about 6 to 8 feet tall covered in a neat orange-brown diamond pattern of cut leaf bases, topped with a full, round crown of stiff silver-green feather fronds",
  bismarck: "Bismarck palm: a stout grey trunk topped with huge, stiff, round fan-shaped leaves in a striking silvery blue",
  coconut: "coconut palm: a tall, slender, slightly curving grey trunk with a crown of long, arching, glossy green feather fronds",
  foxtail: "foxtail palm: a smooth light-grey ringed trunk, a bright green crownshaft and bushy, plume-like fronds that look like a fox's tail",
  royal: "royal palm: a tall, smooth, pale grey column-like trunk, a glossy bright green crownshaft and graceful arching fronds",
};

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
const json = (obj, status, origin) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...cors(origin) } });

function okOrigin(o) { return ALLOWED.some((r) => r.test(o || "")); }

export async function onRequestOptions({ request }) {
  const o = request.headers.get("Origin") || "";
  if (!okOrigin(o)) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: cors(o) });
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get("Origin") || "";
  if (!okOrigin(origin)) return new Response("Forbidden", { status: 403 });

  let body;
  try { body = await request.json(); } catch { return json({ error: "bad_request" }, 400, origin); }
  const palm = PALMS[body.palm] ? body.palm : "sylvester";
  const count = Math.min(3, Math.max(1, parseInt(body.count, 10) || 1));
  const m = /^data:(image\/(jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(body.image || "");
  if (!m) return json({ error: "bad_image" }, 400, origin);
  if (m[3].length > MAX_B64) return json({ error: "too_big" }, 413, origin);

  // daily limits (per visitor + whole site)
  const day = new Date().toISOString().slice(0, 10);
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const kIp = `ip:${day}:${ip}`, kAll = `all:${day}`;
  if (env.LIMITS) {
    const [nIp, nAll] = await Promise.all([env.LIMITS.get(kIp), env.LIMITS.get(kAll)]);
    if ((+nIp || 0) >= PER_IP_PER_DAY) return json({ error: "limit_you" }, 429, origin);
    if ((+nAll || 0) >= SITE_PER_DAY) return json({ error: "limit_site" }, 429, origin);
  }

  const word = count === 1 ? "one" : count === 2 ? "two" : "three";
  const prompt =
    `This is a real photo of a customer's yard or property. Edit it to show how it would look with ${word} ` +
    `${PALMS[palm]} planted in it. Put the palm${count > 1 ? "s" : ""} in the most natural open spot${count > 1 ? "s" : ""} ` +
    `on the ground (lawn, garden bed or beside the driveway), at a realistic size for a mature nursery palm, standing upright, ` +
    `with matching light, shadows, perspective and color so it looks like a real photo. ` +
    `Keep everything else in the photo exactly the same: the house, people, cars, sky and the camera angle. ` +
    `Do not add any text, logos or watermarks.`;

  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: m[1], data: m[3] } }] }],
      generationConfig: { responseModalities: ["IMAGE"] },
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    console.log("gemini error", r.status, t.slice(0, 400));
    return json({ error: r.status === 429 || /billing|quota|credit/i.test(t) ? "busy" : "ai_failed" }, 502, origin);
  }
  const data = await r.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const img = parts.find((p) => p.inlineData || p.inline_data);
  if (!img) return json({ error: "no_image" }, 502, origin);
  const d = img.inlineData || img.inline_data;

  if (env.LIMITS) {
    const ttl = { expirationTtl: 60 * 60 * 30 };
    const [nIp, nAll] = await Promise.all([env.LIMITS.get(kIp), env.LIMITS.get(kAll)]);
    await Promise.all([
      env.LIMITS.put(kIp, String((+nIp || 0) + 1), ttl),
      env.LIMITS.put(kAll, String((+nAll || 0) + 1), ttl),
    ]);
  }
  return json({ image: `data:${d.mimeType || d.mime_type || "image/png"};base64,${d.data}` }, 200, origin);
}
