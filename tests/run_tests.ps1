# tests/run_tests.ps1 - Run all tests

param(
    [string]$Test = "all"  # all, upload, notifications, chat, crud
)

Write-Host "🧪 Project Intel V2 - Test Suite" -ForegroundColor Cyan

# Activate venv
$backendPath = Join-Path $PSScriptRoot "..\backend"
Push-Location $backendPath
.\.venv\Scripts\Activate.ps1
Pop-Location

# Change to tests directory
Set-Location $PSScriptRoot

$tests = @()
switch ($Test) {
    "all" {
        $tests = @(
            "test_single_upload.py",
            "test_notifications.py", 
            "test_chat.py",
            "test_crud.py"
        )
    }
    default {
        $tests = @("test_$Test.py")
    }
}

foreach ($testFile in $tests) {
    Write-Host "`n▶️  Running $testFile..." -ForegroundColor Yellow
    python $testFile
    Write-Host ""
}

Write-Host "✅ Tests complete!" -ForegroundColor Green