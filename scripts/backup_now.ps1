# backup_now.ps1 - Trigger a manual backup via the Project Intel V2 backend API

Write-Host "Project Intel V2 - Manual Backup" -ForegroundColor Cyan
Write-Host ""

$backendUrl = "http://localhost:8000"

# Check if backend is running
Write-Host "Checking backend..." -ForegroundColor Yellow
try {
    $null = Invoke-RestMethod -Uri "$backendUrl/backup/config" -Method Get -ErrorAction Stop
    Write-Host "[OK] Backend is running" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Backend is not running. Start it first." -ForegroundColor Red
    exit 1
}

# Trigger backup
Write-Host "Creating backup..." -ForegroundColor Yellow
try {
    $result = Invoke-RestMethod -Uri "$backendUrl/backup/create" -Method Post -ErrorAction Stop
    $dests  = ($result.destinations_written) -join ", "
    Write-Host "[OK] Backup created: $($result.filename) ($($result.size_mb) MB) written to $dests" -ForegroundColor Green
} catch {
    $msg = ""
    try {
        $errBody = ($_.ErrorDetails.Message | ConvertFrom-Json)
        $msg = $errBody.detail
    } catch {
        $msg = $_.Exception.Message
    }
    Write-Host "[ERROR] Backup failed: $msg" -ForegroundColor Red
    exit 1
}
