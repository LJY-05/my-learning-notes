@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 22 LTS first, then reopen this file.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm ci
  if errorlevel 1 (
    echo Install failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)
echo Open http://localhost:5173 in Edge or Chrome.
echo Keep this window open while using StudyBuddy.
call npm run dev
pause
