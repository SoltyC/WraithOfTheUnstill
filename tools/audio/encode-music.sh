#!/bin/sh
# Encode the user's music masters (assets/audio/music/*.wav, 48 kHz) for the game:
# AAC-LC 160 kb/s in .m4a (decodes in every WebGPU browser), served from data/audio/music/.
# Levels are left as mastered (all cues sit at about -16 LUFS integrated).
set -e
cd "$(dirname "$0")/../.."
mkdir -p data/audio/music
for f in assets/audio/music/*.wav; do
  n=$(basename "$f" .wav)
  ffmpeg -hide_banner -loglevel error -y -i "$f" -c:a aac -b:a 160k -movflags +faststart "data/audio/music/$n.m4a"
done
ls -la data/audio/music
