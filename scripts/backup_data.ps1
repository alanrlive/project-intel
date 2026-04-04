# backup_data.ps1 - Create timestamped backup

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

# Navigate to backend directory
$backendPath = Join-Path $PSScriptRoot "..\backend"
Push-Location $backendPath

# Create backup directory in project root
$backupDir = "..\backups\$timestamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

Write-Host "Creating backup..." -ForegroundColor Cyan

# Copy database
if (Test-Path "data\project.db") {
    Copy-Item "data\project.db" "$backupDir\project.db"
    Write-Host "   [OK] Database backed up" -ForegroundColor Green
} else {
    Write-Host "   [WARNING] No database to backup" -ForegroundColor Yellow
}

# Copy uploads
if (Test-Path "data\uploads") {
    $uploadCount = (Get-ChildItem "data\uploads" -File -Recurse -ErrorAction SilentlyContinue).Count
    if ($uploadCount -gt 0) {
        Copy-Item "data\uploads" "$backupDir\uploads" -Recurse
        Write-Host "   [OK] $uploadCount file(s) backed up" -ForegroundColor Green
    }
}

# Copy config
if (Test-Path ".env") {
    Copy-Item ".env" "$backupDir\.env"
    Write-Host "   [OK] Config backed up" -ForegroundColor Green
}

Pop-Location

$backupSize = (Get-ChildItem $backupDir -Recurse -ErrorAction SilentlyContinue | 
    Measure-Object -Property Length -Sum).Sum / 1MB

Write-Host "`n[OK] Backup created: backups\$timestamp" -ForegroundColor Green
Write-Host "   Size: $([math]::Round($backupSize, 2)) MB" -ForegroundColor Gray
Write-Host "`nTo restore:" -ForegroundColor Cyan
Write-Host "   .\scripts\restore_backup.ps1 -Timestamp $timestamp" -ForegroundColor Gray