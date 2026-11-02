#!/usr/bin/env bash
# Run tools/audio/ace/cue.py inside the Windows ACE-Step install: tools/audio/ace/run.sh <cues.json> [out dir under C:\wraith-tools\ace-out]
set -eu
here=$(cd "$(dirname "$0")" && pwd)
cp "$here/cue.py" /mnt/c/wraith-tools/ace-cue.py
cp "$1" /mnt/c/wraith-tools/ace-cues.json
out=${2:-take}
cat > /mnt/c/wraith-tools/ace-run.ps1 <<EOF
\$env:UV_CACHE_DIR='C:\wraith-tools\ace-cache\uv'; \$env:HF_HOME='C:\wraith-tools\ace-cache\hf'; \$env:UV_PYTHON_INSTALL_DIR='C:\wraith-tools\ace-cache\python'
\$env:PYTHONIOENCODING='utf-8'; \$env:Path='C:\wraith-tools\ace-cache\uvbin\bin;'+\$env:Path
Set-Location C:\wraith-tools\ACE-Step-1.5
uv run python -X faulthandler C:\wraith-tools\ace-cue.py C:\wraith-tools\ace-cues.json C:\wraith-tools\ace-out\\$out
"EXIT \$LASTEXITCODE"
EOF
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\wraith-tools\ace-run.ps1'
