# restore_backup.ps1 - Stop backend, restore a backup zip, restart backend
#
# Usage:
#   .\restore_backup.ps1 -File project_intel_backup_2026-04-20_14-30.zip
#   .\restore_backup.ps1 -File project_intel_backup_2026-04-20_14-30.zip -BackupDir "C:\Backups"
#
# If -BackupDir is omitted, the first non-empty destination path is read
# from the running backend (if up) or directly from settings.json on disk.

param(
    [Parameter(Mandatory = $true)]
    [string]$File,

    [Parameter(Mandatory = $false)]
    [string]$BackupDir = ""
)

Write-Host "Project Intel V2 - Restore from Backup" -ForegroundColor Cyan
Write-Host ""

$backendUrl  = "http://localhost:8000"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$backendPath = Join-Path $projectRoot "backend"
$venvPython  = Join-Path $backendPath ".venv\Scripts\python.exe"

# Verify Python venv exists
if (-not (Test-Path $venvPython)) {
    Write-Host "[ERROR] Python venv not found at: $venvPython" -ForegroundColor Red
    Write-Host "[INFO]  Run: cd backend; python -m venv .venv; .venv\Scripts\pip install -r requirements.txt" -ForegroundColor Yellow
    exit 1
}

# Check if backend is running
$backendRunning = $false
try {
    $null = Invoke-RestMethod -Uri "$backendUrl/health" -Method Get -ErrorAction Stop
    $backendRunning = $true
    Write-Host "[INFO] Backend is running on port 8000" -ForegroundColor Yellow
} catch {
    Write-Host "[INFO] Backend is not running - proceeding with restore" -ForegroundColor Yellow
}

# If backend is running, read config (for destination if needed) then stop it
if ($backendRunning) {
    if (-not $BackupDir) {
        Write-Host "[INFO] Reading backup destinations from backend config..." -ForegroundColor Yellow
        try {
            $config = Invoke-RestMethod -Uri "$backendUrl/backup/config" -Method Get -ErrorAction Stop
            foreach ($dest in $config.destinations) {
                if ($dest.path -and $dest.path.Trim() -ne "") {
                    $BackupDir = $dest.path.Trim()
                    Write-Host "[INFO] Using destination: $BackupDir" -ForegroundColor Yellow
                    break
                }
            }
        } catch {
            Write-Host "[ERROR] Failed to read backup config: $($_.Exception.Message)" -ForegroundColor Red
            exit 1
        }
    }

    # Stop uvicorn
    Write-Host "[INFO] Stopping backend..." -ForegroundColor Yellow
    $uvicornProcs = Get-WmiObject Win32_Process | Where-Object { $_.CommandLine -like "*uvicorn*" }
    if ($uvicornProcs) {
        foreach ($proc in $uvicornProcs) {
            Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep -Seconds 2
        Write-Host "[INFO] Backend stopped" -ForegroundColor Yellow
    } else {
        Write-Host "[INFO] No uvicorn process found - may have already stopped" -ForegroundColor Yellow
    }
}

# If still no BackupDir, read settings.json directly from disk
if (-not $BackupDir) {
    $settingsFile = Join-Path $backendPath "config\settings.json"
    if (Test-Path $settingsFile) {
        Write-Host "[INFO] Reading backup destinations from settings.json..." -ForegroundColor Yellow
        try {
            $settings = Get-Content $settingsFile -Raw | ConvertFrom-Json
            foreach ($dest in $settings.backup.destinations) {
                if ($dest.path -and $dest.path.Trim() -ne "") {
                    $BackupDir = $dest.path.Trim()
                    Write-Host "[INFO] Using destination: $BackupDir" -ForegroundColor Yellow
                    break
                }
            }
        } catch {
            Write-Host "[WARN] Could not parse settings.json: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
}

# Validate we have a backup directory
if (-not $BackupDir) {
    Write-Host "[ERROR] No backup directory found." -ForegroundColor Red
    Write-Host "[INFO]  Provide it explicitly: .\restore_backup.ps1 -File <filename> -BackupDir <path>" -ForegroundColor Yellow
    exit 1
}

# Resolve and validate the zip path
$zipPath = Join-Path $BackupDir $File
if (-not (Test-Path $zipPath)) {
    Write-Host "[ERROR] Backup file not found: $zipPath" -ForegroundColor Red
    exit 1
}

Write-Host "[INFO] Restoring from: $zipPath" -ForegroundColor Yellow

# Call backup_service.py directly via Python, bypassing HTTP entirely.
# restore_backup() checks port 8000 - since uvicorn is stopped the port
# is free and the restore proceeds.
$pythonCode = @"
import sys
sys.path.insert(0, r'$backendPath')
try:
    from app.backup_service import restore_backup
    result = restore_backup(r'$zipPath', r'$projectRoot')
    print('OK:' + result['filename'])
except Exception as e:
    detail = getattr(e, 'detail', None)
    print('ERROR:' + str(detail if detail is not None else e))
    sys.exit(1)
"@

$pythonOutput = & $venvPython -c $pythonCode

if ($LASTEXITCODE -eq 0 -and "$pythonOutput" -like "OK:*") {
    Write-Host "[OK] Restore complete. Restarting backend..." -ForegroundColor Green

    # Start uvicorn in a new PowerShell window
    $startCmd = "Set-Location '$backendPath'; .\.venv\Scripts\Activate.ps1; uvicorn app.main:app --reload"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $startCmd

    Write-Host "[OK] Backend restarted. Restore complete." -ForegroundColor Green
} else {
    $errDetail = "$pythonOutput" -replace "^ERROR:", ""
    Write-Host "[ERROR] Restore failed: $errDetail" -ForegroundColor Red
    exit 1
}
