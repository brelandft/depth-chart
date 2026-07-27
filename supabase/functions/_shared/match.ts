// Ported directly from src/app.jsx and worker/worker.js — same rules,
// same typo tolerance, same score curve. Keep these three in sync if the
// client-side matcher ever changes.

export const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/['\u2019.\-]/g, "").replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();

export function lev1(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 1) return 2;
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++)
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    prev = cur;
    if (Math.min(...prev) > 1) return 2;
  }
  return prev[n];
}

export const TIER_PRIOR: Record<number, number> = { 1: 42, 2: 24, 3: 12, 4: 5, 5: 1.5 };

export function estPickPct(tier: number, mine: number, total: number): number {
  const prior = TIER_PRIOR[tier];
  const PRIOR_W = 20;
  return (((prior / 100) * PRIOR_W + mine) / (PRIOR_W + total)) * 100;
}

export const ptsFromPct = (pct: number) => Math.max(1, Math.round(100 - pct));

export function cors(extra: Record<string, string> = {}) {
  return {
    "Access-Control-Allow-Origin": "*", // tighten to anygivenplayer.com once live
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, apikey, Authorization",
    "Content-Type": "application/json",
    ...extra,
  };
}

export const okKey = (k: unknown): k is string =>
  typeof k === "string" && k.length > 0 && k.length <= 256 && !/[\s"'\\]/.test(k);
