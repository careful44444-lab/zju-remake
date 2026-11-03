$ErrorActionPreference = 'SilentlyContinue'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$LogDir = Join-Path $Root 'logs'
$LogFile = Join-Path $LogDir 'autostart.log'

function Write-Log([string]$m) {
  if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }
  $line = ('{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m)
  Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8
}

Write-Host ''
Write-Host '  Stopping beta service and tunnel ...'
Write-Host ''

# 1) stop whatever listens on 8123
$killed = 0
$conns = Get-NetTCPConnection -LocalPort 8123 -State Listen -ErrorAction SilentlyContinue
foreach ($c in ($conns | Select-Object -ExpandProperty OwningProcess -Unique)) {
  $p = Get-Process -Id $c -ErrorAction SilentlyContinue
  if ($p) {
    Write-Host ('    stop : ' + $p.ProcessName + ' (pid ' + $p.Id + ')')
    Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
    $killed++
  }
}
if ($killed -eq 0) { Write-Host '    port 8123 : not running' }

# 2) stop cloudflared tunnel
$cf = Get-Process cloudflared -ErrorAction SilentlyContinue
if ($cf) {
  foreach ($p in $cf) {
    Write-Host ('    stop : cloudflared (pid ' + $p.Id + ')')
    Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
  }
} else {
  Write-Host '    cloudflared : not running'
}

Start-Sleep -Milliseconds 600
$still = Get-NetTCPConnection -LocalPort 8123 -State Listen -ErrorAction SilentlyContinue
Write-Host ''
if ($still) {
  Write-Host '  [X] port 8123 is still busy' -ForegroundColor Red
  Write-Log 'stop: port still busy'
} else {
  Write-Host '  [OK] stopped. The public URL is offline now.' -ForegroundColor Green
  Write-Log 'stopped by user'
}
Write-Host ''
Write-Host '  note: autostart only runs when you log in to Windows.'
Write-Host '        It will NOT restart by itself while you stay logged in.'
Write-Host '        To turn autostart off: run  开机自启-取消.bat'
Write-Host ''
