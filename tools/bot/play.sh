#!/usr/bin/env bash
# Open the game for the bot on the Windows GPU (headless Chrome: works with the PC locked).
#   tools/bot/play.sh [spot] [extra query, cmd-escaped: "^&k=v"]       tools/bot/play.sh stop
# Needs `npm run preview` on :${PORT:-4173}. Then drive it with tools/bot/bot.mjs.
set -u
cd "$(dirname "$0")/../.."
kill() { powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"name='chrome.exe'\" | Where-Object { \$_.CommandLine -match 'wraith-bot-${PORT:-4173}-' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }" >/dev/null 2>&1; powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(wslpath -w tools/winchrome/cleanup-profiles.ps1)" -Prefix "wraith-bot-${PORT:-4173}-" >/dev/null 2>&1; }
kill
[ "${1:-}" = stop ] && exit 0
spot=${1:-}; extra=${2:-}
q="bot=1^&title=0"; [ -n "$spot" ] && q="$q^&spot=$spot"
t0=$(curl -s http://localhost:${PORT:-4173}/__wraith/bot/status | sed -n 's/.*"hello":\([0-9]*\).*/\1/p')
prof="wraith-bot-${PORT:-4173}-$(date +%s%N)"
cmd.exe /c start chrome --headless=new --enable-logging "--log-file=C:\\Windows\\Temp\\wraith-bot-${PORT:-4173}.log" "--user-data-dir=%TEMP%\\$prof" --no-first-run --enable-unsafe-webgpu --enable-gpu \
  --ignore-gpu-blocklist --disable-background-timer-throttling --disable-renderer-backgrounding --window-size=${WIN:-2560,1440} \
  "http://localhost:${PORT:-4173}/?$q$extra" >/dev/null 2>&1
# Wait for the page to poll.
for i in $(seq 1 60); do
  s=$(curl -s http://localhost:${PORT:-4173}/__wraith/bot/status)
  h=$(sed -n 's/.*"hello":\([0-9]*\).*/\1/p' <<<"$s")
  if [ -n "$h" ] && [ "$h" != "${t0:-0}" ] && [ "$h" != 0 ]; then echo "bot page up ($((i * 3)) s)"; exit 0; fi
  sleep 3
done
echo "bot page did not come up in 180 s"; exit 1
