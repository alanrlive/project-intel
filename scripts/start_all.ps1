# Derive project root from this script's location (works regardless of where it's cloned)
$projectRoot = Split-Path -Parent $PSScriptRoot

# Start backend in background
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$projectRoot'; .\scripts\start_backend.ps1"

# Wait for backend to start
Start-Sleep -Seconds 3

# Start frontend
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$projectRoot\frontend'; `$env:PATH += ';' + `$env:USERPROFILE + '\.cargo\bin'; npm run tauri dev"
