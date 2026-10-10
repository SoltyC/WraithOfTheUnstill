#!/usr/bin/env bash
# Build the game and serve it on http://localhost:4173 (the playtest page: /playtest.html).
# Run from WSL, or from Windows with playtest.cmd (it calls this and opens the browser).
set -e
cd "$(dirname "$0")/.."
# Node from nvm when started outside an interactive shell (Windows: playtest.cmd).
if ! command -v npm >/dev/null 2>&1; then export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; fi
[ -d node_modules ] || npm install
npm run build
pkill -f "[v]ite preview" 2>/dev/null || true
echo "Serving on http://localhost:4173/playtest.html  (Ctrl+C to stop)"
exec npx vite preview --port 4173 --host 0.0.0.0
