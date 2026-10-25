#!/usr/bin/env bash
# Rebuild (under the shared lock) and restart the bot page on the preview port: tools/bot/restart.sh [spot]
cd "$(dirname "$0")/../.."
flock /tmp/wraith-build.lock npx vite build 2>&1 | tail -1
PORT=${PORT:-4177} tools/bot/play.sh "${1:-p8-meadow-golden}" 2>&1 | tail -1
