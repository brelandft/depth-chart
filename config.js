/* ============================================================
   Depth Chart — runtime config
   Edit these values without rebuilding app.js.
   ============================================================ */
window.DEPTH_CONFIG = {
  // Display name. Last word is highlighted gold in the header.
  brand: "Depth Chart",

  // Short tag used in the share text (e.g. "DEPTH CHART #12 — NFL 7").
  brandShort: "DEPTH CHART",

  // Shared pick-rates + percentile backend.
  // Leave "" to run fully offline (per-device pick rates, no global percentile).
  // Once you deploy the Cloudflare Worker in /worker, paste its URL here:
  //   backendUrl: "https://depth-chart-api.YOURNAME.workers.dev"
  backendUrl: "",
};
