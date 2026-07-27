/* ============================================================
   Any Given Player — runtime config
   Edit these values without rebuilding app.js.
   ============================================================ */
window.DEPTH_CONFIG = {
  // Display name. Last word is highlighted gold in the header.
  brand: "Any Given Player",

  // Short tag used in the share text (e.g. "ANY GIVEN PLAYER #12 — NFL 7").
  brandShort: "ANY GIVEN PLAYER",

  // Shared pick-rates + percentile backend (Supabase Edge Functions).
  // Leave "" to run fully offline (per-device pick rates, no global percentile).
  backendUrl: "https://jbdeflegiawsuxwcydsg.supabase.co/functions/v1",
};
