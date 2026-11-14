#!/bin/sh
# Cut every icon size from the rendered hit (tools/icon-hit.mjs) into public/.
set -e
cp artifacts/hit-fav.svg public/favicon.svg
ffmpeg -v error -y -i artifacts/hit-fav.png -vf scale=32:32 public/favicon-32.png
ffmpeg -v error -y -i artifacts/hit-app.png -vf scale=180:180 public/apple-touch-icon.png
ffmpeg -v error -y -i artifacts/hit-app.png -vf scale=192:192 public/icon-192.png
ffmpeg -v error -y -i artifacts/hit-app.png -vf scale=512:512 public/icon-512.png
ffmpeg -v error -y -i artifacts/hit-og.png -q:v 3 public/site/og.jpg
echo exported
