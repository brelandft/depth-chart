#!/usr/bin/env python3
"""
verify_data.py — sanity-check ../data.js after a rebuild.
Run on its own anytime:   python verify_data.py
Prints PASS/FAIL spot-checks plus a coverage summary. Exit code 0 = all good.
"""
import os, re, gzip, base64, json, sys

PATH = os.environ.get("DC_OUT", os.path.join(os.path.dirname(__file__), "..", "data.js"))
GROUPS = ["QB", "RB", "WR", "TE", "OL", "DL", "LB", "CB", "S"]

if not os.path.exists(PATH):
    sys.exit(f"❌ {PATH} not found — run the build first (bash refresh_data.sh).")

m = re.search(r'window\.DEPTH_DATA\s*=\s*"([A-Za-z0-9+/=]+)"', open(PATH).read())
if not m:
    sys.exit("❌ data.js doesn't look right (no DEPTH_DATA blob). Re-run the build.")
data = json.loads(gzip.decompress(base64.b64decode(m.group(1))))

nfl, cfb = data.get("nfl", {}), data.get("cfb", {})
nfl_n = sum(len(v) for t in nfl.values() for v in t.values())
cfb_n = sum(len(v) for t in cfb.values() for v in t.values())

print(f"Coverage: {nfl_n:,} NFL entries / {len(nfl)} teams · "
      f"{cfb_n:,} college entries / {len(cfb)} programs")
print("By position (NFL): " + "  ".join(
    f"{g} {sum(len(t.get(g, [])) for t in nfl.values()):,}" for g in GROUPS))
print()

def find(lg, team, grp, substr):
    for e in data.get(lg, {}).get(team, {}).get(grp, []):
        if substr.lower() in e[0].lower():
            return e[1]  # tier
    return None

# (league, team, group, name substring, expectation)
#   tier<=2 = should be a well-known answer; "exists" = just needs to be present
checks = [
    ("nfl", "TB", "TE", "Gronkowski", "le2"),   # the false-negative that started this
    ("nfl", "TEN", "QB", "Tannehill", "le2"),
    ("nfl", "KC", "QB", "Mahomes", "le2"),
    ("nfl", "MIN", "WR", "Jefferson", "le2"),
    ("nfl", "BAL", "RB", "Henry", "le2"),
    ("nfl", "SF", "DL", "Bosa", "le2"),
    ("nfl", "DAL", "OL", "Tyron Smith", "exists"),
    ("nfl", "DEN", "QB", "Elway", "exists"),    # only present if you set DC_START_YEAR<1999
    ("cfb", "LSU", "WR", "Jefferson", "exists"),
    ("cfb", "BAMA", "QB", "Tagovailoa", "exists"),
]

passed = failed = soft = 0
for lg, team, grp, name, kind in checks:
    tier = find(lg, team, grp, name)
    label = f"{lg.upper()} {team} {grp} · {name}"
    if tier is None:
        # Elway/old-era checks are soft unless deep-era was requested
        if name in ("Elway",):
            print(f"–  {label}: not present (expected — only with DC_START_YEAR<1999)")
            soft += 1
        else:
            print(f"❌ {label}: MISSING"); failed += 1
    elif kind == "le2" and tier > 2:
        print(f"⚠  {label}: present but tier {tier} (expected 1–2; tweak overlay_tiers.csv)")
        soft += 1
    else:
        print(f"✅ {label}: tier {tier}")
        passed += 1

print()
print(f"{passed} passed · {failed} failed · {soft} soft notes")
if failed:
    print("❌ Some expected players are missing. Check the build output above for errors.")
    sys.exit(1)
print("✅ Looks good. Spot-check a few rooms in the game itself, then ship.")
