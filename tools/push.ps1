# 一键推送：先走代理，失败再试直连，最后告诉你怎么回事
$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

Write-Host ""
Write-Host "  紫金港改造计划 · 推送到 GitHub" -ForegroundColor Cyan
Write-Host "  ------------------------------------" -ForegroundColor DarkGray

# 0) 有没有要推的
$branch = (git rev-parse --abbrev-ref HEAD) 2>$null
$ahead = (git rev-list --count "origin/$branch..$branch" 2>$null)
$dirty = (git status --porcelain 2>$null)

if ($dirty) {
  Write-Host "  有未提交的改动：" -ForegroundColor Yellow
  $dirty | Select-Object -First 8 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
  Write-Host "  先提交再推，或者告诉我帮你提交。" -ForegroundColor Yellow
  Write-Host ""
  return
}
if (-not $ahead -or [int]$ahead -eq 0) {
  Write-Host "  本地和远端一样，没有要推的东西。" -ForegroundColor Green
  Write-Host ""
  return
}

Write-Host "  待推送 $ahead 个提交：" -ForegroundColor DarkGray
git log --oneline "origin/$branch..$branch" | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
Write-Host ""

# 1) 先试代理（仓库里配好的 127.0.0.1:7890）
$proxy = (git config --local --get http.proxy)
if (-not $proxy) { $proxy = 'http://127.0.0.1:7890' }

Write-Host "  [1/2] 走代理 $proxy ..." -NoNewline
$out = git push origin $branch 2>&1 | Out-String
if ($out -match '->\s*\S+') {
  Write-Host " 成功" -ForegroundColor Green
  Write-Host ""
  Write-Host "  已推送到 https://github.com/careful44444-lab/zju-remake" -ForegroundColor Cyan
  Write-Host ""
  return
}
Write-Host " 不行" -ForegroundColor Yellow

# 2) 代理不行，试直连
Write-Host "  [2/2] 试直连 ..." -NoNewline
$out2 = git -c http.proxy= -c https.proxy= push origin $branch 2>&1 | Out-String
if ($out2 -match '->\s*\S+') {
  Write-Host " 成功" -ForegroundColor Green
  Write-Host ""
  Write-Host "  已推送（这次没走代理，但下次可能又要）" -ForegroundColor Cyan
  Write-Host ""
  return
}
Write-Host " 也不行" -ForegroundColor Red
Write-Host ""
Write-Host "  两种方式都失败了。" -ForegroundColor Red
Write-Host "  最可能的原因：代理软件没开。" -ForegroundColor Yellow
Write-Host ""
Write-Host "  检查一下：" -ForegroundColor DarkGray
Write-Host "    1. 代理软件（Clash / v2ray 之类）是不是在运行" -ForegroundColor DarkGray
Write-Host "    2. 端口是不是 7890（不是的话告诉我，改两行配置）" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  最后一次的报错：" -ForegroundColor DarkGray
($out2 -split "`n" | Where-Object { $_ -match 'fatal|error' } | Select-Object -First 2) | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkRed }
Write-Host ""
