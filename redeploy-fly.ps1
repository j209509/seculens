# Re-deploy only (app and postgres already exist)
$env:Path += ";C:\Users\81908\AppData\Local\Microsoft\WinGet\Links"
$ErrorActionPreference = "Continue"
$PSNativeCommandUseErrorActionPreference = $false

Write-Host "==> Redeploying seculens" -ForegroundColor Cyan
flyctl deploy --app seculens --remote-only --ha=false
if ($LASTEXITCODE -ne 0) {
  Write-Host "ERROR: deploy failed" -ForegroundColor Red
  exit 1
}
Write-Host "DONE! https://seculens.fly.dev" -ForegroundColor Green
flyctl status --app seculens
