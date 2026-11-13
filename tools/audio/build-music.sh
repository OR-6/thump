#!/usr/bin/env bash
# Builds public/audio/music/ from the soundtrack sources in assets-src/ (gitignored).
# Music: Scott Buckley (scottbuckley.com.au), CC BY 4.0. Jingles: Kenney "Music Jingles" (CC0).
# Output: stereo Ogg Opus 64 kb/s, loudness-matched (-20 LUFS) so every chapter sits at the same level.
set -euo pipefail
cd "$(dirname "$0")/../.."
SRC=assets-src
OUT=public/audio/music
mkdir -p "$OUT" public/audio/fx
music() { # in out
  ffmpeg -loglevel error -y -i "$1" -af "silenceremove=start_periods=1:start_threshold=-60dB,loudnorm=I=-20:TP=-2:LRA=11" -ar 48000 -ac 2 -c:a libopus -b:a 64k "$2"
}
music "$SRC/music-buckley/sb_castlesinthesky.mp3" "$OUT/garden-castles-in-the-sky.ogg"
music "$SRC/music-buckley/HomeWasYou.mp3" "$OUT/home-home-was-you.ogg"
music "$SRC/music-buckley/sb_sleep.mp3" "$OUT/night-sleep.ogg"
music "$SRC/music-buckley/sb_solace.mp3" "$OUT/sea-solace.ogg"
# win stingers: Kenney's pizzicato jingles (mono, trimmed, -3 dBFS peak)
J=$SRC/kenney-jingles/unz/OGG/jingles_PIZZA
for n in 01 03 07; do
  ffmpeg -loglevel error -y -i "$J/jingles_PIZZA$n.ogg" -af "silenceremove=start_periods=1:start_threshold=-50dB,loudnorm=I=-16:TP=-3" -ar 48000 -ac 1 -c:a libopus -b:a 64k "public/audio/fx/jingle-$n.ogg"
done
