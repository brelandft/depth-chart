import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";

/* ---------- deploy config (set in config.js) ---------- */
const CFG = (typeof window !== "undefined" && window.DEPTH_CONFIG) || {};
const BRAND = CFG.brand || "Depth Chart";
const BRAND_SHORT = CFG.brandShort || BRAND.toUpperCase();
const BACKEND_URL = CFG.backendUrl || "";  // e.g. "https://depth-chart-api.you.workers.dev"


/* ============================================================
   WR DEEP CUTS v3 — full modern-era rosters, every position
   23k NFL stints (1970-2025) + 10k college entries, 9 position
   groups, endless map mode + 22-man daily formation.
   Data: nflverse-ecosystem open sources, merged + tiered.
   ============================================================ */

/* ---------- utilities ---------- */
const norm = (s) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/['’.\-]/g, "").replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
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

function hashStr(s) {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const localDateStr = () => {
  const d = new Date(); const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const GROUPS = ["QB","RB","WR","TE","OL","DL","LB","CB","S"];
const TIER_PRIOR = { 1: 42, 2: 24, 3: 12, 4: 5, 5: 1.5 };
const TIER_LABEL = { 1: "Household", 2: "Known", 3: "Solid pull", 4: "Deep cut", 5: "Certified deep cut" };
const TIER_COLOR = { 1: "#8A8F98", 2: "#A8B68E", 3: "#7FB069", 4: "#5BA8D4", 5: "#B07FE8" };
const LEAGUE_LABEL = { nfl: "NFL", cfb: "College" };

/* ---------- team metadata (ids must match payload keys) ---------- */
const TEAM_META = [
  ["ARI","Cardinals","nfl",33.53,-112.26],["ATL","Falcons","nfl",33.75,-84.40],
  ["BAL","Ravens","nfl",39.28,-76.62],["BUF","Bills","nfl",42.77,-78.79],
  ["CAR","Panthers","nfl",35.23,-80.84],["CHI","Bears","nfl",41.86,-87.62],
  ["CIN","Bengals","nfl",39.10,-84.51],["CLE","Browns","nfl",41.50,-81.70],
  ["DAL","Cowboys","nfl",32.75,-97.09],["DEN","Broncos","nfl",39.74,-105.02],
  ["DET","Lions","nfl",42.34,-83.05],["GB","Packers","nfl",44.50,-88.06],
  ["HOU","Texans","nfl",29.68,-95.41],["IND","Colts","nfl",39.76,-86.16],
  ["JAX","Jaguars","nfl",30.32,-81.64],["KC","Chiefs","nfl",39.05,-94.48],
  ["LV","Raiders","nfl",36.09,-115.18],["LAC","Chargers","nfl",33.90,-118.34],
  ["LAR","Rams","nfl",34.05,-118.25],["MIA","Dolphins","nfl",25.96,-80.24],
  ["MIN","Vikings","nfl",44.97,-93.26],["NE","Patriots","nfl",42.09,-71.26],
  ["NO","Saints","nfl",29.95,-90.08],["NYG","Giants","nfl",40.81,-74.10],
  ["NYJ","Jets","nfl",40.75,-74.00],["PHI","Eagles","nfl",39.90,-75.17],
  ["PIT","Steelers","nfl",40.45,-80.01],["SF","49ers","nfl",37.40,-121.97],
  ["SEA","Seahawks","nfl",47.60,-122.33],["TB","Buccaneers","nfl",27.98,-82.50],
  ["TEN","Titans","nfl",36.17,-86.77],["WAS","Commanders","nfl",38.91,-76.86],
  ["BAMA","Alabama","cfb",33.21,-87.55],["OSU","Ohio State","cfb",40.00,-83.02],
  ["USC","USC","cfb",34.01,-118.29],["LSU","LSU","cfb",30.41,-91.18],
  ["CLEM","Clemson","cfb",34.68,-82.84],["OU","Oklahoma","cfb",35.21,-97.44],
  ["TEX","Texas","cfb",30.28,-97.73],["TAMU","Texas A&M","cfb",30.61,-96.34],
  ["UGA","Georgia","cfb",33.95,-83.37],["FLA","Florida","cfb",29.65,-82.35],
  ["FSU","Florida State","cfb",30.44,-84.30],["MIAU","Miami","cfb",25.72,-80.28],
  ["MICH","Michigan","cfb",42.27,-83.74],["PSU","Penn State","cfb",40.81,-77.86],
  ["ND","Notre Dame","cfb",41.70,-86.24],["UT","Tennessee","cfb",35.95,-83.93],
  ["ORE","Oregon","cfb",44.06,-123.07],["OKST","Oklahoma State","cfb",36.13,-97.07],
  ["WISC","Wisconsin","cfb",43.07,-89.41],["AUB","Auburn","cfb",32.60,-85.49],
  ["MISS","Ole Miss","cfb",34.36,-89.54],["MSST","Mississippi State","cfb",33.46,-88.79],
  ["ARK","Arkansas","cfb",36.07,-94.17],["SCAR","South Carolina","cfb",34.00,-81.02],
  ["UK","Kentucky","cfb",38.02,-84.50],["MIZZ","Missouri","cfb",38.94,-92.33],
  ["VAN","Vanderbilt","cfb",36.10,-86.85],["MSU","Michigan State","cfb",42.73,-84.48],
  ["IOWA","Iowa","cfb",41.66,-91.55],["NEB","Nebraska","cfb",40.82,-96.70],
  ["ILL","Illinois","cfb",40.10,-88.23],["IU","Indiana","cfb",39.17,-86.52],
  ["PUR","Purdue","cfb",40.43,-86.92],["MINN","Minnesota","cfb",44.90,-93.18],
  ["UMD","Maryland","cfb",39.05,-76.99],["UW","Washington","cfb",47.66,-122.25],
  ["UCLA","UCLA","cfb",34.07,-118.44],["CAL","California","cfb",37.87,-122.26],
  ["STAN","Stanford","cfb",37.43,-122.17],["BAY","Baylor","cfb",31.55,-97.11],
  ["TCU","TCU","cfb",32.71,-97.36],["TTU","Texas Tech","cfb",33.58,-101.87],
  ["WVU","West Virginia","cfb",39.65,-79.95],["KSU","Kansas State","cfb",39.19,-96.58],
  ["COLO","Colorado","cfb",40.01,-105.27],["ASU","Arizona State","cfb",33.42,-111.93],
  ["ARIZ","Arizona","cfb",32.23,-110.95],["UTAH","Utah","cfb",40.76,-111.85],
  ["WSU","Washington State","cfb",46.73,-117.16],["ORST","Oregon State","cfb",44.56,-123.28],
  ["NCST","NC State","cfb",35.72,-78.55],["UNC","North Carolina","cfb",35.92,-79.20],
  ["VT","Virginia Tech","cfb",37.23,-80.42],["PITT","Pittsburgh","cfb",40.44,-79.95],
  ["LOU","Louisville","cfb",38.21,-85.76],["CUSE","Syracuse","cfb",43.04,-76.14],
  ["GT","Georgia Tech","cfb",33.77,-84.40],["WAKE","Wake Forest","cfb",36.13,-80.28],
  ["DUKE","Duke","cfb",36.10,-78.85],["BC","Boston College","cfb",42.34,-71.17],
  ["UVA","Virginia","cfb",38.03,-78.51],["CINN","Cincinnati","cfb",39.13,-84.62],
  ["UH","Houston","cfb",29.72,-95.34],["BYU","BYU","cfb",40.25,-111.65],
  ["UCF","UCF","cfb",28.60,-81.20],["KU","Kansas","cfb",38.95,-95.25],
  ["ISU","Iowa State","cfb",42.03,-93.65],
];

/* ---------- payload (gzip+base64 of full dataset) ---------- */
const PAYLOAD_B64 = (typeof window !== "undefined" && window.DEPTH_DATA) || "";

async function loadPayload() {
  if (typeof DecompressionStream === "undefined")
    throw new Error("This browser can't decompress the roster database (needs DecompressionStream).");
  const bin = Uint8Array.from(atob(PAYLOAD_B64), (c) => c.charCodeAt(0));
  const stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(stream).text());
}

/* Build league structures from raw payload */
function buildLeague(raw, league) {
  const teams = [];
  const nameIndex = new Map(); // normName -> [{team, group, name, tier, y0, y1}]
  let total = 0;
  const groupTotals = Object.fromEntries(GROUPS.map((g) => [g, 0]));
  for (const [id, name, lg, lat, lon] of TEAM_META) {
    if (lg !== league) continue;
    const groups = raw[id] || {};
    const t = { id, name, lat, lon, groups: {}, count: 0 };
    for (const g of GROUPS) {
      const list = (groups[g] || []).map((e) => ({
        name: e[0], key: norm(e[0]), tier: e[1], y0: e[2] || 0, y1: e[3] || 0,
      }));
      list.sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
      t.groups[g] = list;
      t.count += list.length;
      groupTotals[g] += list.length;
      total += list.length;
      for (const p of list) {
        if (!nameIndex.has(p.key)) nameIndex.set(p.key, []);
        nameIndex.get(p.key).push({ team: id, group: g, ...p });
      }
    }
    teams.push(t);
  }
  return { teams, byId: Object.fromEntries(teams.map((t) => [t.id, t])), nameIndex, lastIndex: buildLastIndex(nameIndex), total, groupTotals };
}

function buildLastIndex(nameIndex) {
  const idx = new Map();
  for (const entries of nameIndex.values()) {
    const tok = entries[0].key.split(" ").pop();
    if (!idx.has(tok)) idx.set(tok, []);
    idx.get(tok).push(...entries);
  }
  return idx;
}

function findMatches(L, guess) {
  if (L.nameIndex.has(guess)) return L.nameIndex.get(guess);
  if (guess.length >= 8) {
    for (const [k, v] of L.nameIndex) {
      if (Math.abs(k.length - guess.length) <= 1 && k[0] === guess[0] && lev1(guess, k) <= 1) return v;
    }
  }
  return [];
}

/* Full-name first; then last-name (must be unambiguous).
   Returns {entries} on success, {ambiguous: n} if several players share the name. */
function resolveGuess(L, guess) {
  const full = findMatches(L, guess);
  if (full.length) return { entries: full };
  const tok = guess.split(" ").pop();
  const cands = (L.lastIndex.get(tok) || []).filter((e) => e.key.endsWith(" " + guess));
  const distinct = [...new Set(cands.map((e) => e.key))];
  if (distinct.length === 1) return { entries: cands };
  if (distinct.length > 1) return { entries: [], ambiguous: distinct.length };
  return { entries: [] };
}

/* ---------- storage: localStorage (personal) + optional remote (shared) ---------- */
const _mem = {};
const _lsGet = (k) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : (k in _mem ? _mem[k] : null); } catch { return k in _mem ? _mem[k] : null; } };
const _lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { _mem[k] = v; } };

