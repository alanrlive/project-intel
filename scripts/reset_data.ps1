# reset_data.ps1 - Delete all data and start fresh

Write-Host "WARNING: This will DELETE all project data!" -ForegroundColor Red
Write-Host "   - Database (backend/data/project.db)" -ForegroundColor Yellow
Write-Host "   - Uploaded files (backend/data/uploads/*)" -ForegroundColor Yellow
Write-Host "   - Vector index (backend/data/chroma/)" -ForegroundColor Yellow
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
$processes = Get-WmiObject Win32_Process -Filter "Name='python.exe'" |
    Where-Object { $_.CommandLine -like "*uvicorn*" }
if ($processes) {
    $processes | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Write-Host "   [OK] Backend stopped" -ForegroundColor Green
} else {
    Get-Process -Name python -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Write-Host "   [OK] Python processes stopped" -ForegroundColor Green
}

Start-Sleep -Seconds 2

# Delete database
Write-Host "`n2. Deleting database..." -ForegroundColor Yellow
if (Test-Path "data\project.db") {
    $deleted = $false
    for ($i = 0; $i -lt 3; $i++) {
        try {
            Remove-Item "data\project.db" -Force -ErrorAction Stop
            $deleted = $true
            break
        } catch {
            Start-Sleep -Seconds 1
        }
    }
    if ($deleted) {
        Write-Host "   [OK] Database deleted" -ForegroundColor Green
    } else {
        Write-Host "   [ERROR] Could not delete database - close all apps using it and retry" -ForegroundColor Red
    }
} else {
    Write-Host "   [INFO] No database found" -ForegroundColor Gray
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

# Delete ChromaDB vector index
Write-Host "`n4. Deleting vector index..." -ForegroundColor Yellow
if (Test-Path "data\chroma") {
    Remove-Item "data\chroma" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "   [OK] Vector index deleted" -ForegroundColor Green
} else {
    Write-Host "   [INFO] No vector index found" -ForegroundColor Gray
}

Pop-Location

Write-Host "`n[OK] Reset complete! Database will be recreated on next start." -ForegroundColor Green
Write-Host "   Run: .\scripts\start_backend.ps1" -ForegroundColor Cyan
Write-Host ""
Write-Host "[WARNING] Do NOT start the backend before restoring a backup." -ForegroundColor Red
Write-Host "          Starting the backend now will create a blank database." -ForegroundColor Yellow
Write-Host "          To restore: .\scripts\restore_backup.ps1 -File <filename>" -ForegroundColor Cyan