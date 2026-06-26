# Depth Chart

A daily football roster-recall game. Name the obscure players: fill a position
board where every spot is a different team, and the fewer people who pick a
player, the more he's worth. Covers ~33,000 entries across 55 years of NFL and
college rosters, all nine position groups.

- **Daily 7** — skill positions (QB/RB/WR/TE). The casual, shareable core.
- **Daily 11** — full offense including the line. The challenge tier.
- **Endless** — name an entire league's roster, position by position, on a US map.

The app is a single static bundle. It runs fully offline per-device with zero
backend. A small Cloudflare Worker (included) adds the *shared* pick-rates and
the "better than X% of players" line when you're ready.

---

## Files

```
index.html        page shell — loads config.js, data.js, app.js
config.js         brand name + backend URL (edit freely, no rebuild)
data.js           the roster dataset (gzip+base64); regenerate independently
app.js            bundled React app (build artifact — do not hand-edit)
src/app.jsx       app source; rebuild app.js after changing this
worker/           Cloudflare Worker for shared pick-rates (optional)
scripts/          data pipeline notes + curated overlays
build.sh          rebuilds app.js from src/app.jsx
```

---

## 1. Preview locally

Any static server works (you can't `file://` it — the browser blocks module
fetches). From this folder:

```bash
npx serve .
# or:  python3 -m http.server 8000
```

Open the printed URL.

## 2. Deploy to GitHub Pages

```bash
git init && git add . && git commit -m "Depth Chart"
git branch -M main
git remote add origin https://github.com/<you>/depth-chart.git
git push -u origin main
```

In the repo: **Settings → Pages → Build and deployment → Source: Deploy from a
branch → `main` / root**. Your game is live at
`https://<you>.github.io/depth-chart/` in a minute or two.

For a custom domain, add a `CNAME` file containing your domain and point the
DNS at GitHub Pages (Settings → Pages → Custom domain walks you through it).

## 3. Rename / rebrand

Everything is in **`config.js`** — no rebuild needed:

```js
window.DEPTH_CONFIG = {
  brand: "Depth Chart",        // last word renders gold in the header
  brandShort: "DEPTH CHART",   // used in the share text
  backendUrl: "",
};
```

Also update the `<title>` and og: tags in `index.html` for SEO/social.

## 4. Turn on shared pick-rates (the global percentile)

Without this, pick rates are per-device and the percentile line is hidden —
the game is fully playable, just not "social." To enable the shared layer:

```bash
cd worker
npm i -g wrangler            # if you don't have it
wrangler login
wrangler kv namespace create DEPTH_KV   # prints an id
# paste that id into wrangler.toml
wrangler deploy             # prints https://depth-chart-api.<you>.workers.dev
```

Then put that URL in `config.js`:

```js
backendUrl: "https://depth-chart-api.<you>.workers.dev",
```

Commit, push, done. The app auto-detects the backend; if a request ever fails
it silently falls back to local storage, so a Worker outage never breaks play.
(Tighten `ALLOW_ORIGIN` in `worker/worker.js` to your domain before launch.)

## 5. Rebuild app.js after editing src/app.jsx

```bash
./build.sh
# (npm install first, once, to pull react + esbuild)
```

## 6. Regenerate the roster data (recommended before launch)

`data.js` is generated, not hand-written. To rebuild it from full **nflverse**
rosters — which closes the post-2019 and deep-era gaps and is the single most
important pre-launch task:

```bash
pip install nflreadpy polars
cd scripts && python build_nflverse.py     # writes ../data.js in place
```

Tweak any mis-rated player in `scripts/overlay_tiers.csv`. Full details, options,
and the path to objective (Pro-Bowl-based) tiers are in **`scripts/README.md`**.

---

## How scoring works

Each correct pick scores `100 − pick%`: name the guy everyone names and you
get a little; dig up a deep cut nobody remembers and you get a lot. Pick rates
blend a rarity prior with live crowd data (once the backend is on). Your board
resolves to a football rank — Camp Cut up through Hall of Famer — based on how
much you filled *and* how rare your pulls were.

## Tech notes

- No framework server, no build step at deploy time — just static files.
- Data is gzipped and decoded in-browser via `DecompressionStream`
  (supported in all current evergreen browsers).
- Personal progress: `localStorage`. Shared counters: Worker + KV, last-write-
  wins (fine for statistical pick-rates at launch scale; move hot keys to a
  Durable Object if you ever need atomic increments).