const sGet = async (k, shared = false) => {
  if (shared && BACKEND_URL) {
    try {
      const r = await fetch(BACKEND_URL + "/get?key=" + encodeURIComponent(k), { mode: "cors" });
      if (r.ok) { const j = await r.json(); return j && "value" in j ? j.value : null; }
    } catch { /* fall through to local */ }
    return _lsGet(k);
  }
  return _lsGet(k);
};
const sSet = async (k, v, shared = false) => {
  if (shared && BACKEND_URL) {
    try {
      await fetch(BACKEND_URL + "/set", {
        method: "POST", mode: "cors", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: k, value: v }),
      });
      return;
    } catch { /* fall through to local */ }
  }
  _lsSet(k, v);
};

/* ---------- map ---------- */
const MAP_W = 980, MAP_H = 600;
const LON_MIN = -126, LON_MAX = -66, LAT_MIN = 23.5, LAT_MAX = 50.5;
const proj = (lon, lat) => [
  ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * MAP_W,
  ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * MAP_H,
];
const US_OUTLINE = [
  [-124.7,48.4],[-123.2,49.0],[-95.2,49.0],[-95.0,49.4],[-94.6,48.7],[-92.0,48.4],
  [-89.5,48.0],[-88.4,47.0],[-84.8,46.5],[-84.6,45.9],[-83.5,45.3],[-82.5,45.0],
  [-82.1,43.6],[-82.4,42.9],[-83.1,42.0],[-80.5,42.3],[-79.0,42.7],[-79.2,43.4],
  [-76.8,43.6],[-75.0,44.8],[-74.7,45.0],[-71.5,45.0],[-70.0,46.7],[-69.2,47.5],
  [-67.8,47.1],[-67.1,45.2],[-66.9,44.8],[-68.7,44.3],[-70.2,43.6],[-70.8,42.6],
  [-71.4,41.6],[-73.6,40.9],[-74.0,40.5],[-74.9,38.9],[-75.5,38.0],[-76.0,37.2],
  [-75.8,35.2],[-77.9,34.0],[-78.9,33.7],[-80.7,32.2],[-81.4,31.1],[-81.5,30.7],
  [-80.5,28.5],[-80.0,26.8],[-80.1,25.8],[-80.4,25.2],[-81.1,25.2],[-81.8,26.0],
  [-82.7,27.5],[-82.7,28.9],[-83.7,29.9],[-84.4,30.0],[-85.3,29.7],[-86.2,30.4],
  [-88.0,30.2],[-89.2,30.3],[-89.4,29.2],[-90.2,29.1],[-91.3,29.5],[-92.3,29.5],
  [-93.8,29.7],[-94.9,29.4],[-96.4,28.4],[-97.2,27.6],[-97.1,25.9],[-97.5,25.9],
  [-99.1,26.4],[-99.5,27.5],[-101.4,29.8],[-102.3,29.9],[-103.3,29.0],[-104.5,29.6],
  [-104.9,30.6],[-106.5,31.8],[-108.2,31.3],[-111.0,31.3],[-114.8,32.5],[-117.1,32.5],
  [-117.3,33.0],[-118.4,33.7],[-119.6,34.4],[-120.6,34.6],[-120.7,35.2],[-121.9,36.6],
  [-122.5,37.8],[-123.7,38.9],[-123.8,39.7],[-124.4,40.4],[-124.1,41.5],[-124.4,42.8],
  [-124.1,43.4],[-124.0,44.6],[-124.0,46.2],[-124.1,46.9],[-124.7,48.4],
];
const US_PATH = US_OUTLINE.map(([lo, la], i) => {
  const [x, y] = proj(lo, la);
  return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
}).join(" ") + " Z";

/* ---------- theme ---------- */
const THEME_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Graduate&family=Barlow+Condensed:wght@500;600;700&family=Barlow:wght@400;500;600&display=swap');
:root{
  --ink:#101318; --panel:#191E26; --panel2:#212834; --inset:#0C0F14;
  --line:rgba(232,229,221,.13); --line2:rgba(232,229,221,.22);
  --chalk:#EDEAE2; --dim:rgba(237,234,226,.58); --faint:rgba(237,234,226,.32);
  --gold:#F2B63B; --gold-deep:#C8902A; --miss:#E0584E; --turf:#22433A;
}
.wrq *{box-sizing:border-box;margin:0;padding:0}
.wrq{min-height:100vh;background:var(--ink);color:var(--chalk);
  font-family:'Barlow',system-ui,sans-serif;padding-bottom:90px}
.wrq .disp{font-family:'Graduate','Arial Black',sans-serif;letter-spacing:.04em}
.wrq .cond{font-family:'Barlow Condensed','Arial Narrow',sans-serif}
.wrq button{cursor:pointer;font-family:inherit}
.wrq .shell{max-width:1080px;margin:0 auto;padding:0 16px}
.wrq .card{background:var(--panel);border:1px solid var(--line);border-radius:8px}
.wrq .tab{background:none;border:1px solid var(--line2);color:var(--dim);
  padding:8px 18px;font-size:15px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;
  font-family:'Barlow Condensed',sans-serif;border-radius:4px;transition:all .15s}
