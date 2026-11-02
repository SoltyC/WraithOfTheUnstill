#!/usr/bin/env bash
# Two short samples from Stable Audio 3 Medium on the Windows GPU, for the user to judge by ear before anything is built on it
# (docs/phase-10/local-music-generation.md). Needs the licence accepted on Hugging Face and C:\wraith-tools\sa3-login.bat run once.
set -eu
cat > /mnt/c/wraith-tools/sa3-sample.ps1 <<'EOF'
$env:HF_HOME='C:\wraith-tools\sa3-cache\hf'; $env:PYTHONIOENCODING='utf-8'
Set-Location C:\wraith-tools\stable-audio-3
New-Item -ItemType Directory -Force C:\wraith-tools\sa3-out | Out-Null
.\.venv\Scripts\stable-audio.exe --model medium --seed 11 --duration 60 --chunked-decode -o C:\wraith-tools\sa3-out\fen-day.wav -p "dark ambient, almost silent, low drone, a few distant plucked notes, long gaps between notes, marsh at dawn, sparse, lots of space, instrumental"
"FEN EXIT $LASTEXITCODE"
.\.venv\Scripts\stable-audio.exe --model medium --seed 21 --duration 60 --chunked-decode -o C:\wraith-tools\sa3-out\morrow-fire.wav -p "solo lyre, plucked, simple kind folk melody, warm, intimate, slow, sparse, instrumental"
"LYRE EXIT $LASTEXITCODE"
EOF
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\wraith-tools\sa3-sample.ps1'
