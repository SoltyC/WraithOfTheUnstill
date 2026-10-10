@echo off
rem Double-click from Windows: builds and serves the game in WSL, then opens the playtest page.
rem Leave the window open while you play; close it to stop the server.
start "" cmd /c "timeout /t 25 >nul & start http://localhost:4173/playtest.html"
wsl.exe -d Ubuntu --cd /home/sol/WraithOfTheUnstill -- bash tools/playtest.sh
