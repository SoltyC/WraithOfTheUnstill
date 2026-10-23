#!/usr/bin/env bash
# Bot: play the quest's opening for real (meet Wenna, follow her) and stop on arrival in the burning village.
set -e; cd "$(dirname "$0")/../.."; B=tools/bot/bot.mjs
tools/bot/play.sh p8-quest-start "^&gale=1${1:-}"
node $B talkTo '{"id":"meadow-wenna"}' >/dev/null
node $B wait '{"ms":10000}' >/dev/null
node $B follow '{"id":"meadow-wenna","flag":"meadow:arrived","dist":5,"timeout":170}' | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const d=JSON.parse(s);console.log('arrived:',d.reached,'pos',d.pos,'fps',d.perf&&d.perf.fps,'fire',JSON.stringify(d.fire))})"
