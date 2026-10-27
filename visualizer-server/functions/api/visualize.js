// Sylvester Palm Nursery — "See it in your yard" AI preview.
// The website sends: the customer's yard photo, an optional copy of that photo with the spot they painted,
// and which of OUR real palms they picked. Gemini plants that exact palm in the marked spot
// (removing any tree or bush already there) and returns the edited photo.
// The Gemini key lives only here (Cloudflare secret GEMINI_API_KEY), never in the website code.
// Limits: 4 previews per visitor per day, 30 per day for the whole site. Each preview = up to 2 AI images (~$0.08), so max ~$2.40/day.

const MODEL = "gemini-3.1-flash-image";
const PER_IP_PER_DAY = 4;
const SITE_PER_DAY = 30;
const MAX_B64 = 4_200_000; // ~3 MB per image

const ALLOWED = [
  /^https:\/\/(www\.)?sylvesterpalmnursery\.com$/,
  /^https:\/\/([a-z0-9-]+\.)?sp-site-preview\.pages\.dev$/,
  /^https:\/\/([a-z0-9-]+\.)?[a-z0-9-]+\.netlify\.app$/,
  /^http:\/\/localhost(:\d+)?$/,
];

// Our real palms. To add one: put a photo in public/refs/ and add a line here (and on the website).
const PALMS = {
  "sylvester-3ft-varnished": { ft: 3, file: "/refs/sylvester-3ft-varnished.jpg", finish: "varnished: the diamond-cut trunk is a glossy, rich orange" },
  "sylvester-3ft-normal": { ft: 3, file: "/refs/sylvester-3ft-normal.jpg", finish: "natural (not varnished): golden-tan diamond-cut trunk" },
  "sylvester-4ft-varnished": { ft: 4, file: "/refs/sylvester-4ft-varnished.jpg", finish: "varnished: the diamond-cut trunk is a glossy, rich orange" },
  "sylvester-4ft-normal": { ft: 4, file: "/refs/sylvester-4ft-normal.jpg", finish: "natural (not varnished): golden-tan diamond-cut trunk" },
};
// How big the whole palm is, by trunk height (trunk = ground to where the fronds start).
const SIZE = {
  3: "The trunk (from the ground to where the fronds start) is only 3 feet tall: about an adult's hip height, the same as a kitchen counter or a typical window sill, less than half the height of a front door.",
  4: "The trunk (from the ground to where the fronds start) is 4 feet tall: about an adult's lower chest, a bit above a typical window sill, about 60% of the height of a front door.",
};


function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Owner-Key",
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

