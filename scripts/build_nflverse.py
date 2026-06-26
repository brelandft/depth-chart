#!/usr/bin/env python3
"""
build_nflverse.py — regenerate Depth Chart's data.js from full nflverse rosters.

WHY THIS EXISTS
  The dataset shipped with the app was built in a sandbox that could not reach
  nflverse's release assets, so it leaned on a 2006-2019 production file plus
  hand-curated overlays. That left gaps: post-2019 moves and pre-2006 stints
  could reject correct answers. nflverse seasonal rosters are COMPLETE — every
  player, every team they were rostered on, every season, with their college —
  so regenerating from them closes those gaps and rebuilds the college boards
  automatically.

RUN THIS ON YOUR MACHINE (not in a sandbox — it downloads from nflverse):
    pip install nflreadpy polars
    python build_nflverse.py
  Output: ../data.js   (drop-in replacement; gzip+base64, same schema as before)

OPTIONS (env vars):
    DC_START_YEAR   first season to include (default 1999 — the era nflverse
                    rosters are complete for; you can try 1970 but pre-1999
                    coverage is partial)
    DC_END_YEAR     last season (default: current)
    DC_OUT          output path (default ../data.js)
    DC_OVERLAY      tier-override CSV (default overlay_tiers.csv if present)
"""

import os, re, gzip, base64, json, unicodedata, datetime, sys
from collections import defaultdict

try:
    import nflreadpy as nfl
    import polars as pl
except ImportError:
    sys.exit("Missing deps. Run:  pip install nflreadpy polars")

START_YEAR = int(os.environ.get("DC_START_YEAR", "1999"))
END_YEAR = int(os.environ.get("DC_END_YEAR", str(datetime.date.today().year)))
OUT = os.environ.get("DC_OUT", os.path.join(os.path.dirname(__file__), "..", "data.js"))
OVERLAY = os.environ.get("DC_OVERLAY", os.path.join(os.path.dirname(__file__), "overlay_tiers.csv"))

GROUPS = ["QB", "RB", "WR", "TE", "OL", "DL", "LB", "CB", "S"]

# ---------- helpers ----------
def norm(s):
    s = unicodedata.normalize("NFD", str(s).lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"['\u2019.\-]", "", s)
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", s)
    s = re.sub(r"[^a-z ]", "", s)
    return re.sub(r"\s+", " ", s).strip()

def col(df, *cands):
    """First matching column name present in the dataframe, else None."""
    for c in cands:
        if c in df.columns:
            return c
    return None

def to_group(pos):
    p = (pos or "").upper().strip()
    if p in ("QB",): return "QB"
    if p in ("RB", "FB", "HB", "TB"): return "RB"
    if p == "WR": return "WR"
    if p == "TE": return "TE"
    if p in ("T", "G", "C", "OT", "OG", "OL", "LT", "RT", "LG", "RG", "OC"): return "OL"
    if p in ("DE", "DT", "NT", "DL", "EDGE", "ED"): return "DL"
    if p in ("LB", "ILB", "OLB", "MLB", "RLB", "LLB", "RILB", "LILB", "ROLB", "LOLB"): return "LB"
    if p in ("CB", "RCB", "LCB", "DB"): return "CB"
    if p in ("S", "SS", "FS", "SAF"): return "S"
    return None

# nflverse mostly uses current abbreviations, but normalize relocations/legacy just in case.
TEAM_FIX = {"SD": "LAC", "STL": "LAR", "OAK": "LV", "LA": "LAR", "SL": "LAR",
            "PHO": "ARI", "ARZ": "ARI", "BLT": "BAL", "CLV": "CLE", "HST": "HOU",
            "JAC": "JAX", "KCC": "KC", "LVR": "LV", "NWE": "NE", "NOR": "NO",
            "GNB": "GB", "SFO": "SF", "TAM": "TB", "WSH": "WAS", "WFT": "WAS"}
NFL = {"ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE","DAL","DEN","DET","GB",
       "HOU","IND","JAX","KC","LV","LAC","LAR","MIA","MIN","NE","NO","NYG",
       "NYJ","PHI","PIT","SF","SEA","TB","TEN","WAS"}
def fix_team(t):
    t = (t or "").upper().strip()
    return TEAM_FIX.get(t, t)

