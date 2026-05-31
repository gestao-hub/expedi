# Runtime local (Jeito A) — Fundação Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provar e estabelecer que o app Exped roda contra um **Supabase local** (mesmo código, só muda o endpoint), com migrations + Auth + RLS funcionando localmente — a fundação do hub offline (Abordagem B / Jeito A).

**Architecture:** "Jeito A" — em vez de abstrair a camada de dados em código, subimos as peças do Supabase como **binários nativos** (Postgres + PostgREST + GoTrue) no host. O app continua usando `supabase-js`; só aponta para o endpoint local via env. RLS e Auth ficam idênticos à nuvem. Este plano valida a arquitetura num **spike no dev (Linux)**; o empacotamento nativo no Windows + instalador é o **próximo** sub-projeto.

**Tech Stack:** Next.js 16, supabase-js, Postgres 15, PostgREST (binário Go), GoTrue/auth (binário Go), Bash scripts. Sem Docker.

**Pré-requisito de leitura:** `docs/superpowers/specs/2026-05-31-exped-local-offline-design.md` (a spec). Este é o sub-projeto **1** dos 5.

**Escopo deste plano (e o que NÃO é):**
- ✅ App 100% configurável por endpoint (sem nada hardcoded de nuvem).
- ✅ Pilha Supabase local nativa sobe via script e o app funciona contra ela (login + RLS + leitura/escrita).
- ✅ Go/no-go documentado para o empacotamento Windows.
- ❌ NÃO inclui: instalador Windows, sincronizador nuvem⇄local, leitor Hiper gravando local. (sub-projetos 2–3).

---

## File Structure

- `scripts/local-stack/` (Create) — scripts do spike: sobe/derruba Postgres+PostgREST+GoTrue local, aplica migrations, seed.
  - `up.sh`, `down.sh`, `apply-schema.sh`, `seed.sh`, `.env.local-stack.example`
- `scripts/local-stack/README.md` (Create) — como rodar o spike + resultados/go-no-go.
- `lib/supabase/server.ts`, `client.ts`, `admin.ts` (Modify se necessário) — garantir 100% via env, sem fallback hardcoded.
- `lib/supabase/env.ts` (Create se necessário) — fonte única que lê/valida as envs de Supabase.
- `.env.local.example` (Modify/Create) — documentar as 3 envs que apontam o endpoint.
- `tests/supabase-env.test.ts` (Create) — testa que os clients usam as envs (sem URL fixa).

---

## Task 1: App 100% configurável por endpoint (sem nada hardcoded)

**Files:**
- Inspect: `lib/supabase/server.ts`, `lib/supabase/client.ts`, `lib/supabase/admin.ts`, `lib/supabase/middleware.ts`
- Create (se houver hardcode): `lib/supabase/env.ts`
- Test: `tests/supabase-env.test.ts`

- [ ] **Step 1: Auditar URLs/chaves hardcoded**

Run:
```bash
git grep -nE "https://[a-z0-9]+\.supabase\.(co|in)|SUPABASE_URL|SUPABASE_ANON|SERVICE_ROLE|PUBLISHABLE" -- '*.ts' '*.tsx' | grep -v node_modules
```
Expected: TODAS as ocorrências devem ser leitura de `process.env.*`. Anote qualquer literal de URL/chave fixo (não deve existir). Se existir, é o que a Task corrige.

- [ ] **Step 2: Escrever teste que falha se algum client não usar env**

```typescript
// tests/supabase-env.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('clients Supabase são endpoint-driven', () => {
  beforeEach(() => { vi.resetModules(); });

  it('admin usa SUPABASE_URL + SERVICE_ROLE do env (sem URL fixa)', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service';
    const mod = await import('@/lib/supabase/admin');
    // não deve lançar e não deve conter URL de produção embutida
    const src = (await import('node:fs')).readFileSync('lib/supabase/admin.ts', 'utf8');
    expect(src).not.toMatch(/https:\/\/[a-z0-9]+\.supabase\.(co|in)/);
    expect(typeof mod.createAdminClient).toBe('function');
  });
});
```

- [ ] **Step 3: Rodar e ver falhar (se houver hardcode) ou já passar**

Run: `npx vitest run tests/supabase-env.test.ts`
Expected: PASS se o código já é env-driven; FAIL apontando o literal se houver hardcode.

