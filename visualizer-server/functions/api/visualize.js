// Sylvester Palm Nursery — "See it in your yard" AI preview.
// The website sends: the customer's yard photo, an optional copy of that photo with the spot they painted,
// and which of OUR real palms they picked. Gemini plants that exact palm in the marked spot
// (removing any tree or bush already there) and returns the edited photo.
// The Gemini key lives only here (Cloudflare secret GEMINI_API_KEY), never in the website code.
// Limits: 4 previews per visitor per day, 50 per day for the whole site (max ~$2/day).

const MODEL = "gemini-3.1-flash-image";
const PER_IP_PER_DAY = 4;
const SITE_PER_DAY = 50;
const MAX_B64 = 4_200_000; // ~3 MB per image

const ALLOWED = [
  /^https:\/\/(www\.)?sylvesterpalmnursery\.com$/,
  /^https:\/\/([a-z0-9-]+\.)?sp-site-preview\.pages\.dev$/,
  /^https:\/\/([a-z0-9-]+\.)?[a-z0-9-]+\.netlify\.app$/,
  /^http:\/\/localhost(:\d+)?$/,
];

// Our real palms. To add one: put a photo in public/refs/ and add a line here (and on the website).
const PALMS = {
  "sylvester-3ft-varnished": { file: "/refs/sylvester-3ft-varnished.jpg", desc: "a Sylvester palm with about 3 feet of clear trunk, the trunk's diamond-cut leaf bases varnished a glossy orange" },
  "sylvester-3ft-normal": { file: "/refs/sylvester-3ft-normal.jpg", desc: "a Sylvester palm with about 3 feet of clear trunk, natural (unvarnished) golden-tan diamond-cut trunk" },
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
const okOrigin = (o) => ALLOWED.some((r) => r.test(o || ""));
const parseImg = (s) => /^data:(image\/(jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(s || "");

function toB64(buf) {
  let s = "";
  const b = new Uint8Array(buf);
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}

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
  const palmId = PALMS[body.palm] ? body.palm : "sylvester-3ft-varnished";
  const palm = PALMS[palmId];
  const count = Math.min(3, Math.max(1, parseInt(body.count, 10) || 1));
  const photo = parseImg(body.image);
  if (!photo) return json({ error: "bad_image" }, 400, origin);
  const marked = body.marked ? parseImg(body.marked) : null;
  if (photo[3].length > MAX_B64 || (marked && marked[3].length > MAX_B64)) return json({ error: "too_big" }, 413, origin);

  // daily limits (per visitor + whole site)
  const day = new Date().toISOString().slice(0, 10);
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const kIp = `ip:${day}:${ip}`, kAll = `all:${day}`;
  if (env.LIMITS) {
    const [nIp, nAll] = await Promise.all([env.LIMITS.get(kIp), env.LIMITS.get(kAll)]);
    if ((+nIp || 0) >= PER_IP_PER_DAY) return json({ error: "limit_you" }, 429, origin);
    if ((+nAll || 0) >= SITE_PER_DAY) return json({ error: "limit_site" }, 429, origin);
  }

  // the real palm photo from our farm
  const refRes = await env.ASSETS.fetch(new URL(palm.file, request.url));
  if (!refRes.ok) return json({ error: "ai_failed" }, 500, origin);
  const ref = toB64(await refRes.arrayBuffer());

  const word = count === 1 ? "one" : count === 2 ? "two" : "three";
  const s = count > 1 ? "s" : "";
  const parts = [];
  parts.push({ text: "IMAGE A — the customer's real photo of their yard:" });
  parts.push({ inline_data: { mime_type: photo[1], data: photo[3] } });
  if (marked) {
    parts.push({ text: "IMAGE B — the same photo where the customer painted the exact spot they want, in bright magenta:" });
    parts.push({ inline_data: { mime_type: marked[1], data: marked[3] } });
  }
  parts.push({ text: "IMAGE C — the exact palm from our nursery that they picked:" });
  parts.push({ inline_data: { mime_type: "image/jpeg", data: ref } });
  parts.push({
    text:
      `Edit IMAGE A. Plant ${word} palm${s} that look exactly like the palm in IMAGE C (${palm.desc}): same trunk height, ` +
      `trunk color and texture, and the same full crown of fronds. ` +
      (marked
        ? `Put the palm${s} ONLY inside the area painted magenta in IMAGE B, standing on the ground there. ` +
          `If there is an existing tree, palm, bush or plant inside that painted area, remove it completely and fill in the ground ` +
          `and background naturally behind the new palm${s}. Do not change anything outside the painted area. `
        : `Put the palm${s} in the most natural open spot${s} on the ground (lawn, garden bed or beside the driveway). `) +
      `Scale the palm${s} realistically for a palm with about 3 feet of trunk next to the house, doors, cars or fences in the photo. ` +
      `Match the photo's light, shadows, perspective and colors so it looks like a real photo. ` +
      `Keep the house, people, cars, sky and camera angle exactly the same. The final image must NOT contain any magenta paint, ` +
      `text, logos or watermarks. Return only the edited version of IMAGE A.`,
  });

  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ["IMAGE"] } }),
  });
  if (!r.ok) {
    const t = await r.text();
    console.log("gemini error", r.status, t.slice(0, 400));
    return json({ error: r.status === 429 || /billing|quota|credit/i.test(t) ? "busy" : "ai_failed" }, 502, origin);
  }
  const data = await r.json();
  const out = (data?.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData || p.inline_data);
  if (!out) return json({ error: "no_image" }, 502, origin);
  const d = out.inlineData || out.inline_data;

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
