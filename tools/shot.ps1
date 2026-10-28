# 用 Edge 无头模式截图，配置目录放系统临时目录，不污染仓库
param(
  [Parameter(Mandatory=$true)][string]$Url,
  [Parameter(Mandatory=$true)][string]$Out,
  [int]$Width = 480,
  [int]$Height = 900,
  [double]$Scale = 2,
  [int]$Budget = 7000
)

$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "C:\Program Files\Microsoft\Edge\Application\msedge.exe" }

$profileDir = Join-Path $env:TEMP ("zjushot-" + [guid]::NewGuid().ToString("N").Substring(0,8))
$args = @(
  "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-breakpad",
  "--hide-scrollbars", "--run-all-compositor-stages-before-draw",
  "--force-device-scale-factor=$Scale",
  "--window-size=$Width,$Height",
  "--virtual-time-budget=$Budget",
  "--user-data-dir=$profileDir",
  "--screenshot=$Out",
  $Url
)
Get-Process msedge -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Process -FilePath $edge -ArgumentList $args -WindowStyle Hidden
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Milliseconds 700
  if (Test-Path $Out) { break }
}
Get-Process msedge -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 300
Remove-Item -LiteralPath $profileDir -Recurse -Force -ErrorAction SilentlyContinue
if (Test-Path $Out) { Write-Host "截图完成: $Out" } else { Write-Host "截图失败"; exit 1 }
