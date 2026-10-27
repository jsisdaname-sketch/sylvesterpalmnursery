// Visit report. GET /api/stats?days=7  with header X-Owner-Key (or ?key=) = the OWNER_KEY secret.
export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const key = request.headers.get("X-Owner-Key") || u.searchParams.get("key");
  if (!env.OWNER_KEY || key !== env.OWNER_KEY) return new Response("Forbidden", { status: 403 });
  const days = Math.min(90, Math.max(1, parseInt(u.searchParams.get("days"), 10) || 7));
  const recs = [];
  for (let i = 0; i < days; i++) {
    const day = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    let cursor;
    do {
      const l = await env.STATS.list({ prefix: `s:${day}:`, cursor });
      const vals = await Promise.all(l.keys.map((k) => env.STATS.get(k.name)));
      vals.forEach((v) => { try { const r = JSON.parse(v); r.day = day; recs.push(r); } catch {} });
      cursor = l.list_complete ? null : l.cursor;
    } while (cursor);
  }
  const n = recs.length, pct = (x) => (n ? Math.round((100 * x) / n) : 0);
  const avg = (a) => (a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : 0);
  const med = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const count = (f) => recs.reduce((m, r) => { const k = f(r) || "(none)"; m[k] = (m[k] || 0) + 1; return m; }, {});
  const top = (m, k = 8) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, k);
  const secNames = [...new Set(recs.flatMap((r) => Object.keys(r.secs || {})))];
  const sections = secNames.map((s) => {
    const seen = recs.filter((r) => (r.secs || {})[s] > 0);
    return { section: s, reached_pct: pct(seen.length), avg_seconds: avg(seen.map((r) => r.secs[s])), left_here: recs.filter((r) => r.last === s).length };
  }).sort((a, b) => b.reached_pct - a.reached_pct);
  const clickNames = [...new Set(recs.flatMap((r) => Object.keys(r.clicks || {})))];
  const out = {
    days, visits: n,
    by_day: top(count((r) => r.day), 90).sort(),
    devices: count((r) => r.dev),
    returning_pct: pct(recs.filter((r) => r.ret).length),
    time_on_site: { avg_seconds: avg(recs.map((r) => r.dur)), median_seconds: med(recs.map((r) => r.dur)),
      left_under_10s_pct: pct(recs.filter((r) => r.dur < 10).length), stayed_over_1min_pct: pct(recs.filter((r) => r.dur >= 60).length),
      stayed_over_3min_pct: pct(recs.filter((r) => r.dur >= 180).length) },
    scroll: { avg_max_pct: avg(recs.map((r) => r.scroll)), reached_25: pct(recs.filter((r) => r.scroll >= 25).length),
      reached_50: pct(recs.filter((r) => r.scroll >= 50).length), reached_75: pct(recs.filter((r) => r.scroll >= 75).length),
      reached_bottom: pct(recs.filter((r) => r.scroll >= 95).length), avg_swipes: avg(recs.map((r) => r.swipes)) },
    sections, exit_section: top(count((r) => r.last), 12),
    taps: clickNames.map((c) => ({ tap: c, total: recs.reduce((s, r) => s + ((r.clicks || {})[c] || 0), 0),
      visits_pct: pct(recs.filter((r) => (r.clicks || {})[c] > 0).length) })).sort((a, b) => b.total - a.total),
    referrers: top(count((r) => r.ref)), campaigns: top(count((r) => r.utm)), languages: top(count((r) => r.lang)),
  };
  return new Response(JSON.stringify(out, null, 2), { headers: { "Content-Type": "application/json" } });
}
