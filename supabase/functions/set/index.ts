// POST /set { key, value } -> { ok: true }
//
// Same guard as the Cloudflare version had: dpick:* is off-limits here —
// that's what /pick is for. This endpoint is for the lower-stakes shared
// keys (score totals for the percentile calc, etc).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getServiceKey } from "../_shared/env.ts";
import { cors, okKey } from "../_shared/match.ts";

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
  const { key, value } = body || {};

  if (!okKey(key)) {
    return new Response(JSON.stringify({ error: "bad key" }), { status: 400, headers: cors() });
  }
  if (/^dpick:/.test(key)) {
    return new Response(JSON.stringify({ error: "use /pick" }), { status: 403, headers: cors() });
  }

  const payload = JSON.stringify(value);
  if (payload.length > 256 * 1024) {
    return new Response(JSON.stringify({ error: "too large" }), { status: 413, headers: cors() });
  }

  const { error } = await supabase
    .from("kv_store")
    .upsert({ key, value, updated_at: new Date().toISOString() });

  if (error) {
    return new Response(JSON.stringify({ error: "db write failed" }), { status: 500, headers: cors() });
  }

  return new Response(JSON.stringify({ ok: true }), { headers: cors() });
});