# ---------- college program map (nflverse college name -> app program id) ----------
CFB = {
 "BAMA":["alabama"],"OSU":["ohio state"],"USC":["southern california","usc","southern cal"],
 "LSU":["lsu","louisiana state"],"CLEM":["clemson"],"OU":["oklahoma"],"TEX":["texas"],
 "TAMU":["texas am","texas a m","texas a&m"],"UGA":["georgia"],"FLA":["florida"],
 "FSU":["florida state"],"MIAU":["miami fl","miami florida","miami"],"MICH":["michigan"],
 "PSU":["penn state"],"ND":["notre dame"],"UT":["tennessee"],"ORE":["oregon"],
 "OKST":["oklahoma state"],"WISC":["wisconsin"],"AUB":["auburn"],"MISS":["mississippi","ole miss"],
 "MSST":["mississippi state"],"ARK":["arkansas"],"SCAR":["south carolina"],"UK":["kentucky"],
 "MIZZ":["missouri"],"VAN":["vanderbilt"],"MSU":["michigan state"],"IOWA":["iowa"],
 "NEB":["nebraska"],"ILL":["illinois"],"IU":["indiana"],"PUR":["purdue"],"MINN":["minnesota"],
 "UMD":["maryland"],"UW":["washington"],"UCLA":["ucla","california los angeles"],
 "CAL":["california","cal"],"STAN":["stanford"],"BAY":["baylor"],"TCU":["tcu","texas christian"],
 "TTU":["texas tech"],"WVU":["west virginia"],"KSU":["kansas state"],"COLO":["colorado"],
 "ASU":["arizona state"],"ARIZ":["arizona"],"UTAH":["utah"],"WSU":["washington state"],
 "ORST":["oregon state"],"NCST":["nc state","north carolina state"],"UNC":["north carolina"],
 "VT":["virginia tech"],"PITT":["pittsburgh","pitt"],"LOU":["louisville"],"CUSE":["syracuse"],
 "GT":["georgia tech"],"WAKE":["wake forest"],"DUKE":["duke"],"BC":["boston college"],
 "UVA":["virginia"],"CINN":["cincinnati"],"UH":["houston"],"BYU":["byu","brigham young"],
 "UCF":["ucf","central florida"],"KU":["kansas"],"ISU":["iowa state"],
}
COLLEGE_TO_ID = {}
for cid, variants in CFB.items():
    for v in variants:
        COLLEGE_TO_ID[v] = cid
def college_id(name):
    return COLLEGE_TO_ID.get(norm(name)) if name else None

# ---------- load ----------
print(f"Loading nflverse data {START_YEAR}-{END_YEAR} (this downloads a few hundred MB the first time)…")
seasons = list(range(START_YEAR, END_YEAR + 1))
ros = nfl.load_rosters(seasons)
players = nfl.load_players()
try:
    draft = nfl.load_draft_picks(True)
except Exception:
    draft = None
print(f"  rosters: {ros.height} rows | players: {players.height} | draft: {draft.height if draft is not None else 0}")

# resolve column names defensively (nflverse schemas drift over time)
c_season = col(ros, "season")
c_team   = col(ros, "team", "recent_team")
c_pos    = col(ros, "position", "depth_chart_position", "ngs_position")
c_name   = col(ros, "full_name", "player_name", "player_display_name", "football_name")
c_coll   = col(ros, "college")
c_pid    = col(ros, "gsis_id", "player_id", "pfr_id")
assert c_season and c_team and c_pos and c_name, f"unexpected roster columns: {ros.columns}"

# draft capital by player id / name
draft_round = {}
if draft is not None:
    d_pid = col(draft, "gsis_id", "pfr_player_id", "player_id", "pfr_id")
    d_name = col(draft, "pfr_player_name", "player_name", "full_name")
    d_round = col(draft, "round")
    for r in draft.iter_rows(named=True):
        rd = r.get(d_round)
        if rd is None: continue
        if d_pid and r.get(d_pid): draft_round[("id", r[d_pid])] = int(rd)
        if d_name and r.get(d_name): draft_round.setdefault(("nm", norm(r[d_name])), int(rd))

# college backfill from players master
pl_coll = {}
p_name = col(players, "display_name", "full_name", "player_name")
p_coll = col(players, "college_name", "college")
p_pid  = col(players, "gsis_id", "player_id")
if p_coll:
    for r in players.iter_rows(named=True):
        cnm = r.get(p_coll)
        if not cnm: continue
        if p_pid and r.get(p_pid): pl_coll[("id", r[p_pid])] = cnm
        if p_name and r.get(p_name): pl_coll.setdefault(("nm", norm(r[p_name])), cnm)

# ---------- accumulate stints ----------
# registry: pid -> {name, group, college, seasons:set, teams:{tid:{seasons:set}}}
reg = {}
for r in ros.iter_rows(named=True):
    grp = to_group(r.get(c_pos))
    if not grp: continue
    team = fix_team(r.get(c_team))
    if team not in NFL: continue
    season = r.get(c_season)
    name = r.get(c_name)
    if not name: continue
    pid = (r.get(c_pid) if c_pid else None) or ("nm:" + norm(name))
    p = reg.get(pid)
    if not p:
        p = reg[pid] = {"name": name, "group": grp, "college": (r.get(c_coll) if c_coll else None),
                        "seasons": set(), "teams": defaultdict(lambda: {"seasons": set()})}
    p["group"] = p["group"] or grp
    if season is not None:
        p["seasons"].add(season)
        p["teams"][team]["seasons"].add(season)
    if not p["college"] and c_coll and r.get(c_coll):
        p["college"] = r.get(c_coll)

# college backfill
for pid, p in reg.items():
    if not p["college"]:
        key = ("id", pid) if not str(pid).startswith("nm:") else ("nm", norm(p["name"]))
        p["college"] = pl_coll.get(key) or pl_coll.get(("nm", norm(p["name"])))

