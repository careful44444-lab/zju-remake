$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$LogDir = Join-Path $Root 'logs'
$LogFile = Join-Path $LogDir 'autostart.log'
$TaskName = 'ZJU-Remake-Beta'
$VbsName = 'ZJU-Remake-Autostart.vbs'

$Mode = 'help'
if ($args.Count -gt 0) { $Mode = ($args[0] -replace '^-', '').ToLower() }

function Write-Log([string]$m) {
  if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }
  $line = ('{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m)
  Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8
}

function Get-NodePath {
  $p = Join-Path $Root 'node-path.txt'
  if (Test-Path $p) {
    $n = (Get-Content $p -Raw).Trim()
    if ($n -and (Test-Path $n)) { return $n }
  }
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $c1 = Join-Path $env:ProgramFiles 'nodejs\node.exe'
  if (Test-Path $c1) { return $c1 }
  $c2 = Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe'
  if (Test-Path $c2) { return $c2 }
  return $null
}

function Test-PortBusy {
  try {
    $c = Get-NetTCPConnection -LocalPort 8123 -State Listen -ErrorAction Stop
    return ($null -ne $c)
  } catch { return $false }
}

function Get-StartupDir {
  return (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup')
}

function Start-Beta {
  $node = Get-NodePath
  if (-not $node) { Write-Log 'start failed: node.exe not found'; Write-Host '  [X] node.exe not found'; return }
  if (Test-PortBusy) { Write-Log 'port 8123 busy, skip'; Write-Host '  [=] already running on 8123, skip'; return }
  Write-Log ('launching: ' + $node)
  $out = Join-Path $LogDir 'server.out.log'
  $err = Join-Path $LogDir 'server.err.log'
  $p = Start-Process -FilePath $node -ArgumentList 'tools/launch.js' -WorkingDirectory $Root -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err -PassThru
  Write-Log ('started pid=' + $p.Id)
  Write-Host ('  [OK] started, pid=' + $p.Id)
}

function Install-Autostart {
  $node = Get-NodePath
  if (-not $node) { Write-Host '  [X] run the normal launcher once first'; return }
  $dir = Get-StartupDir
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  $vbs = Join-Path $dir $VbsName
  $ps1 = $PSCommandPath
  $cmd = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $ps1 + '" -run'
  $body = 'Set sh = CreateObject("WScript.Shell")' + "`r`n" + 'sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""' + $ps1 + '"" -run", 0, False' + "`r`n"
  [System.IO.File]::WriteAllText($vbs, $body, [System.Text.Encoding]::Default)
  Write-Log ('installed: ' + $vbs)
  Write-Host ''
  Write-Host '  [OK] autostart installed' -ForegroundColor Green
  Write-Host ('       file : ' + $vbs)
  Write-Host ('       log  : ' + $LogFile)
  Write-Host ''
}

function Remove-Autostart {
  $vbs = Join-Path (Get-StartupDir) $VbsName
  if (Test-Path $vbs) {
    Remove-Item -LiteralPath $vbs -Force
    Write-Log 'autostart removed'
    Write-Host '  [OK] autostart removed (running service untouched)' -ForegroundColor Green
  } else {
    Write-Host '  [=] no autostart file, nothing to remove' -ForegroundColor Yellow
  }
  try { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop } catch { }
}

function Show-Status {
  $vbs = Join-Path (Get-StartupDir) $VbsName
  if (Test-Path $vbs) { Write-Host '  autostart : installed' } else { Write-Host '  autostart : not installed' }
  if (Test-PortBusy) { Write-Host '  port 8123 : running' } else { Write-Host '  port 8123 : not running' }
  if (Test-Path $LogFile) {
    Write-Host ''
    Write-Host '  recent log:'
    Get-Content $LogFile -Tail 6 | ForEach-Object { Write-Host ('    ' + $_) }
  }
}

switch ($Mode) {
  'install'   { Install-Autostart }
  'uninstall' { Remove-Autostart }
  'run'       { Start-Beta }
  'status'    { Show-Status }
  default {
    Write-Host 'usage: autostart.ps1 -install | -uninstall | -run | -status'
  }
}