- [ ] **Step 4: Se falhou, centralizar env em `lib/supabase/env.ts`**

```typescript
// lib/supabase/env.ts
export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon) throw new Error('Supabase env ausente (URL/anon)');
  return { url, anon, service };
}
```
Refatore `server.ts`/`client.ts`/`admin.ts` pra usarem `supabaseEnv()`. (Pule se a Step 3 já passou.)

- [ ] **Step 5: Rodar typecheck + teste**

Run: `npm run typecheck && npx vitest run tests/supabase-env.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/supabase tests/supabase-env.test.ts
git commit -m "chore(supabase): garante clients 100% endpoint-driven (fundação runtime local)"
```

---

## Task 2: Subir Postgres local + aplicar o schema (migrations)

**Files:**
- Create: `scripts/local-stack/up.sh`, `scripts/local-stack/apply-schema.sh`, `scripts/local-stack/.env.local-stack.example`

- [ ] **Step 1: Instalar Postgres nativo (dev) e iniciar um cluster isolado**

```bash
# Ubuntu/dev. Porta isolada 54322 pra não colidir.
which postgres || sudo apt-get install -y postgresql
mkdir -p /tmp/exped-pg
initdb -D /tmp/exped-pg 2>/dev/null || true
pg_ctl -D /tmp/exped-pg -o "-p 54322" -l /tmp/exped-pg/log start
sleep 2
psql -p 54322 -d postgres -c "select version();"
```
Expected: imprime a versão do Postgres (cluster local de pé na 54322).

- [ ] **Step 2: Criar roles que o Supabase espera (anon, authenticated, service_role) + DB**

```bash
psql -p 54322 -d postgres <<'SQL'
create database exped;
\c exped
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create role authenticator noinherit login password 'authpass';
grant anon to authenticator; grant authenticated to authenticator; grant service_role to authenticator;
create schema if not exists auth;  -- GoTrue cria o resto na Task 4
SQL
```
Expected: sem erro; roles criadas.

- [ ] **Step 3: `apply-schema.sh` — aplica todas as migrations do repo no Postgres local**

```bash
# scripts/local-stack/apply-schema.sh
#!/usr/bin/env bash
set -euo pipefail
PORT="${PGPORT:-54322}"
for f in supabase/migrations/*.sql; do
  echo ">> $f"
  psql -p "$PORT" -d exped -v ON_ERROR_STOP=1 -f "$f"
done
echo "schema aplicado."
```
Run: `bash scripts/local-stack/apply-schema.sh`
Expected: aplica em ordem; termina "schema aplicado." (ajustar migrations que assumam extensões/funcs do Supabase — anotar quais precisam de `create extension`).

- [ ] **Step 4: Verificar tabelas-chave existem**

Run:
```bash
psql -p 54322 -d exped -c "\dt public.*" | grep -E "empresas|pedidos|ordens_servico|os_notificacoes|dispositivos"
```
Expected: lista as tabelas. Se faltar, corrigir a migration/extensão e repetir.

- [ ] **Step 5: Commit**

```bash
git add scripts/local-stack
git commit -m "feat(local-stack): Postgres local + apply-schema das migrations (spike)"
```

---

## Task 3: PostgREST nativo + verificar RLS

**Files:**
- Create: `scripts/local-stack/postgrest.conf`, atualizar `up.sh`

- [ ] **Step 1: Baixar o binário do PostgREST (Go, nativo)**

```bash
mkdir -p scripts/local-stack/bin && cd scripts/local-stack/bin
curl -fsSL -o postgrest.tar.xz https://github.com/PostgREST/postgrest/releases/latest/download/postgrest-$(uname -s | tr A-Z a-z)-static-x64.tar.xz || \
  curl -fsSL -o postgrest.tar.xz https://github.com/PostgREST/postgrest/releases/download/v12.2.3/postgrest-v12.2.3-linux-static-x64.tar.xz
tar xf postgrest.tar.xz && ./postgrest --help | head -1
```
Expected: imprime ajuda do PostgREST (binário ok). (No Windows, baixar o build win-x64 — Task do próximo sub-projeto.)

- [ ] **Step 2: Config do PostgREST apontando pro Postgres local**

