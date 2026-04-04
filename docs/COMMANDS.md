# Project Intel V2 - Command Reference

All commands run from project root: `C:\repos\pm_tool`

## Daily Operations

### Start Backend
```powershell
.\scripts\start_backend.ps1
```

### Stop Backend
```powershell
.\scripts\stop_backend.ps1
```

### Check Status
```powershell
.\scripts\status.ps1
```

### After Reboot
```powershell
.\scripts\after_reboot.ps1
```

## Testing

### Run All Tests
```powershell
cd tests
.\run_tests.ps1
```

### Run Specific Test
```powershell
cd tests
.\run_tests.ps1 -Test upload
.\run_tests.ps1 -Test notifications
.\run_tests.ps1 -Test chat
.\run_tests.ps1 -Test crud
```

## Data Management

### Backup Data
```powershell
.\scripts\backup_data.ps1
```

### Restore Backup
```powershell
# List available backups
Get-ChildItem backups

# Restore specific backup
.\scripts\restore_backup.ps1 -Timestamp YYYYMMDD_HHMMSS
```

### Reset All Data (Clean Slate)
```powershell
.\scripts\reset_data.ps1
```
⚠️ **WARNING:** This permanently deletes all data!

## Troubleshooting

### If Database is Locked
```powershell
.\scripts\stop_backend.ps1
# Wait 5 seconds
.\scripts\start_backend.ps1
```

### Check What's Running
```powershell
.\scripts\status.ps1
```

### View Ollama Models
```powershell
ollama list
```

### Fresh Start (Nuclear Option)
```powershell
.\scripts\stop_backend.ps1
.\scripts\reset_data.ps1
.\scripts\start_backend.ps1
```