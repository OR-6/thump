#!/usr/bin/env bash
# Builds public/audio/ from CC0 sources in assets-src/ (gitignored; see README credits).
# Kalimba: VCSL "Kalimba, Kenya" (Versilian Studios, CC0). Glock: VSCO 2 CE (CC0).
# Foley/UI: Kenney Impact Sounds, RPG Audio, Interface Sounds (CC0).
# Output: mono Ogg Opus 48 kHz, trimmed and peak-normalised.
set -euo pipefail
cd "$(dirname "$0")/../.."
SRC=assets-src
OUT=public/audio
rm -rf "$OUT/kalimba" "$OUT/fx"; mkdir -p "$OUT/kalimba" "$OUT/fx"   # keeps CREDITS.md
enc() { # in out [extra filters] — trims/filters, then peak-normalises to -3 dBFS
  local tmp; tmp="$(mktemp -t loomsong).wav"
  ffmpeg -loglevel error -y -i "$1" -ac 1 -ar 48000 -af "${3:-anull}" "$tmp"
  local peak; peak=$(ffmpeg -hide_banner -i "$tmp" -af volumedetect -f null - 2>&1 | sed -nE 's/.*max_volume: (-?[0-9.]+) dB.*/\1/p')
  local gain; gain=$(echo "-3 - (${peak:-0})" | bc -l)
  ffmpeg -loglevel error -y -i "$tmp" -af "volume=${gain}dB,alimiter=limit=0.95:level=disabled" -c:a libopus -b:a 48k "$2"
  rm -f "$tmp"
}
# Kalimba notes: start at the attack, keep 1.6 s, fade the tail.
midi_of() { case "$1" in B2) echo 47;; C#3) echo 49;; D#3) echo 51;; F#3) echo 54;; G#3) echo 56;; B3) echo 59;;
  C#4) echo 61;; D#4) echo 63;; F#4) echo 66;; A4) echo 69;; B4) echo 71;; *) echo;; esac; }
for f in "$SRC"/vcsl-kalimba/*.wav; do
  note=$(basename "$f" | sed -E 's/.*MainSpirit_([A-G]#?[0-9])_.*/\1/')
  m=$(midi_of "$note")
  [ -z "$m" ] && continue
  [ -f "$OUT/kalimba/k$m.ogg" ] && continue   # one take per note
  enc "$f" "$OUT/kalimba/k$m.ogg" "silenceremove=start_periods=1:start_threshold=-40dB,atrim=0:1.6,afade=t=in:d=0.003,afade=t=out:st=1.0:d=0.6"
done
enc "$SRC/vsco/glock_fx_up_pentatonic_med_01.wav" "$OUT/fx/glock-gliss.ogg" "silenceremove=start_periods=1:start_threshold=-70dB,atrim=0:3.2,afade=t=out:st=2.4:d=0.8"
K=$SRC/kenney
i=0; for f in "$K"/impact-sounds/Audio/impactWood_light_00{0..4}.ogg; do enc "$f" "$OUT/fx/wood-light-$i.ogg"; i=$((i+1)); done
i=0; for f in "$K"/impact-sounds/Audio/impactPlank_medium_00{0..4}.ogg; do enc "$f" "$OUT/fx/plank-$i.ogg"; i=$((i+1)); done
i=0; for f in "$K"/impact-sounds/Audio/impactWood_medium_00{0..4}.ogg; do enc "$f" "$OUT/fx/wood-medium-$i.ogg"; i=$((i+1)); done
i=0; for f in "$K"/impact-sounds/Audio/impactSoft_medium_00{0..4}.ogg; do enc "$f" "$OUT/fx/soft-$i.ogg"; i=$((i+1)); done
i=0; for f in "$K"/rpg-audio/Audio/cloth{1..4}.ogg; do enc "$f" "$OUT/fx/cloth-$i.ogg"; i=$((i+1)); done
i=0; for f in "$K"/rpg-audio/Audio/bookFlip{1..3}.ogg; do enc "$f" "$OUT/fx/flip-$i.ogg"; i=$((i+1)); done
i=0; for f in "$K"/kenney_interfaceSounds/Audio/tick_00{1,2,4}.ogg; do enc "$f" "$OUT/fx/tick-$i.ogg"; i=$((i+1)); done
# Pip's voice (optional): Freesound CC0 clips dropped into assets-src/freesound/,
# matched by their Freesound id (the number the download's file name starts with).
if [ -d "$SRC/freesound" ]; then
  h=0; c=0; d=0
  for f in "$SRC"/freesound/*; do
    id=$(basename "$f" | sed -E 's/^([0-9]+).*/\1/')
    case "$id" in
      233255|85404) enc "$f" "$OUT/fx/pip-happy-$h.ogg" "highpass=f=900,silenceremove=start_periods=1:start_threshold=-40dB,atrim=0:0.7,afade=t=out:st=0.5:d=0.2"; h=$((h+1));;
      85403) enc "$f" "$OUT/fx/pip-cheer-$c.ogg" "highpass=f=900,silenceremove=start_periods=1:start_threshold=-40dB,atrim=0:1.4,afade=t=out:st=1.1:d=0.3"; c=$((c+1));;
      703254) enc "$f" "$OUT/fx/pip-sad-$d.ogg" "highpass=f=600,silenceremove=start_periods=1:start_threshold=-40dB,atrim=0:1.2,afade=t=out:st=0.9:d=0.3"; d=$((d+1));;
    esac
  done
fi
# Index of every sample, so the game loads exactly what exists (no 404s).
( cd "$OUT" && find kalimba fx -name '*.ogg' | sort | awk 'BEGIN{printf "["} {printf "%s\"%s\"", (NR>1?",":""), $0} END{print "]"}' ) > "$OUT/index.json"
du -sh "$OUT"; ls "$OUT"/kalimba
