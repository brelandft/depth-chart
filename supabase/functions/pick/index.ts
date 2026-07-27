// POST /pick { league, team, position, guess }
//
// The only path allowed to write a pick_counts row (see migration —
// kv_store rejects dpick-style writes directly). Validates the guess
// against the Worker's own copy of the public roster data using the same
// fuzzy-match rules as the client, then scores it using the same
// estPickPct/ptsFromPct math — so a client can never just assert "I got
// this right" and inflate the shared rarity stat for everyone else.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getServiceKey } from "../_shared/env.ts";
import { norm, lev1, estPickPct, ptsFromPct, cors } from "../_shared/match.ts";
import { getRoster } from "../_shared/roster.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  getServiceKey()
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors() });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method" }), { status: 405, headers: cors() });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "bad json" }), { status: 400, headers: cors() });
  }
  const { league, team, position, guess } = body || {};

  if (!["nfl", "cfb"].includes(league))
    return new Response(JSON.stringify({ error: "bad league" }), { status: 400, headers: cors() });
  if (typeof team !== "string" || team.length > 8)
    return new Response(JSON.stringify({ error: "bad team" }), { status: 400, headers: cors() });
  if (typeof position !== "string" || position.length > 8)
    return new Response(JSON.stringify({ error: "bad position" }), { status: 400, headers: cors() });
  if (typeof guess !== "string" || guess.length > 80)
    return new Response(JSON.stringify({ error: "bad guess" }), { status: 400, headers: cors() });

  const roster = await getRoster();
  const list = roster[league]?.[team]?.[position];
  if (!list)
    return new Response(JSON.stringify({ error: "unknown team/position" }), { status: 400, headers: cors() });

  const g = norm(guess);
  if (!g) return new Response(JSON.stringify({ status: "miss" }), { headers: cors() });

  let hit = list.find(
    (p) => p.key === g || (g.length >= 8 && Math.abs(p.key.length - g.length) <= 1 && p.key[0] === g[0] && lev1(g, p.key) <= 1)
  );

  if (!hit) {
    const suffix = list.filter((p) => p.key.endsWith(" " + g));
    const distinct = [...new Set(suffix.map((p) => p.key))];
    if (distinct.length === 1) hit = suffix[0];
    else if (distinct.length > 1)
      return new Response(JSON.stringify({ status: "ambiguous", count: distinct.length }), { headers: cors() });
  }

  if (!hit) return new Response(JSON.stringify({ status: "miss" }), { headers: cors() });

  // Snapshot current counts for this slot to compute the score...
  const { data: rows, error: selErr } = await supabase
    .from("pick_counts")
    .select("player_key, count")
    .eq("league", league)
    .eq("team", team)
    .eq("position", position);

  if (selErr) {
    return new Response(JSON.stringify({ error: "db read failed" }), { status: 500, headers: cors() });
  }

  const total = (rows || []).reduce((s, r) => s + Number(r.count), 0);
  const mine = (rows || []).find((r) => r.player_key === hit!.key)?.count ?? 0;
  const pct = estPickPct(hit.tier, Number(mine), total);
  const pts = ptsFromPct(pct);

  // ...then increment atomically. This is the actual concurrency fix vs.
  // the old KV read-modify-write blob: two simultaneous picks on the same
  // player can no longer clobber each other's count.
  const { error: rpcErr } = await supabase.rpc("increment_pick", {
    p_league: league,
    p_team: team,
    p_position: position,
    p_player_key: hit.key,
  });
  if (rpcErr) {
    return new Response(JSON.stringify({ error: "db write failed" }), { status: 500, headers: cors() });
  }

  return new Response(
    JSON.stringify({
      status: "hit",
      name: hit.name,
      tier: hit.tier,
      key: hit.key,
      pct: Math.round(pct * 10) / 10,
      pts,
    }),
    { headers: cors() }
  );
});