.wrq .tab.on{background:var(--gold);border-color:var(--gold);color:#1a1206}
.wrq .minitab{background:none;border:1px solid var(--line);color:var(--dim);
  padding:3px 10px;font-size:12px;font-weight:600;letter-spacing:.06em;
  font-family:'Barlow Condensed',sans-serif;border-radius:3px}
.wrq .minitab.on{background:var(--panel2);border-color:var(--gold);color:var(--gold)}
.wrq .tab:focus-visible,.wrq input:focus-visible,.wrq button:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
.wrq .guessbox{width:100%;background:var(--inset);border:1px solid var(--line2);
  border-radius:6px;color:var(--chalk);font-size:18px;padding:13px 16px;letter-spacing:.02em}
.wrq .guessbox::placeholder{color:var(--faint)}
.wrq .guessbox.shake{animation:wrqshake .35s}
@keyframes wrqshake{0%,100%{transform:translateX(0)}25%{transform:translateX(-7px)}50%{transform:translateX(6px)}75%{transform:translateX(-4px)}}
@keyframes wrqpop{0%{transform:scale(.92);opacity:0}100%{transform:scale(1);opacity:1}}
@keyframes wrqslide{0%{transform:translateY(-6px);opacity:0}100%{transform:translateY(0);opacity:1}}
.wrq .pop{animation:wrqpop .25s ease-out}
.wrq .logrow{animation:wrqslide .25s ease-out}
.wrq .dot{transition:fill .4s, r .3s}
.wrq .dot:hover{stroke:var(--gold)!important;cursor:pointer}
.wrq .panelrow{display:flex;justify-content:space-between;align-items:center;
  border-bottom:1px dashed rgba(232,229,221,.1);padding:6px 2px;font-size:15px}
.wrq .chip{display:inline-block;font-family:'Barlow Condensed',sans-serif;font-size:12px;
  font-weight:600;letter-spacing:.05em;border:1px solid var(--line2);border-radius:3px;
  padding:1px 6px;margin:1px 2px;color:var(--dim)}
.wrq .slot{cursor:pointer;transition:transform .15s;transform-box:fill-box;transform-origin:center}
.wrq .slot:hover{transform:scale(1.05)}
.wrq .statnum{font-family:'Graduate','Arial Black',sans-serif;font-size:22px;color:var(--chalk);line-height:1}
.wrq .statlab{font-family:'Barlow Condensed',sans-serif;font-size:11px;color:var(--dim);
  letter-spacing:.14em;text-transform:uppercase;margin-top:4px}
@media (prefers-reduced-motion: reduce){.wrq *{animation:none!important;transition:none!important}}
`;

const TierTag = ({ tier }) => (
  <span className="cond" style={{
    fontSize: 12, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase",
    color: TIER_COLOR[tier], border: `1px solid ${TIER_COLOR[tier]}55`,
    borderRadius: 3, padding: "1px 7px", whiteSpace: "nowrap",
  }}>{TIER_LABEL[tier]}</span>
);

const Toast = ({ msg }) =>
  !msg ? null : (
    <div className="pop cond" style={{
      position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
      background: "var(--panel2)", border: "1px solid var(--gold)", color: "var(--chalk)",
      padding: "10px 20px", borderRadius: 6, fontSize: 16, zIndex: 50, maxWidth: "92vw",
      boxShadow: "0 8px 30px rgba(0,0,0,.55)", textAlign: "center",
    }}>{msg}</div>
  );

/* ============================================================
   ENDLESS MODE — full-roster boards, position categories
   ============================================================ */
function EndlessMode({ league, L, toast }) {
  const [found, setFound] = useState(() => new Set());
  const [log, setLog] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [openTeam, setOpenTeam] = useState(null);
  const [panelGroup, setPanelGroup] = useState("QB");
  const [scope, setScope] = useState("WR");
  const [shake, setShake] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    setOpenTeam(null);
    (async () => {
      const [savedFound, savedLog] = await Promise.all([
        sGet(`endless_found_v4:${league}`), sGet(`endless_log_v4:${league}`),
      ]);
      setFound(new Set(savedFound || []));
      setLog(savedLog || []);
      setLoaded(true);
    })();
  }, [league]);

  const isAll = scope === "ALL";
  const scopeTotal = isAll ? L.total : L.groupTotals[scope];

  const foundEntries = useMemo(() => {
    const arr = [];
    for (const k of found) {
      const [tid, g, key] = k.split("|");
      const p = L.byId[tid]?.groups[g]?.find((x) => x.key === key);
      if (p) arr.push({ ...p, team: tid, group: g });
    }
    return arr;
  }, [found, L]);

  const scopedEntries = useMemo(
    () => (isAll ? foundEntries : foundEntries.filter((p) => p.group === scope)),
    [foundEntries, scope, isAll]
  );
  const scopedLog = useMemo(
    () => (isAll ? log : log.filter((e) => e.group === scope)),
    [log, scope, isAll]
  );

  const pct = scopeTotal ? (scopedEntries.length / scopeTotal) * 100 : 0;
  const score = useMemo(() => scopedEntries.reduce((a, p) => a + p.tier, 0), [scopedEntries]);

  const groupCounts = useMemo(() => {
    const c = Object.fromEntries(GROUPS.map((g) => [g, 0]));
    for (const p of foundEntries) c[p.group]++;
    return c;
  }, [foundEntries]);

  const tierCounts = useMemo(() => {
    const c = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const p of scopedEntries) c[p.tier]++;
    return c;
  }, [scopedEntries]);

  const scopeTierTotals = useMemo(() => {
    const c = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const t of L.teams)
      for (const g of GROUPS) {
        if (!isAll && g !== scope) continue;
        for (const p of t.groups[g]) c[p.tier]++;
      }
    return c;
  }, [L, scope, isAll]);

  const bestPull = useMemo(
    () => scopedLog.reduce((b, e) => (e.teams.length > (b?.teams.length || 0) ? e : b), null),
    [scopedLog]
  );

  const submit = () => {
    const el = inputRef.current;
    if (!el) return;
    const g = norm(el.value);
    if (!g) return;
    const res = resolveGuess(L, g);
    if (res.ambiguous) {
      setShake(true); setTimeout(() => setShake(false), 380);
      toast(`${res.ambiguous} different players match that last name — give me a full name.`);
      el.select();
      return;
    }
    const matches = res.entries;
    if (!matches.length) {
      setShake(true); setTimeout(() => setShake(false), 380);
      toast("No match on this board — check spelling, or switch leagues.");
      el.focus();
      return;
    }
    const inScope = isAll ? matches : matches.filter((m) => m.group === scope);
    if (!inScope.length) {
      setShake(true); setTimeout(() => setShake(false), 380);
      toast(`${matches[0].name} is a ${matches[0].group} — you're hunting ${scope}s right now.`);
      el.select();
      return;
    }
    const credits = inScope.filter((m) => !found.has(`${m.team}|${m.group}|${m.key}`));
    if (credits.length) {
      const next = new Set(found);
      credits.forEach((m) => next.add(`${m.team}|${m.group}|${m.key}`));
      setFound(next);
      sSet(`endless_found_v4:${league}`, [...next]);
      const entry = {
        name: credits[0].name,
        group: credits[0].group,
        teams: [...new Set(credits.map((m) => m.team))],
        maxTier: Math.max(...credits.map((m) => m.tier)),
        pts: credits.reduce((a, m) => a + m.tier, 0),
        t: Date.now(),
      };
      const nextLog = [entry, ...log].slice(0, 80);
      setLog(nextLog);
      sSet(`endless_log_v4:${league}`, nextLog);
      toast(
        entry.teams.length > 1
          ? `${entry.name} (${entry.group}) — journeyman! ${entry.teams.length} teams, +${entry.pts} pts`
          : `${entry.name} (${entry.group}) — ${TIER_LABEL[entry.maxTier].toLowerCase()}, +${entry.pts} pts`
      );
      el.value = "";
    } else {
      toast(`${inScope[0].name}'s already on your ${LEAGUE_LABEL[league]} board.`);
      el.value = "";
    }
    el.focus();
  };

  const foundPerTeam = useMemo(() => {
    const m = {};
    for (const p of scopedEntries) m[p.team] = (m[p.team] || 0) + 1;
    return m;
  }, [scopedEntries]);
  const teamScopeTotal = (t) => (isAll ? t.count : t.groups[scope].length);

  const dotFill = (frac) =>
    frac <= 0 ? "#2A3140" : frac >= 1 ? "var(--gold)" : `rgba(242,182,59,${(0.18 + frac * 0.78).toFixed(2)})`;

  const open = openTeam ? L.byId[openTeam] : null;
  const openFound = open
    ? open.groups[panelGroup].filter((p) => found.has(`${open.id}|${panelGroup}|${p.key}`))
    : [];

  return (
    <div>
      {/* scoreboard strip */}
      <div className="card" style={{ display: "flex", gap: 26, flexWrap: "wrap", alignItems: "center", padding: "14px 18px", margin: "16px 0 12px" }}>
        <div>
          <div className="disp" style={{ fontSize: "clamp(30px,5vw,44px)", color: "var(--gold)", lineHeight: 1 }}>{pct.toFixed(2)}%</div>
          <div className="statlab">{LEAGUE_LABEL[league]} {isAll ? "board" : scope + "s"} named</div>
        </div>
        <div><div className="statnum">{scopedEntries.length.toLocaleString()}<span style={{ color: "var(--faint)", fontSize: 15 }}>/{scopeTotal.toLocaleString()}</span></div><div className="statlab">Entries found</div></div>
        <div><div className="statnum" style={{ color: "var(--gold)" }}>{score.toLocaleString()}</div><div className="statlab">Rarity score</div></div>
        <div><div className="statnum">{scopedLog.length}</div><div className="statlab">Correct calls</div></div>
        {bestPull && (
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <div className="cond" style={{ fontSize: 16, fontWeight: 700 }}>{bestPull.name} · {bestPull.teams.length} teams</div>
            <div className="statlab">Best journeyman pull</div>
          </div>
        )}
      </div>

      {/* position scope */}
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <span className="cond" style={{ fontSize: 13, color: "var(--dim)", letterSpacing: ".12em", textTransform: "uppercase", marginRight: 4 }}>Hunting:</span>
        {GROUPS.map((g) => (
          <button key={g} className={`minitab ${scope === g ? "on" : ""}`} style={{ padding: "5px 12px", fontSize: 13 }}
            onClick={() => { setScope(g); setPanelGroup(g); }}>{g}</button>
        ))}
        <button className={`minitab ${isAll ? "on" : ""}`} style={{ padding: "5px 12px", fontSize: 13 }}
          onClick={() => setScope("ALL")}>Everything</button>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <input ref={inputRef} className={`guessbox ${shake ? "shake" : ""}`}
          placeholder={isAll
            ? `Name any ${LEAGUE_LABEL[league]} player — any position, any era since 1970`
            : `Name any ${LEAGUE_LABEL[league]} ${scope} — last names work if they're unique`}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          autoComplete="off" autoCorrect="off" spellCheck="false" />
        <button className="tab on" style={{ padding: "8px 26px", fontSize: 17 }} onClick={submit}>Call it</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.7fr) minmax(260px,1fr)", gap: 12 }} className="wrq-grid">
        <style>{`@media (max-width:760px){.wrq-grid{grid-template-columns:1fr!important}}`}</style>

        <div className="card" style={{ padding: 8, alignSelf: "start" }}>
          <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="US map of team progress">
            <path d={US_PATH} fill="rgba(237,234,226,.02)" stroke="rgba(237,234,226,.28)" strokeWidth="2" strokeLinejoin="round" />
            {L.teams.map((t) => {
              const [x, y] = proj(t.lon, t.lat);
              const got = foundPerTeam[t.id] || 0;
              const denom = teamScopeTotal(t);
              const frac = denom ? got / denom : 0;
              const r = league === "nfl" ? 23 : 15;
              return (
                <g key={t.id} onClick={() => { setOpenTeam(openTeam === t.id ? null : t.id); }} className="slot">
                  <circle className="dot" cx={x} cy={y} r={r}
                    fill={dotFill(frac)}
                    stroke={openTeam === t.id ? "var(--chalk)" : "rgba(237,234,226,.4)"}
                    strokeWidth={openTeam === t.id ? 3 : 1.5} />
                  <text x={x} y={y + 4.5} textAnchor="middle" fontSize={league === "nfl" ? 15 : 11} fontWeight="700"
                    fontFamily="'Barlow Condensed',sans-serif"
                    fill={frac > 0.45 ? "#1a1206" : "var(--chalk)"} style={{ pointerEvents: "none" }}>
                    {t.id}
                  </text>
                </g>
              );
            })}
          </svg>
          <div className="cond" style={{ padding: "6px 8px 4px", fontSize: 12, color: "var(--faint)", letterSpacing: ".06em" }}>
            Tap a team to open its locker room · dots fill gold as you clear {isAll ? "the roster" : "the " + scope + " room"}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          {/* categories */}
          <div className="card" style={{ padding: "12px 14px" }}>
            <div className="cond" style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--dim)", marginBottom: 8 }}>
              {isAll ? "By position group" : `What you've pulled · ${scope}`}
            </div>
            {isAll && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginBottom: 10 }}>
                {GROUPS.map((g) => (
                  <button key={g} onClick={() => { setScope(g); setPanelGroup(g); }}
                    style={{ background: "var(--inset)", borderRadius: 5, padding: "7px 9px", border: "1px solid var(--line)", textAlign: "left", color: "var(--chalk)" }}>
                    <div className="cond" style={{ fontSize: 12, fontWeight: 700, color: "var(--gold)", letterSpacing: ".08em" }}>{g}</div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{groupCounts[g]}<span style={{ color: "var(--faint)", fontSize: 11 }}>/{L.groupTotals[g]}</span></div>
                  </button>
                ))}
              </div>
            )}
            {[1, 2, 3, 4, 5].map((t) => {
              const got = tierCounts[t], tot = scopeTierTotals[t];
              return (
                <div key={t} style={{ marginBottom: 7 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span className="cond" style={{ color: TIER_COLOR[t], fontWeight: 700, letterSpacing: ".05em" }}>{TIER_LABEL[t]}</span>
                    <span style={{ color: "var(--dim)" }}>{got.toLocaleString()}/{tot.toLocaleString()}</span>
                  </div>
                  <div style={{ height: 4, background: "rgba(237,234,226,.08)", borderRadius: 2, marginTop: 3 }}>
                    <div style={{ height: "100%", width: `${tot ? Math.min(100, (got / tot) * 100) : 0}%`, background: TIER_COLOR[t], borderRadius: 2, transition: "width .4s" }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* guess log */}
          <div className="card" style={{ padding: "12px 14px", maxHeight: 420, overflowY: "auto" }}>
            <div className="cond" style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--dim)", marginBottom: 6 }}>
              Recent calls
            </div>
            {scopedLog.length === 0 && (
              <div style={{ color: "var(--faint)", fontSize: 14, padding: "8px 0" }}>
                Nothing on the tape yet. {scopeTotal.toLocaleString()} {isAll ? "names" : scope + " entries"} are out there — deep cuts pay 5x.
              </div>
            )}
            {scopedLog.slice(0, 30).map((e) => (
              <div key={e.t} className="logrow" style={{ borderBottom: "1px dashed rgba(237,234,226,.1)", padding: "7px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{e.name} <span className="cond" style={{ color: "var(--faint)", fontSize: 12 }}>{e.group}</span></span>
                  <span className="cond" style={{ color: "var(--gold)", fontWeight: 700, whiteSpace: "nowrap" }}>+{e.pts} pts</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 3, flexWrap: "wrap" }}>
                  <span style={{ minWidth: 0 }}>
                    {e.teams.map((id) => <span key={id} className="chip">{id}</span>)}
                    {e.teams.length > 1 && (
                      <span className="cond" style={{ fontSize: 12, color: "var(--gold)", marginLeft: 4 }}>×{e.teams.length} teams</span>
                    )}
                  </span>
                  <TierTag tier={e.maxTier} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* team locker room */}
      {open && (
        <div className="card pop" style={{ padding: "14px 16px", marginTop: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <div className="disp" style={{ fontSize: 22 }}>{open.name}</div>
            <div className="cond" style={{ color: "var(--dim)", fontSize: 14, letterSpacing: ".08em" }}>
              {(foundPerTeam[open.id] || 0)}/{open.count} named
            </div>
            <button className="tab" style={{ marginLeft: "auto", padding: "4px 12px", fontSize: 12 }} onClick={() => setOpenTeam(null)}>Close</button>
          </div>
          <div style={{ height: 5, background: "rgba(237,234,226,.08)", borderRadius: 3, margin: "10px 0 10px" }}>
            <div style={{ height: "100%", width: `${((foundPerTeam[open.id] || 0) / open.count) * 100}%`, background: "var(--gold)", borderRadius: 3, transition: "width .4s" }} />
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 10 }}>
            {GROUPS.map((g) => {
              const gotG = open.groups[g].filter((p) => found.has(`${open.id}|${g}|${p.key}`)).length;
              return (
                <button key={g} className={`minitab ${panelGroup === g ? "on" : ""}`} onClick={() => setPanelGroup(g)}>
                  {g} {gotG}/{open.groups[g].length}
                </button>
              );
            })}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: "0 22px" }}>
            {openFound.map((p) => (
              <div key={p.key + p.name} className="panelrow">
                <span style={{ fontWeight: 600 }}>{p.name}
                  {p.y0 > 0 && <span className="cond" style={{ color: "var(--faint)", fontSize: 12, marginLeft: 6 }}>
                    {p.y0 === p.y1 ? p.y0 : `${p.y0}–${String(p.y1).slice(2)}`}</span>}
                </span>
                <TierTag tier={p.tier} />
              </div>
            ))}
          </div>
          {open.groups[panelGroup].length - openFound.length > 0 && (
            <div className="cond" style={{ marginTop: 8, color: "var(--faint)", fontSize: 14 }}>
              + {open.groups[panelGroup].length - openFound.length} {panelGroup}{open.groups[panelGroup].length - openFound.length > 1 ? "s" : ""} still hidden in this room
            </div>
          )}
        </div>
      )}
      {!loaded && <div className="cond" style={{ marginTop: 8, color: "var(--dim)" }}>Loading your board…</div>}
    </div>
  );
}

/* ============================================================
   DAILY MODE — Daily 7 (skill, casual core) + Daily 11 (full
   offense, challenge). Re-roll mechanic, team-keyed pick rates,
   banded difficulty, percentile framing, streaks.
   ============================================================ */
const EPOCH = Date.UTC(2026, 5, 11); // day #1
const dayNumber = (dateStr) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Math.max(1, Math.round((Date.UTC(y, m - 1, d) - EPOCH) / 86400000) + 1);
};

/* layouts per format. band: 0 easy, 1 medium, 2 spicy */
const FORMATS = {
  seven: {
    label: "Daily 7", rerolls: 3,
    slots: [
      { g: "WR", x: 10, y: 33, band: 0 },
      { g: "TE", x: 66, y: 33, band: 1 },
      { g: "WR", x: 90, y: 31, band: 0 },
      { g: "QB", x: 50, y: 50, band: 0 },
      { g: "WR", x: 28, y: 43, band: 1 },
      { g: "RB", x: 40, y: 67, band: 0 },
      { g: "RB", x: 60, y: 67, band: 0 },
    ],
  },
  eleven: {
    label: "Daily 11", rerolls: 2,
    slots: [
      { g: "WR", x: 7,  y: 30, band: 0 },
      { g: "OL", x: 29, y: 33, band: 0 },
      { g: "OL", x: 39, y: 33, band: 1 },
      { g: "OL", x: 50, y: 33, band: 0 },
      { g: "OL", x: 61, y: 33, band: 2 },
      { g: "OL", x: 71, y: 33, band: 0 },
      { g: "TE", x: 84, y: 30, band: 1 },
      { g: "WR", x: 94, y: 27, band: 0 },
      { g: "QB", x: 50, y: 52, band: 0 },
      { g: "WR", x: 16, y: 46, band: 1 },
      { g: "RB", x: 50, y: 70, band: 0 },
    ],
  },
};
const BAND_MARK = ["", "▲", "▲▲"];
const BLUE_BLOODS = new Set(["BAMA","OSU","MICH","ND","USC","TEX","OU","UGA","LSU","PSU","FSU","MIAU","UT","NEB","CLEM","FLA","AUB","WISC","ORE"]);

function pairBand(t, g, league) {
  const list = t.groups[g] || [];
  if (!list.length) return 9;
  const t1 = list.filter((p) => p.tier === 1).length;
  const stars = list.filter((p) => p.tier <= 2).length;
  const t3 = list.filter((p) => p.tier === 3).length;
  const easy = league === "cfb" ? (t1 >= 1 && stars >= 2) : stars >= 2;
  if (easy) return 0;
  if (stars >= 1 || t3 >= 2) return 1;
  if (list.length >= 3 && (stars + t3) >= 1) return 2;
  return 9;
}

function buildWeightedPool(league, L, rng) {
  const pool = [];
  for (const t of L.teams) {
    pool.push(t);
    if (league === "cfb" && BLUE_BLOODS.has(t.id)) pool.push(t);
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

function pickDailySlots(dateStr, league, L, fmtKey) {
  const fmt = FORMATS[fmtKey];
  const rng = mulberry32(hashStr(`deep-cuts-${fmtKey}-${league}-${dateStr}`));
  const pool = buildWeightedPool(league, L, rng);
  const used = new Set();
  return fmt.slots.map((s) => {
    const grab = (pred) => pool.find((t) => !used.has(t.id) && pred(pairBand(t, s.g, league)));
    const team =
      grab((b) => b === s.band) || grab((b) => b < s.band) || grab((b) => b <= 2) ||
      pool.find((t) => !used.has(t.id) && (t.groups[s.g] || []).length > 0);
    used.add(team.id);
    return { ...s, team, actualBand: pairBand(team, s.g, league) };
  });
}

/* team-keyed pick rates: survives re-rolls (key = team|group|player) */
function estPickPct(player, slotCounts) {
  const prior = TIER_PRIOR[player.tier];
  const PRIOR_W = 20;
  const total = slotCounts?.__total || 0;
  const mine = slotCounts?.[player.key] || 0;
  return ((prior / 100) * PRIOR_W + mine) / (PRIOR_W + total) * 100;
}
const ptsFromPct = (pct) => Math.max(1, Math.round(100 - pct));
/* one source of truth: a point value -> performance bin (0 miss … 4 best) */
const ptsBin = (p) => (p <= 0 ? 0 : p >= 94 ? 4 : p >= 85 ? 3 : p >= 70 ? 2 : 1);
const BIN_EMOJI = ["⬛", "🟦", "🟩", "🟨", "🔥"];
const BIN_COLOR = ["#2A2E36", "#4F86C6", "#5FA86E", "#E8C24A", "#E8772E"];
const BIN_LABEL = ["missed", "chalk", "solid", "deep", "deep cut"];
const ptsEmoji = (p) => BIN_EMOJI[ptsBin(p)];

/* football rank grade from avg points/slot (rewards completion AND rarity) */
const RANKS = [
  [80, "Hall of Famer", "🏆"], [66, "All-Pro", "⭐"], [52, "Pro Bowler", "🏈"],
  [38, "Starter", "🟢"], [22, "Backup", "🔧"], [8, "Practice Squad", "📋"], [0, "Camp Cut", "✂️"],
];
function gradeFor(total, N) {
  const avg = N ? total / N : 0;
  let idx = RANKS.findIndex((r) => avg >= r[0]);
  if (idx < 0) idx = RANKS.length - 1;
  const next = idx > 0 ? RANKS[idx - 1] : null;
  return {
    title: RANKS[idx][1], icon: RANKS[idx][2], avg,
    next: next ? next[1] : null,
    toNext: next ? Math.max(1, Math.ceil((next[0] - avg) * N)) : 0,
  };
}

function DailyMode({ league, L, toast, fmtKey }) {
  const fmt = FORMATS[fmtKey];
  const dateStr = useMemo(localDateStr, []);
  const dayNum = useMemo(() => dayNumber(dateStr), [dateStr]);
  const baseSlots = useMemo(() => pickDailySlots(dateStr, league, L, fmtKey), [dateStr, league, L, fmtKey]);
  const [slots, setSlots] = useState(baseSlots);
  const [answers, setAnswers] = useState(() => baseSlots.map(() => null));
  const [rerolls, setRerolls] = useState(fmt.rerolls);
  const [sel, setSel] = useState(0);
  const [shake, setShake] = useState(false);
  const [pickCache, setPickCache] = useState({});
  const [pctile, setPctile] = useState(null);
  const [streak, setStreak] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const finishedRef = useRef(false);
  const inputRef = useRef(null);

  const stateKey = `daily_${fmtKey}_state:${league}:${dateStr}`;
  const totalsKey = `daily_${fmtKey}_totals:${league}:${dateStr}`;
  const streakKey = `daily_${fmtKey}_streak:${league}`;
  const pickKey = (team, g) => `dpick:${league}:${team}:${g}`; // shared, team-based

  useEffect(() => {
    setSlots(baseSlots); setAnswers(baseSlots.map(() => null));
    setRerolls(fmt.rerolls); setSel(0); setPctile(null); setLoaded(false);
    finishedRef.current = false;
    (async () => {
      const [saved, st] = await Promise.all([sGet(stateKey), sGet(streakKey)]);
      if (saved) {
        // restore re-rolled teams by id
        const restored = baseSlots.map((s, i) => {
          const tid = saved.teamIds?.[i];
          return tid && tid !== s.team.id
            ? { ...s, team: L.byId[tid], actualBand: pairBand(L.byId[tid], s.g, league) }
            : s;
        });
        setSlots(restored);
        setAnswers(saved.answers);
        setRerolls(saved.rerolls ?? fmt.rerolls);
        if (saved.answers.every((a) => a !== null)) finishedRef.current = true;
      }
      if (st) setStreak(st.n || 0);
      setLoaded(true);
    })();
  }, [stateKey, streakKey, baseSlots]);

  // lazily load shared pick pools for the teams currently on the board
  useEffect(() => {
    if (!loaded) return;
    (async () => {
      const next = {};
      for (const s of slots) {
        const k = pickKey(s.team.id, s.g);
        if (!(k in pickCache)) next[k] = (await sGet(k, true)) || {};
      }
      if (Object.keys(next).length) setPickCache((c) => ({ ...c, ...next }));
    })();
  }, [slots, loaded]);

  const done = answers.every((a) => a !== null);
  const total = answers.reduce((a, s) => a + (s?.pts || 0), 0);
  const hits = answers.filter((s) => s && !s.miss).length;
  const N = fmt.slots.length;

  const persist = (nextAnswers, nextRerolls, nextSlots) =>
    sSet(stateKey, {
      answers: nextAnswers, rerolls: nextRerolls,
      teamIds: (nextSlots || slots).map((s) => s.team.id),
    });

  useEffect(() => {
    if (!done || !loaded || finishedRef.current) return;
    finishedRef.current = true;
    (async () => {
      const totals = (await sGet(totalsKey, true)) || [];
      totals.push(total);
      await sSet(totalsKey, totals.slice(-5000), true);
      if (totals.length >= 10) setPctile(Math.round((totals.filter((x) => x < total).length / totals.length) * 100));
      const st = (await sGet(streakKey)) || { date: "", n: 0 };
      if (st.date !== dateStr) {
        const y = new Date(); y.setDate(y.getDate() - 1);
        const p = (n) => String(n).padStart(2, "0");
        const yest = `${y.getFullYear()}-${p(y.getMonth() + 1)}-${p(y.getDate())}`;
        const n = st.date === yest ? (st.n || 0) + 1 : 1;
        setStreak(n);
        await sSet(streakKey, { date: dateStr, n });
      }
    })();
  }, [done, loaded]);

  useEffect(() => {
    if (!done || !loaded || pctile !== null) return;
    (async () => {
      const totals = (await sGet(totalsKey, true)) || [];
      if (totals.length >= 10) setPctile(Math.round((totals.filter((x) => x < total).length / totals.length) * 100));
    })();
  }, [done, loaded]);

  const recordSharedPick = async (team, g, playerKey) => {
    const k = pickKey(team, g);
    const fresh = (await sGet(k, true)) || {};
    fresh[playerKey] = (fresh[playerKey] || 0) + 1;
    fresh.__total = (fresh.__total || 0) + 1;
    await sSet(k, fresh, true);
    setPickCache((c) => ({ ...c, [k]: fresh }));
  };

  const reroll = () => {
    if (rerolls <= 0 || answers[sel] !== null) return;
    const slot = slots[sel];
    const onBoard = new Set(slots.map((s) => s.team.id));
    const rng = mulberry32((Date.now() ^ (sel << 8)) >>> 0);
    const pool = buildWeightedPool(league, L, rng)
      .filter((t) => !onBoard.has(t.id) && pairBand(t, slot.g, league) <= 1);
    const cand = pool[0] || buildWeightedPool(league, L, rng).find((t) => !onBoard.has(t.id) && (t.groups[slot.g] || []).length >= 3);
    if (!cand) { toast("No fresh teams left to roll — you'll have to take this one."); return; }
    const nextSlots = slots.map((s, i) => i === sel ? { ...s, team: cand, actualBand: pairBand(cand, s.g, league) } : s);
    const nr = rerolls - 1;
    setSlots(nextSlots); setRerolls(nr); persist(answers, nr, nextSlots);
    toast(`🎲 Re-rolled — now a ${cand.name} ${slot.g}. ${nr} left.`);
    if (inputRef.current) { inputRef.current.value = ""; inputRef.current.focus(); }
  };

  const submit = () => {
    const el = inputRef.current;
    if (!el || done || answers[sel] !== null) return;
    const g = norm(el.value);
    if (!g) return;
    const slot = slots[sel];
    const list = slot.team.groups[slot.g];
    let hit = list.find(
      (p) => p.key === g || (g.length >= 8 && Math.abs(p.key.length - g.length) <= 1 && p.key[0] === g[0] && lev1(g, p.key) <= 1)
    );
    if (!hit) {
      const suffix = list.filter((p) => p.key.endsWith(" " + g));
      const distinct = [...new Set(suffix.map((p) => p.key))];
      if (distinct.length === 1) hit = suffix[0];
      else if (distinct.length > 1) {
        setShake(true); setTimeout(() => setShake(false), 380);
        toast(`${distinct.length} ${slot.team.name} ${slot.g}s share that name — full name to lock it.`);
        el.select(); return;
      }
    }
    const next = [...answers];
    if (hit) {
      const counts = pickCache[pickKey(slot.team.id, slot.g)];
      const pct = estPickPct(hit, counts);
      const pts = ptsFromPct(pct);
      next[sel] = { name: hit.name, tier: hit.tier, pts, pct, team: slot.team.id };
      setAnswers(next); persist(next, rerolls);
      recordSharedPick(slot.team.id, slot.g, hit.key);
      toast(`${hit.name} · ~${pct.toFixed(0)}% pick rate · +${pts} pts`);
    } else {
      const res = resolveGuess(L, g);
      if (res.ambiguous) {
        setShake(true); setTimeout(() => setShake(false), 380);
        toast("That last name matches several players — full name, no penalty.");
        el.select(); return;
      }
      if (!res.entries.length) {
        setShake(true); setTimeout(() => setShake(false), 380);
        toast("Not in the database at all — no harm, try another name.");
        el.focus(); return;
      }
      next[sel] = { miss: true, pts: 0, guess: el.value.trim() };
      setAnswers(next); persist(next, rerolls);
      setShake(true); setTimeout(() => setShake(false), 380);
      toast(rerolls > 0
        ? `Not a ${slot.team.name} ${slot.g} — spot's burned. Tip: 🎲 re-roll teams you don't know.`
        : `Not a ${slot.team.name} ${slot.g} — spot's burned.`);
    }
    el.value = "";
    const open = next.findIndex((a) => a === null);
    if (open >= 0) setSel(open);
    el.focus();
  };

  const shareText = () => {
    const row = answers.map((s) => ptsEmoji(s?.pts || 0)).join("");
    const best = [...answers].filter((s) => s && !s.miss).sort((a, b) => b.pts - a.pts)[0];
    const used = fmt.rerolls - rerolls;
    const grade = gradeFor(total, N);
    const lines = [
      `🏈 ${BRAND_SHORT} #${dayNum} — ${LEAGUE_LABEL[league]} ${N}`,
      `${grade.icon} ${grade.title} · ${total} pts · ${hits}/${N}${streak > 1 ? ` · 🔥${streak}` : ""}${used ? ` · 🎲${used}` : ""}`,
      row,
    ];
    if (pctile !== null) lines.push(`Better than ${pctile}% of today's players`);
    if (best) lines.push(`rarest pull: ${best.name}`);
    return lines.join("\n");
  };
  const copyShare = async () => {
    const txt = shareText();
    try { await navigator.clipboard.writeText(txt); setCopied(true); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = txt; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); setCopied(true); } catch {}
      document.body.removeChild(ta);
    }
    setTimeout(() => setCopied(false), 2000);
  };

  const isSeven = fmtKey === "seven";
  const FIELD_W = 760, FIELD_H = isSeven ? 520 : 600;
  const R = isSeven ? 40 : 30;             // bigger spots, esp. for 7
  const idFont = isSeven ? 19 : 15;
  const nameFont = isSeven ? 16 : 13;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap", margin: "16px 0 10px" }}>
        <div>
          <div className="disp" style={{ fontSize: "clamp(24px,5.5vw,36px)", lineHeight: 1.1 }}>
            <span style={{ color: "var(--gold)" }}>{LEAGUE_LABEL[league]} {N}</span> · Day #{dayNum}
          </div>
          <div className="cond" style={{ color: "var(--dim)", fontSize: 15, letterSpacing: ".06em", marginTop: 4 }}>
            {isSeven ? "The skill players. One per team, one guess each." : "Full offense — linemen and all. For the sickos."}
            {" "}· 🎲 {rerolls} re-rolls{ !isSeven && " · ▲ = deep water"}
          </div>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div className="disp" style={{ fontSize: 38, color: "var(--gold)", lineHeight: 1 }}>{total}</div>
          <div className="cond" style={{ fontSize: 13, color: "var(--dim)", letterSpacing: ".1em" }}>
            PTS · 🎲{"●".repeat(rerolls) || "0"} · {answers.filter((a) => a !== null).length}/{N}
            {streak > 1 ? ` · 🔥${streak}` : ""}
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 8, background: "var(--turf)", borderColor: "rgba(237,234,226,.2)" }}>
        <svg viewBox={`0 0 ${FIELD_W} ${FIELD_H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label={`Offensive formation, ${N} spots`}>
          {Array.from({ length: isSeven ? 5 : 6 }).map((_, i) => {
            const rows = isSeven ? 6 : 7;
            const y = (FIELD_H / rows) * (i + 1);
            const losRow = isSeven ? 1 : 1;
            return (
              <g key={i}>
                <line x1="0" x2={FIELD_W} y1={y} y2={y}
                  stroke={i === losRow ? "rgba(242,182,59,.5)" : "rgba(237,234,226,.22)"} strokeWidth={i === losRow ? 3 : 1.5} />
                {Array.from({ length: 26 }).map((_, h) => (
                  <line key={h} x1={28 + h * 28} x2={28 + h * 28} y1={y - 5} y2={y + 5} stroke="rgba(237,234,226,.1)" />
                ))}
              </g>
            );
          })}
          {slots.map((s, i) => {
            const x = (s.x / 100) * FIELD_W, y = (s.y / 100) * FIELD_H;
            const a = answers[i];
            const isSel = sel === i && !a;
            const fill = a ? (a.miss ? "rgba(224,88,78,.32)" : "var(--gold)") : isSel ? "rgba(237,234,226,.22)" : "rgba(16,19,24,.62)";
            const stroke = a ? (a.miss ? "var(--miss)" : "var(--gold-deep)") : isSel ? "var(--gold)" : "rgba(237,234,226,.5)";
            return (
              <g key={i} className="slot" onClick={() => !a && setSel(i)}>
                {isSel && <circle cx={x} cy={y} r={R + 9} fill="none" stroke="var(--gold)" strokeWidth="1.5" strokeDasharray="5 6" opacity=".9" />}
                <circle cx={x} cy={y} r={R} fill={fill} stroke={stroke} strokeWidth={isSel ? 3 : 2.5} />
                <text x={x} y={y - 3} textAnchor="middle" fontSize={idFont} fontWeight="700"
                  fontFamily="'Barlow Condensed',sans-serif" fill={a && !a.miss ? "#1a1206" : "var(--gold)"} style={{ pointerEvents: "none" }}>
                  {a ? (a.miss ? "✕" : `+${a.pts}`) : s.g}
                </text>
                <text x={x} y={y + idFont - 2} textAnchor="middle" fontSize={nameFont} fontWeight="700"
                  fontFamily="'Barlow Condensed',sans-serif" fill={a && !a.miss ? "#1a1206" : "var(--chalk)"} style={{ pointerEvents: "none" }}>
                  {s.team.id}
                </text>
                {!a && s.actualBand > 0 && (
                  <text x={x} y={y + R + 16} textAnchor="middle" fontSize="14" fill="rgba(242,182,59,.9)" style={{ pointerEvents: "none" }}>{BAND_MARK[s.actualBand]}</text>
                )}
                {a && !a.miss && (
                  <text x={x} y={y + R + 17} textAnchor="middle" fontSize={nameFont + 1} fontWeight="600" fill="var(--gold)" style={{ pointerEvents: "none" }}>
                    {a.name.split(" ").slice(-1)[0]}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {!done ? (
        <div style={{ marginTop: 16 }}>
          <div className="cond" style={{ marginBottom: 10, fontSize: 18, color: "var(--dim)" }}>
            Spot: <span style={{ color: "var(--gold)", fontWeight: 700 }}>{slots[sel].g} · {slots[sel].team.name}</span>
            {slots[sel].actualBand > 0 && <span style={{ color: "var(--gold)", marginLeft: 6 }}>{BAND_MARK[slots[sel].actualBand]} deep water</span>}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input ref={inputRef} className={`guessbox ${shake ? "shake" : ""}`} style={{ fontSize: 19, padding: "15px 18px", flex: "1 1 240px" }}
              placeholder={`A ${slots[sel].team.name} ${slots[sel].g}…`}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              autoComplete="off" autoCorrect="off" spellCheck="false" />
            <button className="tab on" style={{ padding: "10px 30px", fontSize: 18 }} onClick={submit}>Lock it</button>
            <button className="tab" style={{ padding: "10px 18px", fontSize: 16, opacity: rerolls > 0 ? 1 : 0.4 }}
              disabled={rerolls <= 0} onClick={reroll} title="Swap this team for a random different one">
              🎲 Re-roll ({rerolls})
            </button>
          </div>
          {!loaded && <div className="cond" style={{ marginTop: 8, color: "var(--dim)" }}>Syncing today's pick rates…</div>}
        </div>
      ) : (
        <div className="card pop" style={{ marginTop: 16, borderColor: "var(--gold)", padding: "20px" }}>
          {/* grade headline */}
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <div className="cond" style={{ fontSize: 12, letterSpacing: ".22em", color: "var(--dim)", textTransform: "uppercase" }}>Today's grade</div>
            <div className="disp" style={{ fontSize: "clamp(30px,7vw,46px)", color: "var(--gold)", lineHeight: 1.05, margin: "4px 0 6px" }}>
              {gradeFor(total, N).icon} {gradeFor(total, N).title}
            </div>
            <div className="cond" style={{ fontSize: 18, color: "var(--chalk)" }}>
              {total} pts · {hits}/{N} filled{fmt.rerolls - rerolls > 0 ? ` · 🎲 ${fmt.rerolls - rerolls}` : ""}{streak > 1 ? ` · 🔥 ${streak}` : ""}
            </div>
            {pctile !== null && (
              <div className="cond" style={{ color: "var(--gold)", fontSize: 15, marginTop: 4 }}>Better than {pctile}% of today's players</div>
            )}
          </div>

          {/* rank ladder */}
          <div style={{ display: "flex", gap: 3, marginBottom: 6 }}>
            {RANKS.slice().reverse().map((r) => {
              const reached = (N ? total / N : 0) >= r[0];
              const current = r[1] === gradeFor(total, N).title;
              return (
                <div key={r[1]} title={r[1]} style={{
                  flex: 1, height: 9, borderRadius: 3,
                  background: current ? "var(--gold)" : reached ? "var(--gold-deep)" : "rgba(237,234,226,.12)",
                }} />
              );
            })}
          </div>
          <div className="cond" style={{ textAlign: "center", fontSize: 13, color: "var(--dim)", marginBottom: 16 }}>
            {gradeFor(total, N).next
              ? `${gradeFor(total, N).toNext} more pts to ${gradeFor(total, N).next}`
              : "Top of the league — nothing left to prove."}
          </div>

          {/* at-a-glance color grid */}
          <div style={{ display: "flex", justifyContent: "center", gap: 7, flexWrap: "wrap", marginBottom: 10 }}>
            {answers.map((s, i) => {
              const bin = ptsBin(s?.pts || 0);
              return (
                <div key={i} title={`${slots[i].g} · ${slots[i].team.name}: ${s?.miss ? "missed" : BIN_LABEL[bin]}`}
                  style={{
                    width: 38, height: 38, borderRadius: 7, background: BIN_COLOR[bin],
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: bin === 0 ? "var(--miss)" : "#1a1206", fontWeight: 800, fontSize: 14,
                    fontFamily: "'Barlow Condensed',sans-serif",
                    border: bin === 0 ? "1px solid rgba(224,88,78,.5)" : "none",
                  }}>
                  {s?.miss ? "✕" : s ? `+${s.pts}` : ""}
                </div>
              );
            })}
          </div>
          {/* legend */}
          <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            {[1, 2, 3, 4].map((b) => (
              <span key={b} className="cond" style={{ fontSize: 12, color: "var(--dim)", display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: BIN_COLOR[b], display: "inline-block" }} />
                {BIN_LABEL[b]}{b === 1 ? " (common)" : b === 4 ? " (rarest)" : ""}
              </span>
            ))}
            <span className="cond" style={{ fontSize: 12, color: "var(--dim)", display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ color: "var(--miss)", fontWeight: 800 }}>✕</span> missed
            </span>
          </div>

          {/* per-slot detail */}
          {answers.map((a, i) => (
            <div key={i} className="panelrow" style={{ fontSize: 16 }}>
              <span><span style={{ color: "var(--dim)" }}>{slots[i].g} · {slots[i].team.name}:</span>{" "}
                {a.miss ? <span style={{ color: "var(--miss)" }}>missed{a.guess ? ` (${a.guess})` : ""}</span> : <strong>{a.name}</strong>}</span>
              <span style={{ color: "var(--gold)" }}>{a.miss ? "0" : `~${a.pct.toFixed(0)}% · +${a.pts}`}</span>
            </div>
          ))}
          <button className="tab on" style={{ marginTop: 16, padding: "11px 28px", fontSize: 16 }} onClick={copyShare}>
            {copied ? "Copied — go flex" : "Copy result"}
          </button>
        </div>
      )}
    </div>
  );
}


/* ============================================================
   APP
   ============================================================ */
export default function App() {
  const [mode, setMode] = useState("seven");
  const [league, setLeague] = useState("nfl");
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [toastMsg, setToastMsg] = useState("");
  const toastTimer = useRef(null);
  const toast = useCallback((m) => {
    setToastMsg(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(""), 2800);
  }, []);

  useEffect(() => {
    loadPayload()
      .then((raw) => setData({ nfl: buildLeague(raw.nfl, "nfl"), cfb: buildLeague(raw.cfb, "cfb") }))
      .catch((e) => setErr(e.message));
  }, []);

  const L = data?.[league];

  return (
    <div className="wrq">
      <style>{THEME_CSS}</style>
      <div className="shell">
        <header style={{ padding: "24px 0 6px", display: "flex", alignItems: "flex-end", flexWrap: "wrap", gap: 14 }}>
          <div>
            <div className="disp" style={{ fontSize: "clamp(28px,6vw,42px)", lineHeight: 1 }}>
              {BRAND.split(" ").map((w, i, a) => (
                <span key={i} style={i === a.length - 1 ? { color: "var(--gold)" } : undefined}>{w}{i < a.length - 1 ? " " : ""}</span>
              ))}
            </div>
            <div className="cond" style={{ color: "var(--dim)", letterSpacing: ".14em", textTransform: "uppercase", fontSize: 13, marginTop: 6 }}>
              {data
                ? `${data.nfl.total.toLocaleString()} NFL stints · ${data.cfb.total.toLocaleString()} college careers · every position`
                : "The boys-arguing-at-the-bar roster quiz"}
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 6 }}>
              <button className={`tab ${league === "nfl" ? "on" : ""}`} onClick={() => setLeague("nfl")}>NFL</button>
              <button className={`tab ${league === "cfb" ? "on" : ""}`} onClick={() => setLeague("cfb")}>College</button>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className={`tab ${mode === "seven" ? "on" : ""}`} onClick={() => setMode("seven")}>Daily 7</button>
              <button className={`tab ${mode === "eleven" ? "on" : ""}`} onClick={() => setMode("eleven")}>Daily 11</button>
              <button className={`tab ${mode === "endless" ? "on" : ""}`} onClick={() => setMode("endless")}>Endless</button>
            </div>
          </div>
        </header>

        {err && (
          <div className="card" style={{ padding: 18, borderColor: "var(--miss)", marginTop: 16 }}>
            Couldn't load the roster database: {err}
          </div>
        )}
        {!data && !err && (
          <div className="card" style={{ padding: 24, marginTop: 16, textAlign: "center" }}>
            <div className="disp" style={{ fontSize: 20, color: "var(--gold)" }}>Unpacking 33,000 rosters…</div>
            <div className="cond" style={{ color: "var(--dim)", marginTop: 6 }}>Five and a half decades of depth charts incoming.</div>
          </div>
        )}
        {L && (mode === "endless"
          ? <EndlessMode key={league} league={league} L={L} toast={toast} />
          : <DailyMode key={`${league}-${mode}`} league={league} L={L} toast={toast} fmtKey={mode} />)}

        <footer className="cond" style={{ marginTop: 26, color: "var(--faint)", fontSize: 13, letterSpacing: ".04em", lineHeight: 1.6 }}>
          Built from open data: every NFL draft class since 1967 (with school), full rosters 2006–2019 with
          games/starts/approximate-value, the current league snapshot, and a hand-checked legends overlay for
          the icons. College boards cover every drafted NFL player since 1970 from {""}67 power-conference programs. Rarity tiers are computed from career production and
          corrected by live pick rates. K/P/LS not included — the boys have standards.
        </footer>
      </div>
      <Toast msg={toastMsg} />
    </div>
  );
}

/* ---------- standalone mount ---------- */
import { createRoot } from "react-dom/client";
if (typeof document !== "undefined") {
  const el = document.getElementById("root");
  if (el) createRoot(el).render(<App />);
}
