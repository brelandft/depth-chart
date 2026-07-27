// GET /get?key=<k> -> { value }  (null if unset)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getServiceKey } from "../_shared/env.ts";
import { cors, okKey } from "../_shared/match.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  getServiceKey()
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors() });
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "method" }), { status: 405, headers: cors() });
  }

  const url = new URL(req.url);
  const key = url.searchParams.get("key") || "";
  if (!okKey(key)) {
    return new Response(JSON.stringify({ error: "bad key" }), { status: 400, headers: cors() });
  }

  const { data, error } = await supabase.from("kv_store").select("value").eq("key", key).maybeSingle();
  if (error) {
    console.error("kv_store select failed:", JSON.stringify(error));
    return new Response(JSON.stringify({ error: "db read failed" }), { status: 500, headers: cors() });
  }

  return new Response(JSON.stringify({ value: data?.value ?? null }), { headers: cors() });
});
