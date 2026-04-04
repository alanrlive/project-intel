# reset_data.ps1 - Delete all data and start fresh

Write-Host "WARNING: This will DELETE all project data!" -ForegroundColor Red
Write-Host "   - Database (backend/data/project.db)" -ForegroundColor Yellow
Write-Host "   - Uploaded files (backend/data/uploads/*)" -ForegroundColor Yellow
Write-Host ""

$confirmation = Read-Host "Type 'DELETE' to confirm"

if ($confirmation -ne "DELETE") {
    Write-Host "[CANCELLED] Data not deleted" -ForegroundColor Red
    exit
}

Write-Host "`nResetting data..." -ForegroundColor Cyan

# Navigate to backend directory
$backendPath = Join-Path $PSScriptRoot "..\backend"
Push-Location $backendPath

# Stop backend first
Write-Host "`n1. Stopping backend..." -ForegroundColor Yellow
$processes = Get-Process -Name python -ErrorAction SilentlyContinue | 
    Where-Object { $_.CommandLine -like "*uvicorn*" }
if ($processes) {
    $processes | Stop-Process -Force
    Write-Host "   [OK] Backend stopped" -ForegroundColor Green
} else {
    Write-Host "   [INFO] Backend not running" -ForegroundColor Gray
}

Start-Sleep -Seconds 1

# Delete database
Write-Host "`n2. Deleting database..." -ForegroundColor Yellow
if (Test-Path "data\project.db") {
    Remove-Item "data\project.db" -Force
    Write-Host "   [OK] Database deleted" -ForegroundColor Green
} else {
    Write-Host "   [INFO] Database doesn't exist" -ForegroundColor Gray
}

# Delete uploaded files
Write-Host "`n3. Deleting uploaded files..." -ForegroundColor Yellow
if (Test-Path "data\uploads") {
    $fileCount = (Get-ChildItem "data\uploads" -File -ErrorAction SilentlyContinue).Count
    if ($fileCount -gt 0) {
        Remove-Item "data\uploads\*" -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "   [OK] Deleted $fileCount file(s)" -ForegroundColor Green
    } else {
        Write-Host "   [INFO] No files to delete" -ForegroundColor Gray
    }
} else {
    Write-Host "   [INFO] No uploads folder" -ForegroundColor Gray
}

Pop-Location

Write-Host "`n[OK] Reset complete! Database will be recreated on next start." -ForegroundColor Green
Write-Host "   Run: .\scripts\start_backend.ps1" -ForegroundColor Cyan