# ---------- tiering: longevity percentile + draft capital, then propagate ----------
career_seasons = {pid: len(p["seasons"]) for pid, p in reg.items()}
vals = sorted(career_seasons.values(), reverse=True)
N = max(1, len(vals))
def pct_cut(frac): return vals[min(N - 1, int(N * frac))]
c1, c2, c3, c4 = pct_cut(.03), pct_cut(.10), pct_cut(.25), pct_cut(.50)

def draft_rd(pid, name):
    return draft_round.get(("id", pid)) or draft_round.get(("nm", norm(name)))

def base_tier(pid, p):
    s = career_seasons[pid]
    t = 1 if s >= c1 else 2 if s >= c2 else 3 if s >= c3 else 4 if s >= c4 else 5
    rd = draft_rd(pid, p["name"])
    if rd == 1 and t > 1: t -= 1          # 1st-rounders skew famous
    elif rd and rd >= 6 and t < 5: t += 0  # late picks: no change, longevity already speaks
    return t

# overlay tier overrides (CSV: name,team,group,tier ; team/group blank = applies to all)
overlay = {}
if os.path.exists(OVERLAY):
    import csv
    with open(OVERLAY) as f:
        for row in csv.DictReader(f):
            nm = (row.get("name") or "").strip()
            if not nm or nm.startswith("#") or not (row.get("tier") or "").strip():
                continue
            overlay[(norm(nm), (row.get("team") or "").upper().strip(), (row.get("group") or "").upper().strip())] = int(row["tier"])
    print(f"  overlay tier overrides: {len(overlay)}")

def overlay_tier(name, team, grp):
    nk = norm(name)
    return (overlay.get((nk, team, grp)) or overlay.get((nk, "", grp))
            or overlay.get((nk, team, "")) or overlay.get((nk, "", "")))

# ---------- assemble ----------
nfl_out = defaultdict(lambda: defaultdict(list))
cfb_out = defaultdict(lambda: defaultdict(list))
seen_cfb = set()

for pid, p in reg.items():
    grp = p["group"]
    bt = base_tier(pid, p)
    ov = overlay_tier(p["name"], "", grp)
    career = min(bt, ov) if ov else bt
    # primary team = most seasons
    maxs = max((len(t["seasons"]) for t in p["teams"].values()), default=0)
    best = 9
    for tid, t in p["teams"].items():
        yrs = sorted(t["seasons"])
        y0, y1 = (yrs[0], yrs[-1]) if yrs else (0, 0)
        ovt = overlay_tier(p["name"], tid, grp)
        if ovt:
            tier = ovt
        elif len(t["seasons"]) >= max(1, maxs * 0.6):   # primary stint(s)
            tier = career
        else:                                            # cameo for a star = nice deep cut
            ratio = len(t["seasons"]) / maxs if maxs else 0
            tier = min(5, career + (0 if ratio >= 0.45 else 1 if ratio >= 0.12 else 2))
        best = min(best, tier)
        nfl_out[tid][grp].append([p["name"], tier, y0, y1])
    # college side
    cid = college_id(p["college"])
    if cid and (cid, norm(p["name"])) not in seen_cfb:
        seen_cfb.add((cid, norm(p["name"])))
        cfb_out[cid][grp].append([p["name"], best if best < 9 else 5])

# dedupe within each room (min tier, widest years)
def dedupe(out, has_years):
    removed = 0
    for groups in out.values():
        for g, lst in groups.items():
            best = {}; order = []
            for e in lst:
                k = norm(e[0])
                if k not in best: best[k] = e[:]; order.append(k)
                else:
                    removed += 1; cur = best[k]
                    if e[1] < cur[1]: cur[1] = e[1]
                    if has_years:
                        if e[2] and (not cur[2] or e[2] < cur[2]): cur[2] = e[2]
                        if e[3] and e[3] > cur[3]: cur[3] = e[3]
            groups[g] = [best[k] for k in order]
    return removed
dr = dedupe(nfl_out, True); dedupe(cfb_out, False)

# sort each room by tier then name
for out, hy in ((nfl_out, True), (cfb_out, False)):
    for groups in out.values():
        for g in groups:
            groups[g].sort(key=lambda e: (e[1], e[0]))

# ---------- stats + write ----------
nfl_n = sum(len(v) for t in nfl_out.values() for v in t.values())
cfb_n = sum(len(v) for t in cfb_out.values() for v in t.values())
print(f"\nNFL: {nfl_n} entries / {len(nfl_out)} teams | College: {cfb_n} entries / {len(cfb_out)} programs")
for g in GROUPS:
    print(f"  {g}: {sum(len(t.get(g, [])) for t in nfl_out.values())}")

payload = {"nfl": {k: dict(v) for k, v in nfl_out.items()},
           "cfb": {k: dict(v) for k, v in cfb_out.items()}}
js = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
b64 = base64.b64encode(gzip.compress(js.encode("utf-8"), 9)).decode()
with open(OUT, "w") as f:
    f.write('window.DEPTH_DATA="' + b64 + '";\n')
print(f"\nwrote {OUT}  ({len(js)/1e6:.2f}MB json -> {len(b64)/1e3:.0f}KB base64)")
print("Done. Hard-refresh the site to load the new rosters.")
