/**
 * Depth Chart — shared-state Worker (Cloudflare).
 *
 * Backs the global pick-rates and daily score ledger that power rarity
 * scoring and the "better than X% of players" line. Personal progress
 * stays in each browser's localStorage; only shared keys hit this Worker.
 *
 * Endpoints:
 *   GET  /get?key=<k>              -> { value }      (value is null if unset)
 *   POST /set   { key, value }     -> { ok: true }
 *
 * Bind a KV namespace named DEPTH_KV (see wrangler.toml).
 *
 * Scaling note: writes are last-write-wins read-modify-write from the client.
 * That's fine for statistical pick-rate counters at launch scale. If a single
 * daily key ever sees heavy concurrent writes, migrate that path to a Durable
 * Object for atomic increments.
 */

const ALLOW_ORIGIN = "*"; // tighten to your domain once live, e.g. "https://playdepthchart.com"

function cors(extra = {}) {
  return {
    "Access-Control-Allow-Origin": ALLOW_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
    ...extra,
  };
}

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: cors() });

// keep keys sane and namespaced
const okKey = (k) =>
  typeof k === "string" && k.length > 0 && k.length <= 256 && !/[\s"'\\]/.test(k);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors() });
    }

    if (url.pathname === "/get" && request.method === "GET") {
      const key = url.searchParams.get("key") || "";
      if (!okKey(key)) return json({ error: "bad key" }, 400);
      const raw = await env.DEPTH_KV.get("v1:" + key);
      return json({ value: raw ? JSON.parse(raw) : null });
    }

    if (url.pathname === "/set" && request.method === "POST") {
      let body;
      try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }
      const { key, value } = body || {};
      if (!okKey(key)) return json({ error: "bad key" }, 400);
      const payload = JSON.stringify(value);
      if (payload.length > 256 * 1024) return json({ error: "too large" }, 413);
      // expire daily keys after ~10 days to keep KV tidy; keep streak/aggregate keys.
      const opts = /:\d{4}-\d{2}-\d{2}/.test(key) ? { expirationTtl: 864000 } : {};
      await env.DEPTH_KV.put("v1:" + key, payload, opts);
      return json({ ok: true });
    }

    if (url.pathname === "/" ) return json({ ok: true, service: "depth-chart" });
    return json({ error: "not found" }, 404);
  },
};
