@echo off
rem Starts Syndicates Desktop. The first run installs what it needs.
cd /d "%~dp0"
where npm >nul 2>nul || (
  echo Node.js is not installed. Get the LTS version from https://nodejs.org and run this again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing Syndicates Desktop, this takes a minute or two the first time...
  call npm install --no-audit --no-fund || (pause & exit /b 1)
)
start "" /b npx electron .
