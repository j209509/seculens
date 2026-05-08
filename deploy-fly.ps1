# SecuLens 本番デプロイスクリプト（Fly.io）
# 実行: .\deploy-fly.ps1
#   - 環境変数は .env.local から読み込みます
$ErrorActionPreference = "Stop"
$env:Path += ";C:\Users\81908\AppData\Local\Microsoft\WinGet\Links"

Write-Host "==> Fly.io デプロイ開始" -ForegroundColor Cyan

# .env.local 読み込み
if (-not (Test-Path ".env.local")) {
  Write-Host "❌ .env.local が見つかりません" -ForegroundColor Red; exit 1
}
$envVars = @{}
Get-Content .env.local | ForEach-Object {
  if ($_ -match '^\s*([^#=]+?)\s*=\s*(.*)\s*$') {
    $envVars[$Matches[1]] = $Matches[2]
  }
}

# ログイン確認
$me = flyctl auth whoami 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "❌ ログインしてません。先に: flyctl auth signup または flyctl auth login" -ForegroundColor Red
  exit 1
}
Write-Host "✅ ログイン済み: $me" -ForegroundColor Green

# アプリ名（被ったらランダム付与）
$APP_NAME = "seculens"
Write-Host "==> アプリ作成: $APP_NAME"
flyctl apps create $APP_NAME --org personal 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  $APP_NAME = "seculens-" + ([guid]::NewGuid().ToString().Substring(0,6))
  Write-Host "==> 名前競合のため変更: $APP_NAME"
  flyctl apps create $APP_NAME --org personal
  if ($LASTEXITCODE -ne 0) { Write-Host "❌ アプリ作成失敗" -ForegroundColor Red; exit 1 }
  (Get-Content fly.toml) -replace '^app = ".*"', "app = `"$APP_NAME`"" | Set-Content fly.toml
}
Write-Host "✅ アプリ: $APP_NAME"

# Postgres
$DB_NAME = "$APP_NAME-db"
Write-Host "==> Postgres作成: $DB_NAME"
flyctl postgres create --name $DB_NAME --region nrt --org personal --initial-cluster-size 1 --vm-size shared-cpu-1x --volume-size 1 --autostart 2>&1 | Tee-Object -Variable pgOut
if ($LASTEXITCODE -ne 0 -and ($pgOut -notmatch "already exists")) {
  Write-Host "❌ Postgres作成失敗" -ForegroundColor Red; exit 1
}

# Attach
Write-Host "==> Postgres アタッチ"
flyctl postgres attach $DB_NAME --app $APP_NAME --yes 2>&1 | Out-Null
Write-Host "✅ DATABASE_URL 自動設定済み"

# Secrets（.env.local から）
Write-Host "==> 環境変数設定"
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
Write-Host "✅ シークレット設定完了"

# デプロイ
Write-Host "==> デプロイ実行（5〜10分）"
flyctl deploy --app $APP_NAME --remote-only --ha=false
if ($LASTEXITCODE -ne 0) { Write-Host "❌ デプロイ失敗" -ForegroundColor Red; exit 1 }

$URL = "https://$APP_NAME.fly.dev"
Write-Host ""
Write-Host "🎉 デプロイ完了！" -ForegroundColor Green
Write-Host "URL: $URL" -ForegroundColor Cyan
flyctl status --app $APP_NAME
