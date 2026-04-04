# status.ps1 - Check what's running

Write-Host "Project Intel V2 - Status Check" -ForegroundColor Cyan

# Check Ollama
Write-Host "`nOllama:" -ForegroundColor Yellow
try {
    $ollama = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -ErrorAction Stop
    Write-Host "   [OK] Running" -ForegroundColor Green
    Write-Host "   Models: $($ollama.models.name -join ', ')" -ForegroundColor Gray
} catch {
    Write-Host "   [ERROR] Not running" -ForegroundColor Red
}

# Check Backend
Write-Host "`nBackend:" -ForegroundColor Yellow
try {
    $backend = Invoke-RestMethod -Uri "http://localhost:8000/health" -ErrorAction Stop
    Write-Host "   [OK] Running on http://localhost:8000" -ForegroundColor Green
    Write-Host "   Status: $($backend.status)" -ForegroundColor Gray
} catch {
    Write-Host "   [ERROR] Not running" -ForegroundColor Red
}

# Check Database
Write-Host "`nDatabase:" -ForegroundColor Yellow
$backendPath = Join-Path $PSScriptRoot "..\backend"
Push-Location $backendPath

if (Test-Path "data\project.db") {
    $dbSize = (Get-Item "data\project.db").Length / 1KB
    Write-Host "   [OK] Exists ($([math]::Round($dbSize, 2)) KB)" -ForegroundColor Green
    
    # Show data counts
    .\.venv\Scripts\Activate.ps1
    python -c @"
import sqlite3
conn = sqlite3.connect('data/project.db')
cursor = conn.cursor()
tables = ['documents', 'actions', 'risks', 'deadlines', 'dependencies', 'scope_items', 'notifications']
for table in tables:
    cursor.execute(f'SELECT COUNT(*) FROM {table}')
    count = cursor.fetchone()[0]
    print(f'   - {table}: {count}')
conn.close()
"@
} else {
    Write-Host "   [WARNING] Database doesn't exist" -ForegroundColor Yellow
}

Pop-Location
Write-Host ""