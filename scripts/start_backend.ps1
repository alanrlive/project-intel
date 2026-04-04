# start_backend.ps1 - Start Project Intel Backend

Write-Host "Starting Project Intel V2 Backend..." -ForegroundColor Cyan

# Navigate to backend directory
$backendPath = Join-Path $PSScriptRoot "..\backend"
Set-Location $backendPath

# Activate virtual environment
Write-Host "`n1. Activating Python virtual environment..." -ForegroundColor Yellow
.\.venv\Scripts\Activate.ps1

# Check if Ollama is running
Write-Host "`n2. Checking Ollama status..." -ForegroundColor Yellow
try {
    $ollama = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -ErrorAction Stop
    Write-Host "   [OK] Ollama is running" -ForegroundColor Green
    Write-Host "   Available models: $($ollama.models.name -join ', ')" -ForegroundColor Gray
} catch {
    Write-Host "   [ERROR] Ollama is not running!" -ForegroundColor Red
    Write-Host "   Start it with: ollama serve" -ForegroundColor Yellow
    Write-Host "`nPress any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit
}

# Check if database exists
Write-Host "`n3. Checking database..." -ForegroundColor Yellow
if (Test-Path "data\project.db") {
    $dbSize = (Get-Item "data\project.db").Length / 1KB
    Write-Host "   [OK] Database exists ($([math]::Round($dbSize, 2)) KB)" -ForegroundColor Green
} else {
    Write-Host "   [INFO] Database will be created on first run" -ForegroundColor Cyan
}

# Start uvicorn
Write-Host "`n4. Starting FastAPI server..." -ForegroundColor Yellow
Write-Host "   Backend will run on: http://localhost:8000" -ForegroundColor Cyan
Write-Host "   API docs available at: http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host "`n   Press Ctrl+C to stop the server`n" -ForegroundColor Gray

uvicorn app.main:app --reload