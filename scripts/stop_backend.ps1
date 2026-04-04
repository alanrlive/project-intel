# stop_backend.ps1 - Stop Project Intel Backend

Write-Host "Stopping Project Intel V2 Backend..." -ForegroundColor Cyan

# Find and stop uvicorn/python processes
$processes = Get-Process | Where-Object {
    $_.ProcessName -eq "python" -and 
    $_.CommandLine -like "*uvicorn*"
}

if ($processes) {
    Write-Host "`nFound $($processes.Count) backend process(es)" -ForegroundColor Yellow
    foreach ($proc in $processes) {
        Write-Host "   Stopping PID $($proc.Id)..." -ForegroundColor Gray
        Stop-Process -Id $proc.Id -Force
    }
    Write-Host "Backend stopped" -ForegroundColor Green
} else {
    Write-Host "No backend process running" -ForegroundColor Cyan
}