// Anonymous visit stats for sylvesterpalmnursery.com. No names, phones, emails or IP addresses are stored.
// The page sends one small snapshot per visit (overwritten as the visit goes on): visible time, how far they scrolled,
// how many swipes, which sections they saw and for how long, where they were when they left, and what they tapped.
const ALLOWED = [/^https:\/\/(www\.)?sylvesterpalmnursery\.com$/, /^https:\/\/([a-z0-9-]+\.)?sp-site-preview\.pages\.dev$/, /^https:\/\/([a-z0-9-]+\.)?[a-z0-9-]+\.netlify\.app$/];
const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|pingdom|facebookexternalhit|whatsapp/i;
const num = (v, max) => Math.max(0, Math.min(max, Math.round(+v || 0)));
const str = (v, max) => String(v || "").replace(/[^\w .:/@?=&%+-]/g, "").slice(0, max);

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get("Origin") || "";
  if (!ALLOWED.some((r) => r.test(origin)) || BOT.test(request.headers.get("User-Agent") || "")) return new Response(null, { status: 204 });
  let b;
  try { b = JSON.parse(await request.text()); } catch { return new Response(null, { status: 204 }); }
  if (!/^[a-z0-9]{8,24}$/i.test(b.sid || "")) return new Response(null, { status: 204 });
  const secs = {};
  for (const [k, v] of Object.entries(b.secs || {}).slice(0, 20)) secs[str(k, 20)] = num(v, 7200);
  const clicks = {};
  for (const [k, v] of Object.entries(b.clicks || {}).slice(0, 20)) clicks[str(k, 20)] = num(v, 500);
  const rec = {
    t: num(b.start, 9e12), dur: num(b.dur, 7200), scroll: num(b.scroll, 100), swipes: num(b.swipes, 5000),
    secs, order: (b.order || []).slice(0, 20).map((x) => str(x, 20)), last: str(b.last, 20), clicks,
    dev: b.dev === "mobile" ? "mobile" : "desktop", ref: str(b.ref, 60), utm: str(b.utm, 40), lang: str(b.lang, 8), page: str(b.page, 40),
    ret: !!b.ret,
  };
  const day = new Date(rec.t || Date.now()).toISOString().slice(0, 10);
  await env.STATS.put(`s:${day}:${b.sid}`, JSON.stringify(rec), { expirationTtl: 60 * 60 * 24 * 120 });
  return new Response(null, { status: 204 });
}
