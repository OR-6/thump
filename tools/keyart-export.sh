#!/bin/bash
# Exports the rendered icons, key art and OG card into public/.
set -e
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
ffmpeg -v error -y -i artifacts/icon-art.png -vf scale=512:512:flags=lanczos public/icon-512.png
ffmpeg -v error -y -i artifacts/icon-art.png -vf scale=192:192:flags=lanczos public/icon-192.png
ffmpeg -v error -y -i artifacts/icon-art.png -vf scale=180:180:flags=lanczos public/apple-touch-icon.png
ffmpeg -v error -y -i artifacts/icon-t.png -vf scale=32:32:flags=lanczos public/favicon-32.png
ffmpeg -v error -y -i artifacts/og.png -q:v 3 public/site/og.jpg
ffmpeg -v error -y -i artifacts/keyart.png -vf scale=1920:1080:flags=lanczos artifacts/keyart-1920.png
cwebp -quiet -q 80 -m 6 artifacts/keyart-1920.png -o public/site/keyart.webp
ffmpeg -v error -y -i artifacts/icon-art.png -vf scale=640:640:flags=lanczos artifacts/icon-640.png
cwebp -quiet -q 82 -m 6 artifacts/icon-640.png -o public/site/icon.webp
ls -la public/*.png public/favicon.svg public/site/og.jpg public/site/keyart.webp public/site/icon.webp | awk '{print $5, $9}'
