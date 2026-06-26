#!/usr/bin/env bash
# Rebuild app.js from src/app.jsx. Run `npm install` once first.
set -e
npx esbuild src/app.jsx --bundle --jsx=automatic --minify \
  --define:process.env.NODE_ENV='"production"' --outfile=app.js
echo "built app.js ($(wc -c < app.js) bytes)"
