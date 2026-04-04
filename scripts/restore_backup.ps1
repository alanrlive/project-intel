# scripts/restore_backup.ps1 - Restore from backup

param(
    [Parameter(Mandatory=$true)]
    [string]$Timestamp  # Format: YYYYMMDD_HHMMSS
)

$backupDir = Join-Path $PSScriptRoot "..\backups\$Timestamp"

if (-not (Test-Path $backupDir)) {
    Write-Host "❌ Backup not found: $backupDir" -ForegroundColor Red
    Write-Host "`nAvailable backups:" -ForegroundColor Yellow
    Get-ChildItem (Join-Path $PSScriptRoot "..\backups") -Directory | 
        ForEach-Object { Write-Host "   • $($_.Name)" -ForegroundColor Gray }
    exit
}

Write-Host "⚠️  WARNING: This will REPLACE current data with backup!" -ForegroundColor Red
Write-Host "   Backup: $Timestamp" -ForegroundColor Yellow
Write-Host ""

$confirmation = Read-Host "Type 'RESTORE' to confirm"

if ($confirmation -ne "RESTORE") {
    Write-Host "❌ Cancelled" -ForegroundColor Red
    exit
}

Write-Host "`n📦 Restoring from backup..." -ForegroundColor Cyan

# Navigate to backend
$backendPath = Join-Path $PSScriptRoot "..\backend"
Push-Location $backendPath

# Stop backend first
Write-Host "`n1. Stopping backend..." -ForegroundColor Yellow
$processes = Get-Process -Name python -ErrorAction SilentlyContinue | 
    Where-Object { $_.CommandLine -like "*uvicorn*" }
if ($processes) {
    $processes | Stop-Process -Force
    Write-Host "   ✅ Backend stopped" -ForegroundColor Green
} else {
    Write-Host "   ℹ️  Backend not running" -ForegroundColor Gray
}

Start-Sleep -Seconds 1

# Restore database
Write-Host "`n2. Restoring database..." -ForegroundColor Yellow
if (Test-Path "$backupDir\project.db") {
    Copy-Item "$backupDir\project.db" "data\project.db" -Force
    Write-Host "   ✅ Database restored" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  No database in backup" -ForegroundColor Yellow
}

# Restore uploads
Write-Host "`n3. Restoring uploaded files..." -ForegroundColor Yellow
if (Test-Path "$backupDir\uploads") {
    # Clear existing uploads
    if (Test-Path "data\uploads") {
        Remove-Item "data\uploads\*" -Recurse -Force -ErrorAction SilentlyContinue
    } else {
        New-Item -ItemType Directory -Path "data\uploads" -Force | Out-Null
    }
    
    Copy-Item "$backupDir\uploads\*" "data\uploads\" -Recurse -Force
    $fileCount = (Get-ChildItem "data\uploads" -File -Recurse).Count
    Write-Host "   ✅ Restored $fileCount file(s)" -ForegroundColor Green
} else {
    Write-Host "   ℹ️  No uploads in backup" -ForegroundColor Gray
}

# Restore config
Write-Host "`n4. Restoring config..." -ForegroundColor Yellow
if (Test-Path "$backupDir\.env") {
    Copy-Item "$backupDir\.env" ".env" -Force
    Write-Host "   ✅ Config restored" -ForegroundColor Green
} else {
    Write-Host "   ℹ️  No config in backup" -ForegroundColor Gray
}

Pop-Location

Write-Host "`n✅ Restore complete!" -ForegroundColor Green
Write-Host "   Run: .\scripts\start_backend.ps1" -ForegroundColor Cyan