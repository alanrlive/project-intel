# after_reboot.ps1 - Full startup sequence after reboot

Write-Host "Post-Reboot Startup Sequence" -ForegroundColor Cyan

# Navigate to backend directory
$backendPath = Join-Path $PSScriptRoot "..\backend"

# 1. Start Ollama (if not running)
Write-Host "`n1. Starting Ollama..." -ForegroundColor Yellow
try {
    $null = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -ErrorAction Stop
    Write-Host "   [OK] Ollama already running" -ForegroundColor Green
} catch {
    Write-Host "   Starting Ollama service..." -ForegroundColor Gray
    Start-Process "ollama" -ArgumentList "serve" -WindowStyle Hidden
    Write-Host "   Waiting for Ollama to start..." -ForegroundColor Gray
    Start-Sleep -Seconds 5
    
    # Verify it started
    try {
        $null = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -ErrorAction Stop
        Write-Host "   [OK] Ollama started" -ForegroundColor Green
    } catch {
        Write-Host "   [ERROR] Failed to start Ollama" -ForegroundColor Red
        Write-Host "   Please start manually: ollama serve" -ForegroundColor Yellow
        exit
    }
}

# 2. Check data persistence
Write-Host "`n2. Checking persisted data..." -ForegroundColor Yellow
Push-Location $backendPath

if (Test-Path "data\project.db") {
    $dbSize = (Get-Item "data\project.db").Length / 1KB
    Write-Host "   [OK] Database found ($([math]::Round($dbSize, 2)) KB)" -ForegroundColor Green
    
    # Quick data check using Python
    .\.venv\Scripts\Activate.ps1
    python -c @"
import sqlite3
conn = sqlite3.connect('data/project.db')
cursor = conn.cursor()
cursor.execute('SELECT COUNT(*) FROM documents')
doc_count = cursor.fetchone()[0]
cursor.execute('SELECT COUNT(*) FROM actions')
action_count = cursor.fetchone()[0]
cursor.execute('SELECT COUNT(*) FROM risks')
risk_count = cursor.fetchone()[0]
print(f'   Data in DB: {doc_count} documents, {action_count} actions, {risk_count} risks')
conn.close()
"@
} else {
    Write-Host "   [INFO] No existing database (will create fresh)" -ForegroundColor Cyan
}

Pop-Location

# 3. Start backend
Write-Host "`n3. Starting backend..." -ForegroundColor Yellow
Write-Host "   Press Ctrl+C to stop`n" -ForegroundColor Gray

# Call start_backend.ps1
& (Join-Path $PSScriptRoot "start_backend.ps1")