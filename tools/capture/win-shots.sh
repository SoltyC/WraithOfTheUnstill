#!/usr/bin/env bash
# Photo-spot shots on the Windows GPU from WSL, supervised (headless Chrome: works with the PC
# locked). Needs `npm run preview` (or tools/playtest.sh) serving the build on :${PORT:-4173}.
#
#   tools/capture/win-shots.sh <spot prefix> <dir> [timeout s per spot, default 60] [extra query, cmd-escaped: "^&k=v"]
#
# Every run: closes leftover capture Chromes (only those, matched by profile), uses a fresh
# profile (a busy one hands the launch to the old process, which ignores it), relaunches when
# the page has not started in 90 s or no shot has landed in 150 s — resuming at the first spot
# not yet saved — and closes Chrome at the end. Prints one line per shot.
set -u
cd "$(dirname "$0")/../.."
prefix=$1; dir=$2; per=${3:-60}; extra=${4:-}  # extra: more query, e.g. "^&swatches=1"
log=screenshots/$dir/shots-log.txt
ids=$(node -e "const s=require('./data/photo-spots.json').spots;console.log(s.filter(x=>x.id.startsWith(process.argv[1])).map(x=>x.id).join(' '))" "$prefix")
total=$(wc -w <<<"$ids")
[ "$total" -gt 0 ] || { echo "no spots start with '$prefix'"; exit 1; }
curl -sf -o /dev/null http://localhost:${PORT:-4173}/ || { echo "preview server not running on :${PORT:-4173}"; exit 1; }

killChrome() {
  powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"name='chrome.exe'\" | Where-Object { \$_.CommandLine -match 'wraith-shots-${PORT:-4173}-' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }" >/dev/null 2>&1
}
trap killChrome EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP
saved() { local c=0; for id in $ids; do [ -f "screenshots/$dir/$id.png" ] && c=$((c + 1)); done; echo $c; }
launch() { # $1 = first spot id, $2 = its index
  local prof="wraith-shots-${PORT:-4173}-$(date +%s%N)"
  cmd.exe /c start chrome --headless=new "--user-data-dir=%TEMP%\\$prof" --no-first-run --enable-unsafe-webgpu --enable-gpu \
    --ignore-gpu-blocklist --disable-background-timer-throttling --disable-renderer-backgrounding --window-size=2560,1440 \
    "http://localhost:${PORT:-4173}/?shots=$prefix^&spot=$1^&shotIndex=$2^&dir=$dir^&capture=1^&res=2560x1440^&shotTimeout=$per$extra" >/dev/null 2>&1
}

killChrome
mkdir -p "screenshots/$dir"
# A log from an earlier run into the same dir would read as this run's (its "Shots done").
[ -f "$log" ] && mv "$log" "$log.prev"
attempts=0; shown=0
while :; do
  # Resume at the first spot without a saved shot.
  k=0; first=""
  for id in $ids; do [ -f "screenshots/$dir/$id.png" ] || { first=$id; break; }; k=$((k + 1)); done
  [ -z "$first" ] && break
  attempts=$((attempts + 1))
  [ $attempts -gt 4 ] && { echo "GIVING UP after $((attempts - 1)) launches; $(saved)/$total saved"; killChrome; exit 2; }
  [ $attempts -gt 1 ] && echo "relaunch #$((attempts - 1)) at $first"
  killChrome; launch "$first" "$k"
  last=$(date +%s); before=$(saved); started=0
  while :; do
    sleep 3
    if [ -f "$log" ]; then
      n=$(wc -l <"$log")
      if [ "$n" -gt "$shown" ]; then sed -n "$((shown + 1)),${n}p" "$log"; shown=$n; last=$(date +%s); started=1; fi
      grep -q "Shots done" "$log" && [ "$(saved)" -ge "$total" ] && break 2
    fi
    now=$(date +%s)
    if [ $started -eq 0 ] && [ $((now - last)) -gt 90 ]; then echo "no start in 90 s"; break; fi
    if [ $((now - last)) -gt 150 ]; then echo "stalled 150 s"; break; fi
    if [ -f "$log" ] && grep -q "Shots done" "$log" && [ "$(saved)" -gt "$before" ]; then break; fi
  done
done
killChrome
echo "DONE $(saved)/$total saved in screenshots/$dir"