```ini
# scripts/local-stack/postgrest.conf
db-uri = "postgres://authenticator:authpass@127.0.0.1:54322/exped"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "super-secret-jwt-token-with-at-least-32-characters"
server-port = 54321
```

- [ ] **Step 3: Subir PostgREST e testar o endpoint REST**

```bash
scripts/local-stack/bin/postgrest scripts/local-stack/postgrest.conf &
sleep 2
curl -s "http://127.0.0.1:54321/empresas?select=id,nome" -H "Accept: application/json" | head -c 300
```
Expected: responde JSON (provavelmente `[]` ou erro de permissão RLS — ambos provam que o REST está de pé). NÃO deve recusar conexão.

- [ ] **Step 4: Provar que a RLS está ativa (anon não vê dado de empresa)**

```bash
# inserir uma empresa via service_role (bypassa RLS) direto no banco
psql -p 54322 -d exped -c "insert into empresas (id,nome,slug) values (gen_random_uuid(),'Teste','teste') on conflict do nothing;"
# anon (sem JWT) NÃO deve enxergar (RLS)
curl -s "http://127.0.0.1:54321/empresas?select=id" | head -c 200
```
Expected: `[]` (ou erro de policy) — confirma que a RLS local está valendo, igual à nuvem.

- [ ] **Step 5: Commit**

```bash
git add scripts/local-stack/postgrest.conf scripts/local-stack/up.sh
git commit -m "feat(local-stack): PostgREST nativo + RLS validada localmente (spike)"
```

---

## Task 4: GoTrue (Auth) nativo + login local

**Files:**
- Create: `scripts/local-stack/gotrue.env`, atualizar `up.sh`

- [ ] **Step 1: Baixar o binário do GoTrue (auth do Supabase)**

```bash
cd scripts/local-stack/bin
curl -fsSL -o auth.tar.gz https://github.com/supabase/auth/releases/latest/download/auth-$(uname -s | tr A-Z a-z)-arm64.tar.gz 2>/dev/null || \
  curl -fsSL -o auth.tar.gz https://github.com/supabase/auth/releases/download/v2.165.0/auth_linux_amd64.tar.gz
tar xf auth.tar.gz && ls auth* 2>/dev/null && echo "gotrue baixado"
```
Expected: binário `auth` presente. (Se o asset name divergir, listar releases e ajustar a URL — anotar a versão usada.)

- [ ] **Step 2: Config do GoTrue apontando pro mesmo Postgres + mesmo JWT secret**

```bash
# scripts/local-stack/gotrue.env
GOTRUE_DB_DRIVER=postgres
DATABASE_URL=postgres://supabase_auth_admin:authpass@127.0.0.1:54322/exped
GOTRUE_API_HOST=127.0.0.1
GOTRUE_API_PORT=9999
GOTRUE_JWT_SECRET=super-secret-jwt-token-with-at-least-32-characters
GOTRUE_JWT_EXP=3600
GOTRUE_SITE_URL=http://127.0.0.1:3000
GOTRUE_DISABLE_SIGNUP=false
```
(Criar role `supabase_auth_admin` com acesso ao schema `auth`: `create role supabase_auth_admin login password 'authpass' createrole; grant all on schema auth to supabase_auth_admin;`)

- [ ] **Step 3: Subir GoTrue e criar um usuário de teste**

```bash
set -a; source scripts/local-stack/gotrue.env; set +a
scripts/local-stack/bin/auth & sleep 3
curl -s -X POST "http://127.0.0.1:9999/signup" -H "Content-Type: application/json" \
  -d '{"email":"teste@exped.local","password":"Teste123@"}' | head -c 300
```
Expected: retorna um objeto de usuário + access_token (JWT). Prova que o login local funciona.

- [ ] **Step 4: Verificar que o JWT do GoTrue é aceito pelo PostgREST (mesma secret)**

```bash
TOKEN=$(curl -s -X POST "http://127.0.0.1:9999/token?grant_type=password" -H "Content-Type: application/json" -d '{"email":"teste@exped.local","password":"Teste123@"}' | python3 -c "import json,sys;print(json.load(sys.stdin)['access_token'])")
curl -s "http://127.0.0.1:54321/empresas?select=id" -H "Authorization: Bearer $TOKEN" | head -c 200
```
Expected: responde conforme a RLS do usuário autenticado (mesma secret → token válido nos dois). Confirma Auth+REST integrados localmente.

