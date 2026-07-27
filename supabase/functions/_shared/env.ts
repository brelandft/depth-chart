// Supabase is mid-migration from legacy JWT service_role keys to new
// sb_secret_... keys. New projects may not have a legacy key at all, so
// read the new format first and fall back to the old one.
export function getServiceKey(): string {
  const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeysRaw) {
    try {
      const parsed = JSON.parse(secretKeysRaw);
      const key = parsed.default ?? Object.values(parsed)[0];
      if (key) return key as string;
    } catch {
      // fall through to legacy
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}
