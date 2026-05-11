$ErrorActionPreference = 'Stop'

# More stable auto-reload behavior for Windows terminals.
$env:WATCHFILES_FORCE_POLLING = 'true'
$env:PYTHONUTF8 = '1'

Write-Host 'Installing dependencies...'
python -m pip install -r requirements.txt

Write-Host 'Starting Backend Server...'
# Keep reload for dev, but force polling watcher to avoid spawn/watchfiles stdin issues.
python -m uvicorn main:app --reload --reload-dir . --host 127.0.0.1 --port 8000
