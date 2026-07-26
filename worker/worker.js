/**
 * Any Given Player — shared-state Worker (Cloudflare).
 *
 * Backs the global pick-rates and daily score ledger that power rarity
 * scoring and the "better than X% of players" line. Personal progress
 * stays in each browser's localStorage; only shared keys hit this Worker.
 *
 * Endpoints:
 *   GET  /get?key=<k>              -> { value }      (value is null if unset)
 *   POST /set   { key, value }     -> { ok: true }
 *   POST /pick  { league, team, position, guess }
 *                                  -> server-validated guess + score
 *                                     (see handlePick below)
 *
 * Why /pick exists: /set is a generic key/value write — a client could
 * previously call it directly and assert "I got this right," inflating
 * their own score AND corrupting the shared pick-rate for every other
 * player on that board. /pick is the only thing allowed to write to a
 * dpick:* key, and it decides correctness itself against its own copy
 * of the roster data (same public nflverse data the client has — this
 * isn't about hiding the answer key, it's about not trusting the client's
 * self-report).
 *
 * Bind a KV namespace named DEPTH_KV (see wrangler.toml).
 *
 * Scaling note: writes are last-write-wins read-modify-write from the
 * Worker. That's fine for statistical pick-rate counters at launch scale.
 * If a single daily key ever sees heavy concurrent writes, migrate that
 * path to a Durable Object for atomic increments. This was true before
 * /pick existed too — moving the write here doesn't change the race,
 * it just closes the "client can write anything" hole.
 */

import { ROSTER_DATA_B64 } from "./roster-data.js";

const ALLOW_ORIGIN = "*"; // tighten to your domain once live, e.g. "https://anygivenplayer.com"

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

/* ---------- same name-matching + scoring rules as the client (src/app.jsx) ---------- */

const norm = (s) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/['\u2019.\-]/g, "").replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();

function lev1(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 1) return 2;
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++)
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
    if (Math.min(...prev) > 1) return 2;
  }
  return prev[n];
}

const TIER_PRIOR = { 1: 42, 2: 24, 3: 12, 4: 5, 5: 1.5 };
function estPickPct(player, slotCounts) {
  const prior = TIER_PRIOR[player.tier];
  const PRIOR_W = 20;
  const total = slotCounts?.__total || 0;
  const mine = slotCounts?.[player.key] || 0;
  return ((prior / 100) * PRIOR_W + mine) / (PRIOR_W + total) * 100;
}
const ptsFromPct = (pct) => Math.max(1, Math.round(100 - pct));

/* ---------- roster data: decompressed once per isolate, then cached ---------- */

function b64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

let _rosterPromise = null;
async function getRoster() {
  if (!_rosterPromise) {
    _rosterPromise = (async () => {
      const bytes = b64ToBytes(ROSTER_DATA_B64);
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
      const text = await new Response(stream).text();
      const raw = JSON.parse(text); // { nfl: { TEN: { QB: [[name,tier,y0,y1],...] } }, cfb: { LSU: { WR: [[name,tier],...] } } }
      // pre-key every entry once, same shape the client uses (p.key = norm(name))
      const indexed = {};
      for (const league of Object.keys(raw)) {
        indexed[league] = {};
        for (const team of Object.keys(raw[league])) {
          indexed[league][team] = {};
          for (const pos of Object.keys(raw[league][team])) {
            indexed[league][team][pos] = raw[league][team][pos].map((e) => ({
              name: e[0], key: norm(e[0]), tier: e[1],
            }));
          }
        }
      }
      return indexed;
    })();
  }
  return _rosterPromise;
}

/* ---------- /pick: the only path allowed to write a dpick:* key ---------- */

async function handlePick(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }
  const { league, team, position, guess } = body || {};

  if (!["nfl", "cfb"].includes(league)) return json({ error: "bad league" }, 400);
  if (typeof team !== "string" || team.length > 8) return json({ error: "bad team" }, 400);
  if (typeof position !== "string" || position.length > 8) return json({ error: "bad position" }, 400);
  if (typeof guess !== "string" || guess.length > 80) return json({ error: "bad guess" }, 400);

  const roster = await getRoster();
  const list = roster[league]?.[team]?.[position];
  if (!list) return json({ error: "unknown team/position" }, 400);

  const g = norm(guess);
  if (!g) return json({ status: "miss" });

  let hit = list.find(
    (p) => p.key === g || (g.length >= 8 && Math.abs(p.key.length - g.length) <= 1 && p.key[0] === g[0] && lev1(g, p.key) <= 1)
  );

  if (!hit) {
    const suffix = list.filter((p) => p.key.endsWith(" " + g));
    const distinct = [...new Set(suffix.map((p) => p.key))];
    if (distinct.length === 1) hit = suffix[0];
    else if (distinct.length > 1) return json({ status: "ambiguous", count: distinct.length });
  }

  if (!hit) return json({ status: "miss" });

  const countsKey = `v1:dpick:${league}:${team}:${position}`;
  const rawCounts = await env.DEPTH_KV.get(countsKey);
  const counts = rawCounts ? JSON.parse(rawCounts) : {};
  const pct = estPickPct(hit, counts);
  const pts = ptsFromPct(pct);

  counts[hit.key] = (counts[hit.key] || 0) + 1;
  counts.__total = (counts.__total || 0) + 1;
  await env.DEPTH_KV.put(countsKey, JSON.stringify(counts));

  return json({
    status: "hit",
    name: hit.name,
    tier: hit.tier,
    key: hit.key,
    pct: Math.round(pct * 10) / 10,
    pts,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors() });
    }

    if (url.pathname === "/pick" && request.method === "POST") {
      return handlePick(request, env);
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
      // dpick:* (shared pick-rate counters) can only be written via /pick now —
      // this is the actual fix, not a formality.
      if (/^dpick:/.test(key)) return json({ error: "use /pick" }, 403);
      const payload = JSON.stringify(value);
      if (payload.length > 256 * 1024) return json({ error: "too large" }, 413);
      const opts = /:\d{4}-\d{2}-\d{2}/.test(key) ? { expirationTtl: 864000 } : {};
      await env.DEPTH_KV.put("v1:" + key, payload, opts);
      return json({ ok: true });
    }

    if (url.pathname === "/") return json({ ok: true, service: "any-given-player" });
    return json({ error: "not found" }, 404);
  },
};
