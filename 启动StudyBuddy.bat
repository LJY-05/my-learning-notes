@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 24 LTS, then reopen this file.
  pause
  exit /b 1
)
node -e "if(24>Number(process.versions.node.split('.')[0]))process.exit(1)"
if errorlevel 1 (
  echo Node.js 24 LTS or newer is required.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm ci
  if errorlevel 1 (
    echo Dependency installation failed. Check your connection.
    pause
    exit /b 1
  )
)
call npm run db:init
if errorlevel 1 (
  echo Database initialization failed. See the message above.
  pause
  exit /b 1
)
echo Open http://localhost:5173 in Edge or Chrome.
echo Keep this window open. Your data is stored in the data folder.
call npm run dev
pause
