# SecuLens Fly.io deploy script
$env:Path += ";C:\Users\81908\AppData\Local\Microsoft\WinGet\Links"
# Treat stderr warnings as info, not errors
$ErrorActionPreference = "Continue"
$PSNativeCommandUseErrorActionPreference = $false

Write-Host "==> Fly.io deploy start" -ForegroundColor Cyan

if (-not (Test-Path ".env.local")) {
  Write-Host "ERROR: .env.local not found" -ForegroundColor Red
  exit 1
}
$envVars = @{}
Get-Content .env.local | ForEach-Object {
  if ($_ -match '^\s*([^#=]+?)\s*=\s*(.*)\s*$') {
    $envVars[$Matches[1]] = $Matches[2]
  }
}

$me = flyctl auth whoami 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "ERROR: not logged in. Run: flyctl auth login" -ForegroundColor Red
  exit 1
}
Write-Host "Logged in as: $me" -ForegroundColor Green

$APP_NAME = "seculens"
Write-Host "==> Creating app: $APP_NAME"
flyctl apps create $APP_NAME --org personal 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  $APP_NAME = "seculens-" + ([guid]::NewGuid().ToString().Substring(0,6))
  Write-Host "==> Name taken, using: $APP_NAME"
  flyctl apps create $APP_NAME --org personal
  if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: app create failed" -ForegroundColor Red
    exit 1
  }
  (Get-Content fly.toml) -replace '^app = ".*"', "app = `"$APP_NAME`"" | Set-Content fly.toml
}
Write-Host "App: $APP_NAME"

$DB_NAME = "$APP_NAME-db"
Write-Host "==> Creating Postgres: $DB_NAME"
$pgOut = & flyctl postgres create --name $DB_NAME --region nrt --org personal --initial-cluster-size 1 --vm-size shared-cpu-1x --volume-size 1 --autostart 2>&1 | Out-String
Write-Host $pgOut
if ($LASTEXITCODE -ne 0 -and ($pgOut -notmatch "already exists|already taken")) {
  Write-Host "ERROR: postgres create failed" -ForegroundColor Red
  exit 1
}

Write-Host "==> Attaching Postgres"
flyctl postgres attach $DB_NAME --app $APP_NAME --yes 2>$null | Out-Null
Write-Host "DATABASE_URL configured"

Write-Host "==> Setting secrets"
$keys = @("OPENAI_API_KEY","OPENAI_MODEL","AI_TRIAGE_MODEL","AI_BULK_MODEL",
  "AI_DAILY_BUDGET_USD","AI_MONTHLY_BUDGET_USD","ENCRYPTION_KEY",
  "MAX_REQUESTS_PER_PROGRAM","DEFAULT_DELAY_MS","SCREENSHOT_RETENTION_DAYS",
  "RAW_TRAFFIC_RETENTION_DAYS","HACKERONE_USERNAME","HACKERONE_API_TOKEN")
$secretArgs = @()
foreach ($k in $keys) {
  if ($envVars.ContainsKey($k) -and $envVars[$k]) {
    $secretArgs += "$k=$($envVars[$k])"
  }
}
if ($secretArgs.Count -gt 0) {
  flyctl secrets set --app $APP_NAME --stage @secretArgs
}
Write-Host "Secrets done"

Write-Host "==> Deploying (5-10 min)"
flyctl deploy --app $APP_NAME --remote-only --ha=false
if ($LASTEXITCODE -ne 0) {
  Write-Host "ERROR: deploy failed" -ForegroundColor Red
  exit 1
}

$URL = "https://$APP_NAME.fly.dev"
Write-Host ""
Write-Host "DONE!" -ForegroundColor Green
Write-Host "URL: $URL" -ForegroundColor Cyan
flyctl status --app $APP_NAME
