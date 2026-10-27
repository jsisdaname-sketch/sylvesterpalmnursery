// Sylvester Palm Nursery — step 0 of the yard preview: MEASURE.
// A cheap vision model (no image generation) looks at the customer's photo + the spots they painted and returns:
//  - where each palm's trunk base goes (one per painted spot),
//  - how many pixels tall a 3 ft / 4 ft trunk is at that spot, measured from windows, doors, roof line, fences, etc.,
//  - what is currently inside each painted spot that must be removed.
// The website draws those measurements as guide bars, and /api/visualize uses them to clear + plant.
// Cost: well under $0.01 per call.

const MODEL = "gemini-3.5-flash";
const PER_IP_PER_DAY = 12;
const MAX_B64 = 4_200_000;

const ALLOWED = [
  /^https:\/\/(www\.)?sylvesterpalmnursery\.com$/,
  /^https:\/\/([a-z0-9-]+\.)?sp-site-preview\.pages\.dev$/,
  /^https:\/\/([a-z0-9-]+\.)?[a-z0-9-]+\.netlify\.app$/,
  /^http:\/\/localhost(:\d+)?$/,
];
const okOrigin = (o) => ALLOWED.some((r) => r.test(o || ""));
const parseImg = (s) => /^data:(image\/(jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(s || "");
const cors = (origin) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Owner-Key",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin",
});
const json = (obj, status, origin) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...cors(origin) } });

const SCHEMA = {
  type: "object",
  properties: {
    references: {
      type: "array",
      description: "Objects used as a ruler",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          real_height_ft: { type: "number" },
          top_y: { type: "number" },
          bottom_y: { type: "number" },
        },
        required: ["name", "real_height_ft", "top_y", "bottom_y"],
      },
    },
    spots: {
      type: "array",
      items: {
        type: "object",
        properties: {
          base_x: { type: "number" },
          base_y: { type: "number" },
          px_per_ft: { type: "number", description: "Pixels (0-1000 vertical scale) per real foot at the depth of this spot" },
          remove: { type: "string", description: "What is inside this painted spot that must be erased, or 'nothing'" },
        },
        required: ["base_x", "base_y", "px_per_ft", "remove"],
      },
    },
  },
  required: ["references", "spots"],
};

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
  const photo = parseImg(body.image), marked = parseImg(body.marked);
  if (!photo || !marked) return json({ error: "bad_image" }, 400, origin);
  if (photo[3].length > MAX_B64 || marked[3].length > MAX_B64) return json({ error: "too_big" }, 413, origin);
  const count = Math.min(3, Math.max(1, parseInt(body.count, 10) || 1));
  const regions = Math.min(3, Math.max(1, parseInt(body.regions, 10) || 1));

  const day = new Date().toISOString().slice(0, 10);
  const k = `an:${day}:${request.headers.get("CF-Connecting-IP") || "unknown"}`;
  if (env.LIMITS) {
    const n = +(await env.LIMITS.get(k)) || 0;
    const owner = !!env.OWNER_KEY && request.headers.get("X-Owner-Key") === env.OWNER_KEY;
    if (!owner && n >= PER_IP_PER_DAY) return json({ error: "limit_you" }, 429, origin);
    await env.LIMITS.put(k, String(n + 1), { expirationTtl: 60 * 60 * 30 });
  }

  const palms = Math.max(count, regions);
  const prompt =
    `You are a landscape designer measuring a customer's yard photo. IMAGE A is the photo. IMAGE B is the same photo where the customer ` +
    `painted ${regions} separate area(s) in magenta where they want new palm trees. All coordinates use a 0-1000 scale: x from the left edge, ` +
    `y from the top edge of the image.\n` +
    `1) RULER: find 2-4 objects of known real size near the painted areas and give their real height and their top_y and bottom_y. ` +
    `Typical sizes: front door 6.7 ft, garage door 7 ft, window sill about 3 ft above ground, a standard window about 4-5 ft tall, ` +
    `one-story roof edge/gutter about 9-10 ft above ground, fence 4 or 6 ft, car 5 ft tall, adult 5.7 ft, mailbox 3.5 ft, front step 0.6 ft.\n` +
    `2) SPOTS: return exactly ${palms} spot(s). Put one spot in each painted area first` +
    (palms > regions ? `, then place the extra spot(s) inside the largest painted area, spaced apart` : ``) +
    `. For each spot give base_x, base_y = the point ON THE GROUND (soil, mulch, grass) where a new trunk would stand, at the BOTTOM ` +
    `of the painted area (if an existing tree is painted, use where its trunk meets the ground). Give px_per_ft = how many units on the 0-1000 ` +
    `VERTICAL scale equal one real foot at that spot's distance from the camera, worked out from your ruler objects (account for perspective: ` +
    `things farther away are smaller). Give remove = a short, specific description of every tree, palm, bush or plant inside or touching that ` +
    `painted area that must be erased, including where its leaves/crown extend (e.g. "two thin-trunked Christmas palms and their fronds, ` +
    `upper left, reaching up to the roof"), or "nothing".`;

  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ parts: [
        { text: "IMAGE A:" }, { inline_data: { mime_type: photo[1], data: photo[3] } },
        { text: "IMAGE B:" }, { inline_data: { mime_type: marked[1], data: marked[3] } },
        { text: prompt },
      ] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA, temperature: 0.2 },
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    console.log("analyze error", r.status, t.slice(0, 400));
    return json({ error: r.status === 429 || /billing|quota|credit/i.test(t) ? "busy" : "ai_failed" }, 502, origin);
  }
  const data = await r.json();
  let out;
  try { out = JSON.parse(data.candidates[0].content.parts.map((p) => p.text || "").join("")); }
  catch { return json({ error: "ai_failed" }, 502, origin); }
  const clamp = (v, a, b) => Math.min(b, Math.max(a, +v || 0));
  const spots = (out.spots || []).slice(0, 3).map((s) => ({
    x: clamp(s.base_x, 0, 1000) / 1000,
    y: clamp(s.base_y, 0, 1000) / 1000,
    pxPerFt: clamp(s.px_per_ft, 5, 400) / 1000, // fraction of image height per foot
    remove: String(s.remove || "nothing").slice(0, 300),
  }));
  if (!spots.length) return json({ error: "ai_failed" }, 502, origin);
  return json({ spots, references: (out.references || []).slice(0, 4) }, 200, origin);
}
