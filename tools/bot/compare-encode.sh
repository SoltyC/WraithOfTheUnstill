#!/usr/bin/env bash
# Encode the before/after comparison film (tools/bot/compare-film.mjs) with the Windows ffmpeg, split
# screen in the style of the DLSS on/off clips: the left half of the before build's frame beside the
# right half of the after build's, a divider, labels, a caption per shot; the shots concatenated.
#   tools/bot/compare-encode.sh <before frames dir> <after frames dir> <out.mp4>
set -euo pipefail
cd "$(dirname "$0")/../.."
B=$1; A=$2; OUT=$3
F=/mnt/c/ffmpeg/bin/ffmpeg.exe
TMP=$(mktemp -d -p "${TMPDIR:-/tmp}")
FONT="C\\:/Windows/Fonts/arialbd.ttf"
declare -A CAP=([lake]="Lake and ranges - eroded mountains, scanned-leaf forest" [meadow]="The sward - GTAO depth, clumped flowers, seed heads" [scarp]="Sculpted limestone outcrop and boulders" [tree]="Tree close-up - real leaf sprays, crooked limbs" [vista]="Wide - shared PBR lighting, forest depth" [golden]="Late afternoon toward the sun")
list=$TMP/list.txt; : > "$list"
for s in lake meadow scarp tree vista golden; do
  out="$TMP/$s.mp4"
  vf="[0:v]crop=960:1080:0:0[l];[1:v]crop=960:1080:960:0[r];[l][r]hstack=inputs=2,"
  vf+="drawbox=x=958:y=0:w=4:h=1080:color=white@0.9:t=fill,"
  vf+="drawtext=fontfile='$FONT':text='BEFORE':x=40:y=36:fontsize=44:fontcolor=white:borderw=3:bordercolor=black@0.6,"
  vf+="drawtext=fontfile='$FONT':text='AFTER':x=w-tw-40:y=36:fontsize=44:fontcolor=white:borderw=3:bordercolor=black@0.6,"
  vf+="drawtext=fontfile='$FONT':text='${CAP[$s]}':x=(w-tw)/2:y=h-70:fontsize=30:fontcolor=white:borderw=2:bordercolor=black@0.6,"
  vf+="fade=t=in:st=0:d=0.3,fade=t=out:st=4.7:d=0.3[v]"
  $F -y -loglevel error -framerate 30 -i "$(wslpath -w "$B/before-$s/f%06d.jpg")" -framerate 30 -i "$(wslpath -w "$A/after-$s/f%06d.jpg")" \
     -filter_complex "$vf" -map "[v]" -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -r 30 "$(wslpath -w "$out")"
  echo "file '$(wslpath -w "$out")'" >> "$list"
  echo "encoded $s"
done
$F -y -loglevel error -f concat -safe 0 -i "$(wslpath -w "$list")" -c copy -movflags +faststart "$(wslpath -w "$OUT")"
rm -rf "$TMP"
ls -l "$OUT" | awk '{print $5, $9}'
