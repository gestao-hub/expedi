# provision.ps1 — resgata o código de instalação e escreve os 2 configs.
# Uso: provision.ps1 -Code "EXPED-7K4P-2QXM" [-CloudApi "https://app-exped.vercel.app"]
param(
  [Parameter(Mandatory=$true)][string]$Code,
  [string]$CloudApi = "https://app-exped.vercel.app",
  [string]$Root = "C:\Exped"
)
$ErrorActionPreference = "Stop"

# 1) Resgatar
$body = @{ code = $Code } | ConvertTo-Json -Compress
try {
  $resp = Invoke-RestMethod -Method Post -Uri "$CloudApi/api/provision/redeem" `
            -ContentType "application/json" -Body $body -TimeoutSec 30
} catch {
  Write-Error "Falha ao resgatar o código. Verifique a internet e gere um novo código no painel. ($_)"
  exit 2
}
if (-not $resp.deviceToken) { Write-Error "Resgate sem token — código inválido ou expirado."; exit 3 }

$token  = $resp.deviceToken
$cloud  = $resp.cloudApiUrl

# 2) Escrever config.json do hub (preserva jwtSecret/portas já gerados no install)
$cfgPath = Join-Path $Root "config.json"
$cfg = if (Test-Path $cfgPath) { Get-Content $cfgPath -Raw | ConvertFrom-Json } else { [pscustomobject]@{} }
$cfg | Add-Member -NotePropertyName cloud -NotePropertyValue ([pscustomobject]@{ apiBase=$cloud; deviceToken=$token }) -Force
($cfg | ConvertTo-Json -Depth 8) | Set-Content -Path $cfgPath -Encoding UTF8

# 3) Escrever appsettings.json do agente (aponta pro hub LOCAL)
$agentDir = Join-Path $env:LOCALAPPDATA "ExpedAgent"
$appPath  = Join-Path $agentDir "appsettings.json"
if (Test-Path $appPath) {
  $app = Get-Content $appPath -Raw | ConvertFrom-Json
  $app.Agent.ApiBaseUrl = "http://127.0.0.1:3000"
  $app.Agent.DeviceToken = $token
  ($app | ConvertTo-Json -Depth 8) | Set-Content -Path $appPath -Encoding UTF8
}
Write-Host "Provisionamento concluído para a empresa: $($resp.empresaNome)"
