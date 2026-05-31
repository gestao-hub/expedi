<#
.SYNOPSIS
    Baixa os binarios win-x64 do hub local do Exped (PostgreSQL + PostgREST) para C:\Exped\bin.

.DESCRIPTION
    O hub local roda a pilha Supabase nativa (sem Docker):
      - PostgreSQL  (banco)          -> baixado por este script (zip oficial EDB)
      - PostgREST   (REST API)       -> baixado por este script (release GitHub)
      - GoTrue/auth (login)          -> NAO baixado aqui. O auth.exe + migrations/
                                        vem JUNTO do pacote do hub (cross-compilado
                                        win-x64 a partir de supabase/auth; ver README.md).

    Apos rodar, a estrutura fica:
      C:\Exped\bin\
        pgsql\        (PostgreSQL: bin\initdb.exe, bin\pg_ctl.exe, bin\psql.exe, ...)
        postgrest.exe
        auth.exe      (vem do pacote, copiado pelo instalador do hub)
        migrations\   (vem do pacote, copiado pelo instalador do hub)

.NOTES
    URLs validadas em 2026-05-31 (HTTP 200 / 302->200) a partir do Linux.
    Se uma versao sair do ar, ajuste $PgVersion / $PostgrestVersion abaixo.
#>

[CmdletBinding()]
param(
    [string]$InstallDir       = 'C:\Exped\bin',
    [string]$PgVersion        = '16.9-1',   # PostgreSQL EDB win-x64
    [string]$PostgrestVersion = 'v14.12'    # PostgREST release tag
)

$ErrorActionPreference = 'Stop'
$ProgressPreference     = 'SilentlyContinue'  # downloads muito mais rapidos no Invoke-WebRequest

# TLS 1.2 (Windows Server / PowerShell 5.1 antigo pode nao habilitar por padrao)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }

# ---------------------------------------------------------------------------
# 0. Preparar diretorios
# ---------------------------------------------------------------------------
Write-Step "Criando diretorio de instalacao: $InstallDir"
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
$tmp = Join-Path $env:TEMP "exped-hub-dl"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

# ---------------------------------------------------------------------------
# 1. PostgreSQL (zip oficial EDB)
# ---------------------------------------------------------------------------
$pgUrl = "https://get.enterprisedb.com/postgresql/postgresql-$PgVersion-windows-x64-binaries.zip"
$pgZip = Join-Path $tmp "postgresql.zip"
Write-Step "Baixando PostgreSQL $PgVersion ..."
Write-Host "    $pgUrl"
Invoke-WebRequest -Uri $pgUrl -OutFile $pgZip

Write-Step "Extraindo PostgreSQL para $InstallDir\pgsql ..."
# O zip da EDB contem uma pasta raiz "pgsql\". Extraimos direto em $InstallDir.
if (Test-Path (Join-Path $InstallDir 'pgsql')) {
    Remove-Item -Recurse -Force (Join-Path $InstallDir 'pgsql')
}
Expand-Archive -Path $pgZip -DestinationPath $InstallDir -Force

$initdb = Join-Path $InstallDir 'pgsql\bin\initdb.exe'
if (-not (Test-Path $initdb)) {
    throw "initdb.exe nao encontrado em $initdb apos extracao. Verifique o layout do zip."
}
Write-Host "    OK: $initdb"

# ---------------------------------------------------------------------------
# 2. PostgREST (release GitHub, asset windows-x86-64)
# ---------------------------------------------------------------------------
$prUrl = "https://github.com/PostgREST/postgrest/releases/download/$PostgrestVersion/postgrest-$PostgrestVersion-windows-x86-64.zip"
$prZip = Join-Path $tmp "postgrest.zip"
Write-Step "Baixando PostgREST $PostgrestVersion ..."
Write-Host "    $prUrl"
Invoke-WebRequest -Uri $prUrl -OutFile $prZip

Write-Step "Extraindo PostgREST para $InstallDir ..."
Expand-Archive -Path $prZip -DestinationPath $InstallDir -Force

$postgrest = Join-Path $InstallDir 'postgrest.exe'
if (-not (Test-Path $postgrest)) {
    throw "postgrest.exe nao encontrado em $postgrest apos extracao."
}
Write-Host "    OK: $postgrest"

# ---------------------------------------------------------------------------
# 3. GoTrue / auth.exe  (NAO baixado — vem do pacote do hub)
# ---------------------------------------------------------------------------
Write-Step "GoTrue (auth.exe + migrations\): NAO baixado por este script."
Write-Host  "    O auth.exe win-x64 e a pasta migrations\ sao cross-compilados a partir"
Write-Host  "    de github.com/supabase/auth e distribuidos JUNTO do pacote do hub."
Write-Host  "    O instalador do hub os copia para $InstallDir\auth.exe e $InstallDir\migrations\."
$authExe = Join-Path $InstallDir 'auth.exe'
if (Test-Path $authExe) {
    Write-Host "    OK: $authExe ja presente." -ForegroundColor Green
} else {
    Write-Host "    AVISO: $authExe ainda nao presente (sera copiado pelo pacote do hub)." -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
# Limpeza + resumo
# ---------------------------------------------------------------------------
Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue

Write-Step "Concluido. Binarios em $InstallDir :"
Write-Host "    PostgreSQL : pgsql\bin\ (initdb.exe, pg_ctl.exe, psql.exe, postgres.exe)"
Write-Host "    PostgREST  : postgrest.exe"
Write-Host "    GoTrue     : auth.exe + migrations\ (do pacote do hub)"
Write-Host ""
Write-Host "Veja README.md para os passos de validacao de cada binario." -ForegroundColor Cyan