async function gemini(env, parts) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ["IMAGE"] } }),
  });
  if (!r.ok) {
    const t = await r.text();
    console.log("gemini error", r.status, t.slice(0, 400));
    return { error: r.status === 429 || /billing|quota|credit/i.test(t) ? "busy" : "ai_failed" };
  }
  const data = await r.json();
  const out = (data?.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData || p.inline_data);
  if (!out) return { error: "no_image" };
  const d = out.inlineData || out.inline_data;
  return { mime: d.mimeType || d.mime_type || "image/png", data: d.data };
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
  const owner = !!env.OWNER_KEY && request.headers.get("X-Owner-Key") === env.OWNER_KEY; // Jonathan's own link: no per-person limit
  if (env.LIMITS) {
    const [nIp, nAll] = await Promise.all([env.LIMITS.get(kIp), env.LIMITS.get(kAll)]);
    if (!owner && (+nIp || 0) >= PER_IP_PER_DAY) return json({ error: "limit_you" }, 429, origin);
    if ((+nAll || 0) >= SITE_PER_DAY) return json({ error: "limit_site" }, 429, origin);
  }

  // the real palm photo from our farm
  const refRes = await env.ASSETS.fetch(new URL(palm.file, request.url));
  if (!refRes.ok) return json({ error: "ai_failed" }, 500, origin);
  const ref = toB64(await refRes.arrayBuffer());

  const word = count === 1 ? "one" : count === 2 ? "two" : "three";
  const s = count > 1 ? "s" : "";
  const spot = body.spot ? parseImg(body.spot) : null; // photo with magenta guide bars: bottom = trunk base, top = top of trunk (measured by /api/analyze)
  const removeList = (Array.isArray(body.remove) ? body.remove : []).map((x) => String(x).slice(0, 300)).filter((x) => x && !/^nothing$/i.test(x)).slice(0, 3);
  if (spot && spot[3].length > MAX_B64) return json({ error: "too_big" }, 413, origin);

  // STEP 1 (only when they painted): erase whatever is in the painted area.
  let base = { mime: photo[1], data: photo[3] };
  if (marked) {
    const cleared = await gemini(env, [
      { text: "IMAGE A - a real photo of a yard:" },
      { inline_data: { mime_type: photo[1], data: photo[3] } },
      { text: "IMAGE B - the same photo with an area painted bright magenta:" },
      { inline_data: { mime_type: marked[1], data: marked[3] } },
      { text:
          (removeList.length ? "Things to erase: " + removeList.map((x, i) => `(${i + 1}) ${x}`).join("; ") + ". " : "") +
          "Edit IMAGE A like a professional photo retoucher. Every tree, palm, bush or plant that is inside or touches ANY of the magenta areas in IMAGE B " +
          "must be erased COMPLETELY: its whole trunk from the ground up AND its entire crown, fronds and leaves, including every part that sticks out " +
          "above or beside the painted area. No leftover trunk, stump, frond, shadow or blur. Rebuild what was behind it (house wall, windows, sky, fence, " +
          "other plants, mulch, soil or grass) so it looks like it was never there. If nothing is there, leave the photo as is. Change nothing else, " +
          "keep the exact same framing and size, and do not add anything. The result must contain no magenta. Return only the edited IMAGE A." },
    ]);
    if (cleared.error) return json({ error: cleared.error }, 502, origin);
    base = cleared;
  }

  // STEP 2: plant our palm.
  const parts = [{ text: "IMAGE A - the customer's yard photo:" }, { inline_data: { mime_type: base.mime, data: base.data } }];
  if (spot || marked) {
    parts.push({ text: spot
      ? "IMAGE B - the yard with magenta GUIDE BARS, one per palm. Each bar was measured from the windows, doors and roof in the photo: the BOTTOM of the bar is where the trunk meets the ground, the TOP of the bar is exactly where the trunk ends and the fronds start:"
      : "IMAGE B - the yard with the magenta area showing where the palm" + s + " must stand:" });
    parts.push({ inline_data: { mime_type: (spot || marked)[1], data: (spot || marked)[3] } });
  }
  parts.push({ text: "IMAGE C - the exact palm from our nursery that they picked:" });
  parts.push({ inline_data: { mime_type: "image/jpeg", data: ref } });
  parts.push({
    text:
      `Edit IMAGE A. Plant ${word} palm${s} that look exactly like the palm in IMAGE C: a Sylvester palm, ${palm.finish}, same crown shape and frond color. ` +
      (spot || marked
        ? (spot
          ? `Plant exactly one palm on each magenta guide bar in IMAGE B (${word} in total). Each trunk must start on the ground at the bottom of its bar and ` +
            `end exactly at the top of its bar: the trunk height MUST match the bar height precisely, not taller and not shorter. ` +
            `Each palm stands on its own, apart from the others. `
          : `The base of the trunk must stand on the ground in the magenta area of IMAGE B (the area only shows WHERE, not how big). `)
        : `Put the palm${s} on the ground in the most natural open spot${s} (lawn, garden bed or beside the driveway). `) +
      `SIZE IS CRITICAL. ${SIZE[palm.ft]} Use the doors, windows, roof line, fences, cars and people in the photo as a ruler ` +
      `(a front door is about 6.7 ft tall, a window sill about 3 ft off the ground, a car about 5 ft tall, an adult about 5.7 ft). ` +
      `Copy the proportions of IMAGE C exactly: the trunk is short and THICK (its width is about one third of its height, wider at the base, ` +
      `with big diamond-shaped leaf bases), and the crown of fronds spreads about 3 times as wide as the trunk is tall. Do NOT make a tall, thin or stretched trunk. ` +
      `When in doubt, make the palm SMALLER, never bigger. Match the photo's light, shadows, perspective and colors so it looks like a real photo. ` +
      `Copy ONLY the palm itself from IMAGE C: do NOT copy its ground, the orange/brown fallen fibers, dead leaves, debris or background around its base. ` +
      `The ground at the base of each new trunk must stay exactly what IMAGE A already has there (grass, mulch, soil or plants), with only a natural soft shadow. ` +
      `Keep everything else exactly the same. The final image must NOT contain any magenta, text, logos or watermarks. Return only the edited IMAGE A.`,
  });
  const out = await gemini(env, parts);
  if (out.error) return json({ error: out.error }, 502, origin);
  const d = { mimeType: out.mime, data: out.data };

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
