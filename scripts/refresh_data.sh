#!/usr/bin/env bash
# ============================================================
# Depth Chart — one-command roster rebuild.
# Creates a clean Python environment, installs what's needed,
# downloads the latest nflverse rosters, rebuilds ../data.js,
# and runs spot-checks so you KNOW it worked.
#
#   bash refresh_data.sh
# ============================================================
set -e
cd "$(dirname "$0")"

echo ""
echo "=== Depth Chart — rebuilding rosters from nflverse ==="
echo ""

# 1. find python
PY=""
for c in python3 python; do command -v "$c" >/dev/null 2>&1 && { PY="$c"; break; }; done
if [ -z "$PY" ]; then
  echo "❌ Python isn't installed. Install it from https://www.python.org/downloads/ and re-run."
  exit 1
fi
echo "• Using $($PY --version)"

# 2. clean virtual environment (keeps your system Python untouched)
if [ ! -d ".venv" ]; then
  echo "• Creating a local Python environment (.venv)…"
  "$PY" -m venv .venv
fi
# venv layout differs: Windows uses Scripts/, macOS/Linux use bin/
if [ -f ".venv/Scripts/activate" ]; then
  # shellcheck disable=SC1091
  source .venv/Scripts/activate
elif [ -f ".venv/bin/activate" ]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
else
  echo "⚠  Couldn't find the venv activate script — continuing with system Python."
fi

# 3. dependencies
echo "• Installing nflreadpy + polars (first time only, ~30s)…"
python -m pip install --quiet --upgrade pip
if ! python -m pip install --quiet nflreadpy polars; then
  echo ""
  echo "❌ Couldn't install the data libraries."
  echo "   Most likely cause: your Python ($("$PY" --version 2>&1)) is newer than"
  echo "   the prebuilt 'polars' packages support yet."
  echo ""
  echo "   Fix: install Python 3.12 (very stable, has all the packages) from"
  echo "        https://www.python.org/downloads/release/python-3127/"
  echo "        Then delete the .venv folder and run this script again."
  echo ""
  echo "   (If the error mentioned something else, paste the full output to your"
  echo "    helper and they'll sort it out.)"
  exit 1
fi

# 4. build (downloads a few hundred MB the first time, then caches)
echo "• Downloading rosters and rebuilding data.js…"
echo "  (first run takes a couple of minutes — later runs are fast)"
echo ""
python build_nflverse.py

# 5. verify
echo ""
echo "=== Verifying the new data.js ==="
python verify_data.py

echo ""
echo "✅ Done. The site now uses fresh rosters."
echo "   Preview it:  (from the depth-chart folder)  npx serve ."
echo "   Then hard-refresh your browser (Cmd/Ctrl + Shift + R)."
