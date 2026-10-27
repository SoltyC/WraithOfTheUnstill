#!/usr/bin/env bash
# Encode an isolation film's frames (tools/bot/isolation-film.mjs) with the Windows ffmpeg:
#   tools/bot/isolation-encode.sh <name> [max MB for the 720p file, default 14]
# -> screenshots/isolation/<name>-720p.mp4 (two-pass H.264, 60 fps, 1280x720) and <name>-1080p.mp4 (CRF 20, kept local).
set -euo pipefail
cd "$(dirname "$0")/../.."
name=$1; maxmb=${2:-14}
F=/mnt/c/ffmpeg/bin/ffmpeg.exe
frames="screenshots/isolation/frames/$name"
n=$(ls "$frames" | wc -l); secs=$(python3 -c "print($n/60)")
kbps=$(python3 -c "print(int($maxmb*8*1000/($n/60)*0.93))")
in=$(wslpath -w "$PWD/$frames/f%06d.jpg"); out720=$(wslpath -w "$PWD/screenshots/isolation/$name-720p.mp4"); out1080=$(wslpath -w "$PWD/screenshots/isolation/$name-1080p.mp4")
log='C:\Windows\Temp\iso-'$name
echo "$n frames, ${secs}s, 720p at ${kbps}k"
$F -y -loglevel error -framerate 60 -i "$in" -vf scale=1280:720:flags=lanczos -c:v libx264 -preset slow -b:v ${kbps}k -pass 1 -passlogfile "$log" -pix_fmt yuv420p -an -f null NUL
$F -y -loglevel error -framerate 60 -i "$in" -vf scale=1280:720:flags=lanczos -c:v libx264 -preset slow -b:v ${kbps}k -maxrate $((kbps * 2))k -bufsize $((kbps * 3))k -pass 2 -passlogfile "$log" -pix_fmt yuv420p -movflags +faststart -an "$out720"
$F -y -loglevel error -framerate 60 -i "$in" -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -movflags +faststart -an "$out1080"
ls -l "screenshots/isolation/$name-720p.mp4" "screenshots/isolation/$name-1080p.mp4" | awk '{print $5, $9}'
