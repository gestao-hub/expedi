# Hub local do Exped — binarios Windows (win-x64)

Este diretorio empacota o "hub local" do Exped para Windows: a pilha Supabase
nativa (sem Docker) — **PostgreSQL + PostgREST + GoTrue** — em versoes win-x64.

No spike (sub-projeto 1, Linux) provamos que a pilha roda nativa e o app funciona
contra ela. Aqui preparamos os binarios Windows. O maior risco era o **GoTrue**
(servico de login do Supabase, `github.com/supabase/auth`, escrito em Go), que
**nao tem release oficial para Windows**. Como e Go, cross-compilamos o `.exe`
no Linux — comprovado abaixo.

## Versoes

| Componente | Versao | Origem |
|---|---|---|
| PostgreSQL | 16.9-1 | zip oficial EDB (win-x64) |
| PostgREST | v14.12 | release GitHub (asset `windows-x86-64`) |
| GoTrue (`auth.exe`) | v2.189.0 — commit `4fa66ba71d8c55b5c95cd5635766ed8bbae6d96a` | cross-compilado de `github.com/supabase/auth` |

URLs de download validadas em 2026-05-31 (HTTP 200 / 302->200 a partir do Linux):

- PostgreSQL: `https://get.enterprisedb.com/postgresql/postgresql-16.9-1-windows-x64-binaries.zip`
- PostgREST: `https://github.com/PostgREST/postgrest/releases/download/v14.12/postgrest-v14.12-windows-x86-64.zip`

## Estrutura do pacote

```
hub/win/
  download-binaries.ps1   # baixa PostgreSQL + PostgREST para C:\Exped\bin
  README.md               # este arquivo
  bin/                    # NAO versionado (.gitignore) — binarios grandes
    auth.exe              # GoTrue cross-compilado win-x64 (vem do nosso build)
    migrations/           # 69 migrations SQL do GoTrue (necessarias no boot)
```

`bin/` e ignorado pelo git. O `auth.exe` + `migrations/` sao gerados pelo build
abaixo e distribuidos JUNTO do pacote do hub (nao sao baixados pelo instalador).
PostgreSQL e PostgREST sao baixados em runtime pelo `download-binaries.ps1`.

## Como o `auth.exe` foi gerado (reproduzivel — roda no Linux)

O upstream `supabase/auth` **nao compila para Windows sem patch**: `cmd/serve_cmd.go`
usa `unix.SetsockoptInt(..., unix.SO_REUSEPORT, ...)` via `golang.org/x/sys/unix`,
que nao existe no Windows. Aplicamos um patch minimo separando a `net.ListenConfig`
por plataforma com build tags (`SO_REUSEPORT` so em `!windows`; no Windows um
`net.ListenConfig{}` padrao — uma unica instancia bindando a porta, que e o caso do
hub local, funciona sem `SO_REUSEPORT`).

```bash
# 1. Go: a go.mod declara `go 1.25.8`; o mecanismo `toolchain` do Go baixa a versao
#    correta automaticamente. Basta um Go recente como bootstrap (apt golang-go 1.22 serve).
sudo apt-get update -qq && sudo apt-get install -y -qq golang-go
go version   # bootstrap (ex.: go1.22.2) — o toolchain puxa go1.25.8 sozinho

# 2. Clonar e fixar a versao estavel
git clone https://github.com/supabase/auth /tmp/auth
cd /tmp/auth
git checkout v2.189.0   # commit 4fa66ba71d8c55b5c95cd5635766ed8bbae6d96a

# 3. Patch de portabilidade Windows (ListenConfig por plataforma com build tags):
#    - cmd/serve_cmd.go: remove imports `syscall` e `golang.org/x/sys/unix`;
#      troca o bloco net.ListenConfig{...SO_REUSEPORT...} por `lc := reusePortListenConfig()`
#    - cmd/serve_reuseport_unix.go    (//go:build !windows) -> versao com SO_REUSEPORT
#    - cmd/serve_reuseport_windows.go (//go:build windows)  -> net.ListenConfig{} padrao

# 4. Cross-compilar win-x64 (versao embutida via ldflags, igual ao Makefile upstream)
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build \
  -ldflags "-X github.com/supabase/auth/internal/utilities.Version=v2.189.0" \
  -o auth.exe .

# 5. Verificar que e um binario PE do Windows (PROVA do de-risking)
file auth.exe
# auth.exe: PE32+ executable (console) x86-64, for MS Windows, 16 sections

# 6. Empacotar
cp auth.exe          hub/win/bin/auth.exe
cp -r migrations     hub/win/bin/migrations   # 69 .sql — GoTrue precisa no boot
```

Tamanho do `auth.exe`: ~44 MB (45.396.480 bytes, `CGO_ENABLED=0`, estatico).

> Patch de portabilidade Windows: o patch acima NAO esta versionado neste repo
> (so o binario resultante, fora do git). E reproduzivel a partir do tag v2.189.0
> seguindo os passos 3-4. Se subir de versao do GoTrue, reaplique o mesmo split de
> `net.ListenConfig` por build tag.

## Validacao no Windows (passos que o USUARIO roda)

Depois de rodar `download-binaries.ps1` e copiar `auth.exe` + `migrations\` para
`C:\Exped\bin`, abra o PowerShell e prove cada binario:

```powershell
cd C:\Exped\bin

# --- PostgreSQL ---
# Inicializar um cluster de teste
.\pgsql\bin\initdb.exe -D C:\Exped\data -U postgres --encoding=UTF8

# Subir o servidor
.\pgsql\bin\pg_ctl.exe -D C:\Exped\data -l C:\Exped\data\log.txt start

# Conferir versao via SQL
.\pgsql\bin\psql.exe -U postgres -d postgres -c "select version();"
# -> PostgreSQL 16.9 ... x86_64-windows ...

# --- PostgREST ---
.\postgrest.exe --help
# -> imprime usage do PostgREST v14.12

# --- GoTrue (auth.exe) ---
.\auth.exe version
# -> v2.189.0   (versao embutida via ldflags)
#    (no GoTrue a versao e um subcomando: `auth.exe version`, nao `--version`)

# Parar o PostgreSQL de teste quando terminar
.\pgsql\bin\pg_ctl.exe -D C:\Exped\data stop
```

Se os quatro comandos respondem (PostgreSQL reporta `...x86_64-windows...`,
PostgREST imprime help, `auth.exe version` imprime `v2.189.0`), os binarios win-x64
estao validados e o hub local pode subir a pilha nativa no Windows.
