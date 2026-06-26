# Regenerating `data.js` from nflverse

`../data.js` is generated, not authored by hand. This folder rebuilds it from
**nflverse** — the open NFL data project whose seasonal rosters are *complete*:
every player, every team they were rostered on, every season since 1999, with
their college attached. Regenerating from it fixes the two known gaps in the
shipped dataset (post-2019 moves and pre-2006 stints rejecting correct answers)
and rebuilds the college boards automatically from the `college` field.

## Run it (on your own machine, not a sandbox)

nflverse downloads from GitHub release assets, so this must run somewhere with
normal internet (a CI sandbox often can't reach those hosts).

```bash
pip install nflreadpy polars
cd scripts
python build_nflverse.py
```

It writes `../data.js` in place. Hard-refresh the site and the new rosters load.
First run downloads a few hundred MB and takes a couple of minutes; nflreadpy
caches afterward.

## Options (environment variables)

| Var             | Default        | Notes |
|-----------------|----------------|-------|
| `DC_START_YEAR` | `1999`         | First season. nflverse rosters are *complete* from 1999. You can try `1970`, but pre-1999 coverage is partial. |
| `DC_END_YEAR`   | current year   | Last season. |
| `DC_OUT`        | `../data.js`   | Output path. |
| `DC_OVERLAY`    | `overlay_tiers.csv` | Star-correction file (below). |

```bash
DC_START_YEAR=1999 python build_nflverse.py
```

## How tiering works (and how to improve it)

The shipped dataset tiered players by Pro-Football-Reference Approximate Value,
which only exists for 2006-2019. nflverse rosters don't carry AV across all
years, so this script tiers by a signal that *is* universal across every
position and season:

- **career longevity** (how many seasons a player was rostered) - percentile-
  banded, so it self-calibrates to the full ~25k-player distribution, and
- **draft capital** (1st-rounders skew famous), then
- **career-fame propagation** - a player's primary team reflects who they are;
  brief stops stay rare (a star's one-year cameo is a good deep cut).

Longevity is a solid proxy - durable players are generally the known ones - but
it under-rates famous *short-career* or *recently-emerged* stars (Mahomes,
Jefferson, Luck, Bo Jackson). That's what **`overlay_tiers.csv`** fixes:

```csv
name,team,group,tier
Patrick Mahomes,,QB,1     # blank team/group = applies on every team
Rob Gronkowski,,TE,1
```

Edit it freely - it's the one-line lever for any player who feels mis-rated.

**Want objective tiers instead of longevity?** The cleanest upgrade is a
Pro Bowl / All-Pro honors feed: a player's selection count is a near-perfect
fame signal across all eras and positions. Wikipedia's "List of Pro Bowl
players" pages span 1950-present; scrape them once, count selections per
player, and replace the longevity tiering with min(curve(selections), draft).
That retires the hand-curation entirely. (It wasn't done in-sandbox because
pulling nine large wiki pages there risked an out-of-memory abort.)

## Output schema (what `data.js` contains)

```js
window.DEPTH_DATA = "<gzip+base64 of>";
// { "nfl": { "TEN": { "QB": [["Steve McNair",1,1995,2005], ...], ... }, ... },
//   "cfb": { "LSU": { "WR": [["Justin Jefferson",1], ...], ... }, ... } }
// NFL entries: [name, tier, firstYear, lastYear].  College: [name, tier].
// tier 1 = household name ... 5 = certified deep cut.
```

## Note on the old build

The original sandbox pipeline (leesharpe/nfldata + ESPN draft + DynastyProcess
+ hand overlays) is superseded by this one. nflverse rosters are a strict
upgrade in coverage; you don't need the old multi-source merge anymore. If you
later want the deep pre-1999 era, layer `load_draft_picks` (1980+) and a small
legends overlay on top - but the 1999+ rosters already cover the modern game
completely, which is where virality lives.
