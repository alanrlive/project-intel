# Project Intel V2 - Command Reference

## Daily Use

### Start Everything
```powershell
.\start_backend.ps1
```

### Stop Everything
```powershell
.\stop_backend.ps1
```

### Check Status
```powershell
.\status.ps1
```

### After System Reboot
```powershell
.\after_reboot.ps1
```

## Testing

### Upload Test Document
```powershell
python test_single_upload.py
```

### Run Full Test Suite
```powershell
python test_notifications.py
python test_chat.py
python test_crud.py
```

## Maintenance

### Reset All Data (Clean Slate)
```powershell
.\reset_data.ps1
```

### Backup Database
```powershell
Copy-Item data\project.db data\project.db.backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')
```

### Restore Database
```powershell
.\stop_backend.ps1
Copy-Item data\project.db.backup_YYYYMMDD_HHMMSS data\project.db
.\start_backend.ps1
```

## Troubleshooting

### Database Locked Error
```powershell
.\stop_backend.ps1
# Wait 5 seconds
.\start_backend.ps1
```

### Check Ollama Models
```powershell
ollama list
```

### View Backend Logs
Logs appear in the terminal where uvicorn is running