- [ ] **Step 5: Commit**

```bash
git add scripts/local-stack/gotrue.env scripts/local-stack/up.sh
git commit -m "feat(local-stack): GoTrue nativo + login local integrado ao PostgREST (spike)"
```

---

## Task 5: App Exped rodando contra a pilha local (ponta a ponta)

**Files:**
- Create: `.env.local-stack.example` (as 3 envs apontando pro local)

- [ ] **Step 1: Env do app apontando pro local**

```bash
# .env.local (não commitar) — gerado a partir do .example
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<anon-jwt-assinada-com-a-mesma-secret>
SUPABASE_SERVICE_ROLE_KEY=<service-jwt-assinada-com-a-mesma-secret>
```
(Gerar os JWTs anon/service assinando `{"role":"anon"}` / `{"role":"service_role"}` com a JWT secret — incluir um helper `scripts/local-stack/make-keys.sh` que imprime os dois.)

- [ ] **Step 2: Subir o app contra o local**

Run: `npm run dev` (com o `.env.local` acima)
Expected: app sobe em `http://127.0.0.1:3000` sem erro de conexão Supabase.

- [ ] **Step 3: Validar o fluxo no navegador (ou via curl autenticado)**

Manual/Playwright:
1. Login com `teste@exped.local` / `Teste123@` → entra.
2. Como admin de uma empresa (atribuir empresa_id+role ao usuário via `psql`), abrir uma tela que lê dados escopados (ex.: /vendas) → vê só os da empresa.
3. Fazer uma escrita (ex.: salvar config) → persiste no Postgres local (`psql ... select ...`).

Expected: login + leitura escopada por RLS + escrita funcionam — **sem nenhuma mudança no código do app**.

- [ ] **Step 4: Registrar no README do spike o resultado + go/no-go**

```markdown
# scripts/local-stack/README.md
Resultado do spike (Jeito A): [ ] app roda contra Supabase local sem mudar código.
Peças nativas validadas: Postgres [ok/x] · PostgREST [ok/x] · GoTrue [ok/x].
Migrations que precisaram ajuste: <lista>.
Go/No-Go pro empacotamento Windows (sub-projeto 2): <decisão + riscos>.
```

- [ ] **Step 5: Commit**

```bash
git add scripts/local-stack/.env.local-stack.example scripts/local-stack/make-keys.sh scripts/local-stack/README.md
git commit -m "feat(local-stack): app Exped validado contra Supabase local + go/no-go (spike concluído)"
```

---

## Task 6: Script único `up.sh`/`down.sh` (repetível) + limpeza

**Files:**
- Finalize: `scripts/local-stack/up.sh`, `scripts/local-stack/down.sh`

- [ ] **Step 1: `up.sh` orquestra tudo (pg → schema → postgrest → gotrue)**

Reúne os passos das Tasks 2–4 num script idempotente; `down.sh` derruba os processos e limpa `/tmp/exped-pg`.

- [ ] **Step 2: Teste de fumaça do script inteiro**

Run: `bash scripts/local-stack/down.sh; bash scripts/local-stack/up.sh && curl -s 127.0.0.1:54321/empresas?select=id -o /dev/null -w "%{http_code}\n"`
Expected: termina subindo tudo e o REST responde (200/RLS). Repetível do zero.

- [ ] **Step 3: Commit**

```bash
git add scripts/local-stack
git commit -m "feat(local-stack): up.sh/down.sh idempotentes pra subir a pilha local"
```

---

## Resultado esperado deste plano

Ao final: o app Exped **comprovadamente roda contra um Supabase local** (mesmo código, só env), com **migrations + Auth + RLS** funcionando — validando o **Jeito A**. Com o go/no-go documentado, o **próximo sub-projeto** ataca o **empacotamento nativo no Windows + instalador** (trocar os binários Linux pelos win-x64 e bundlar), seguido do **sincronizador** (sub-projeto 3).

**Se o spike falhar** (ex.: GoTrue/PostgREST inviável de empacotar nativo no Windows), o README registra o porquê e reavaliamos Jeito B só então — com dado real, não no escuro.
