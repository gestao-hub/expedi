# Exped Sincronizador (local ⇄ nuvem) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans. Steps usam checkbox (`- [ ]`).

**Goal:** Sincronizar o hub local com a nuvem (bidirecional no dia-a-dia; só-desce em config/login), com **merge por campo** e **multi-site** (convergência via nuvem), de forma idempotente.

**Architecture:** A nuvem é a autoridade de merge. Cada hub faz push (linhas alteradas + carimbo por campo) → API de sync mergeia campo-a-campo contra o canônico → hub faz pull dos deltas canônicos. Transporte por deltas `updated_at`+cursor; auth por token de dispositivo escopado por empresa. Cliente de sync roda como peça do maestro.

**Tech Stack:** Postgres (triggers plpgsql), Next.js route handlers (cloud), Node ESM `.mjs` (hub), vitest. Supabase Management API p/ migrations na nuvem (ref `louaguxcohfeicxxqggw`, protocolo: dry-run BEGIN/ROLLBACK, ≤100 linhas/migração).

**Depende de:** sub-projetos 1 (PR #19) e 2 (PRs #20–#23). **Spec:** `docs/superpowers/specs/2026-06-01-exped-sincronizador-design.md`.

**Tabelas bidirecionais (merge campo-a-campo):** `pedidos`, `pedido_pontos_retirada`, `pedido_itens`, `ordens_servico`, `os_itens`, `os_servicos`, `clientes`, `os_notificacoes`.
**Tabelas só-descem (read-only pro hub):** `empresas`, `profiles`, `auth.users`, `hiper_vendedor_map`, `dispositivos`.

---

## File Structure

- `supabase/migrations/20260601000001_sync_stamps.sql` (Create) — `updated_at`/`field_updated_at`/`deleted_at` + triggers nas bidirecionais.
- `lib/sync/tables.ts` (Create) — registro: nome, PK, direção (`two-way`|`down`), tabelas-filhas, colunas. Fonte única usada pela API e (espelhada) pelo hub.
- `lib/sync/merge.ts` (Create) — `mergeRow(local, remote)` campo-a-campo por `field_updated_at`. Puro, testável.
- `app/api/sync/pull/route.ts` (Create) — devolve deltas canônicos desde cursor, escopo empresa.
- `app/api/sync/push/route.ts` (Create) — recebe lote, mergeia (merge.ts), grava, devolve resultado canônico.
- `lib/pedidos/inserir.ts`, `app/(app)/vendas/actions.ts`, `lib/os/inserir.ts`, `app/(app)/os/[id]/actions.ts` (Modify) — edição de agregado **in-place + soft-delete** (não delete+reinsert).
- `hub/sync.mjs` (Create) — cliente: cursores, push/pull, aplicar, fila, cold start. `hub/maestro.mjs` (Modify) — sobe o sync como peça + `/status`.
- `hub/sync-tables.mjs` (Create) — espelho mínimo do registro pro hub (mesma lista/PK/direção).
- Testes: `lib/sync/__tests__/merge.test.ts`, `app/api/sync/__tests__/*`, `hub/test/sync.test.mjs`.

---

## Task 1: Migração de schema — carimbos de sync

**Files:** Create `supabase/migrations/20260601000001_sync_stamps.sql`

- [ ] **Step 1: Escrever a migração** (idempotente; aplica nas 8 bidirecionais)

```sql
-- 20260601000001_sync_stamps.sql — carimbos p/ sync (updated_at + field_updated_at + deleted_at)
-- Trigger genérico: em INSERT/UPDATE, marca updated_at=now() e field_updated_at[col]=now() p/ colunas alteradas.
create or replace function public.stamp_sync_fields() returns trigger language plpgsql as $$
declare col text; m jsonb;
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    m := '{}'::jsonb;
    for col in select column_name from information_schema.columns
      where table_schema='public' and table_name=tg_table_name
        and column_name not in ('field_updated_at') loop
      m := m || jsonb_build_object(col, to_jsonb(now()));
    end loop;
    new.field_updated_at := m;
  else
    m := coalesce(old.field_updated_at, '{}'::jsonb);
    for col in select column_name from information_schema.columns
      where table_schema='public' and table_name=tg_table_name
        and column_name not in ('field_updated_at','updated_at') loop
      execute format('select ($1).%I is distinct from ($2).%I', col, col)
        using new, old into strict m using new, old;  -- placeholder; ver Step 3 p/ versão correta
    end loop;
  end if;
  return new;
end $$;
```
> NOTA: a checagem coluna-a-coluna em plpgsql puro é chata; a versão CORRETA e simples está no Step 3 (compara `to_jsonb(new)` vs `to_jsonb(old)`). Use a do Step 3.

- [ ] **Step 2: (descartar a tentativa do Step 1 — usar a versão do Step 3)**

- [ ] **Step 3: Versão correta do trigger + colunas + binds (esta é a que vale)**

```sql
-- (substitui a função do Step 1)
create or replace function public.stamp_sync_fields() returns trigger language plpgsql as $$
declare k text; jn jsonb := to_jsonb(new); jo jsonb := case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
        m jsonb := case when tg_op='UPDATE' then coalesce(old.field_updated_at,'{}'::jsonb) else '{}'::jsonb end;
begin
  new.updated_at := now();
  for k in select jsonb_object_keys(jn) loop
    if k not in ('field_updated_at','updated_at') then
      if tg_op='INSERT' or (jn->k) is distinct from (jo->k) then
        m := m || jsonb_build_object(k, to_jsonb(now()));
      end if;
    end if;
  end loop;
  new.field_updated_at := m;
  return new;
end $$;

-- aplica nas 8 tabelas bidirecionais:
do $$
declare t text;
begin
  foreach t in array array['pedidos','pedido_pontos_retirada','pedido_itens',
    'ordens_servico','os_itens','os_servicos','clientes','os_notificacoes'] loop
    execute format('alter table public.%I add column if not exists updated_at timestamptz not null default now()', t);
    execute format('alter table public.%I add column if not exists field_updated_at jsonb not null default ''{}''::jsonb', t);
    execute format('alter table public.%I add column if not exists deleted_at timestamptz', t);
    execute format('drop trigger if exists trg_stamp_sync on public.%I', t);
    execute format('create trigger trg_stamp_sync before insert or update on public.%I for each row execute function public.stamp_sync_fields()', t);
  end loop;
end $$;
```

- [ ] **Step 4: Dry-run + aplicar na nuvem (protocolo)**

Run (Management API; substitua `<TOKEN>`/`<REF>`):
```bash
F=supabase/migrations/20260601000001_sync_stamps.sql; R=louaguxcohfeicxxqggw
python3 -c "import json;print(json.dumps({'query':'BEGIN;\n'+open('$F').read()+'\nROLLBACK;'}))" >/tmp/q.json
curl -s -X POST "https://api.supabase.com/v1/projects/$R/database/query" -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" -H "User-Agent: curl/8.0" --data @/tmp/q.json
```
Expected: `[]` (dry-run ok). Depois aplicar sem BEGIN/ROLLBACK. Regenerar `lib/types/database.ts`.

- [ ] **Step 5: Validar o trigger** — `update pedidos set observacoes='x' where id=...; select field_updated_at->'observacoes', updated_at from pedidos where id=...` → `field_updated_at.observacoes` recente. Commit.

```bash
git add supabase/migrations/20260601000001_sync_stamps.sql lib/types/database.ts
git commit -m "feat(sync): carimbos updated_at/field_updated_at/deleted_at + trigger nas tabelas bidirecionais"
```

---

## Task 2: Edição de agregado in-place + soft-delete (substitui delete+reinsert)

**Files:** Modify `app/(app)/vendas/actions.ts` (atualizarPedidoAction), `app/(app)/os/[id]/actions.ts`/`lib/os/inserir.ts` (equivalente OS).

- [ ] **Step 1: Teste (vitest) — editar pedido preserva PKs dos itens e marca removidos como deleted_at**

```typescript
// lib/pedidos/__tests__/edit-inplace.test.ts (mock do supabase client)
// Cenário: pedido com itens [A,B]; editar pra [A(qtd nova),C].
// Espera: A mantém id e tem qtd nova; B fica com deleted_at != null; C é novo id.
```
(Escreva o teste com um fake do client que registra upserts/updates; asserta que B NÃO foi hard-deletado e que A manteve a PK.)

- [ ] **Step 2: Rodar → FAIL.**

- [ ] **Step 3: Implementar** — em `atualizarPedidoAction`, trocar o "delete all pontos/itens + reinsert" por:
  - casar itens existentes por uma chave estável (ex.: `codigo`+`ponto` ou um id vindo do form) → **update in-place** os que continuam; **insert** os novos; **`update ... set deleted_at=now()`** nos que sumiram (em vez de delete). Idem pontos. Não tocar em itens já com `deleted_at`.
  - Leitura/exibição passa a filtrar `deleted_at is null`.
  Repetir o mesmo padrão pra OS (itens/serviços).

- [ ] **Step 4: Rodar testes + ajustar leituras** (mapa-carregamento, /os, revisar) p/ ignorar `deleted_at is not null`. `npm run typecheck && npm run build`. Commit.

```bash
git commit -am "feat(sync): edição de agregado in-place + soft-delete (preserva identidade p/ multi-site)"
```

---

## Task 3: Registro de tabelas + merge campo-a-campo (puro) + API de sync

**Files:** Create `lib/sync/tables.ts`, `lib/sync/merge.ts`, `app/api/sync/pull/route.ts`, `app/api/sync/push/route.ts`, `lib/sync/__tests__/merge.test.ts`.

- [ ] **Step 1: Registro de tabelas** `lib/sync/tables.ts`

```typescript
export type SyncDir = 'two-way' | 'down';
export type SyncTable = { name: string; pk: string; dir: SyncDir; parent?: { table: string; fk: string } };
export const SYNC_TABLES: SyncTable[] = [
  { name: 'clientes', pk: 'id', dir: 'two-way' },
  { name: 'pedidos', pk: 'id', dir: 'two-way' },
  { name: 'pedido_pontos_retirada', pk: 'id', dir: 'two-way', parent: { table: 'pedidos', fk: 'pedido_id' } },
  { name: 'pedido_itens', pk: 'id', dir: 'two-way', parent: { table: 'pedido_pontos_retirada', fk: 'ponto_retirada_id' } },
  { name: 'ordens_servico', pk: 'id', dir: 'two-way' },
  { name: 'os_itens', pk: 'id', dir: 'two-way', parent: { table: 'ordens_servico', fk: 'os_id' } },
  { name: 'os_servicos', pk: 'id', dir: 'two-way', parent: { table: 'ordens_servico', fk: 'os_id' } },
  { name: 'os_notificacoes', pk: 'id', dir: 'two-way' },
  { name: 'empresas', pk: 'id', dir: 'down' },
  { name: 'profiles', pk: 'id', dir: 'down' },
  { name: 'hiper_vendedor_map', pk: 'id', dir: 'down' },
  { name: 'dispositivos', pk: 'id', dir: 'down' },
];
```

- [ ] **Step 2: Teste do merge** `lib/sync/__tests__/merge.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { mergeRow } from '../merge';
describe('mergeRow (campo-a-campo)', () => {
  it('mantém o valor com field_updated_at mais recente por coluna', () => {
    const local  = { id:'1', endereco:'A', telefone:'T1', field_updated_at:{ endereco:'2026-01-02T00:00:00Z', telefone:'2026-01-01T00:00:00Z' } };
    const remote = { id:'1', endereco:'B', telefone:'T2', field_updated_at:{ endereco:'2026-01-01T00:00:00Z', telefone:'2026-01-03T00:00:00Z' } };
    const m = mergeRow(local, remote);
    expect(m.endereco).toBe('A');   // local mais novo
    expect(m.telefone).toBe('T2');  // remote mais novo
    expect(m.field_updated_at.endereco).toBe('2026-01-02T00:00:00Z');
    expect(m.field_updated_at.telefone).toBe('2026-01-03T00:00:00Z');
  });
});
```

- [ ] **Step 3: Rodar → FAIL. Implementar `lib/sync/merge.ts`**

```typescript
type Row = Record<string, unknown> & { field_updated_at?: Record<string,string> };
export function mergeRow(local: Row, remote: Row): Row {
  const lf = local.field_updated_at ?? {}, rf = remote.field_updated_at ?? {};
  const out: Row = { ...remote }, fua: Record<string,string> = { ...rf };
  for (const k of Object.keys({ ...local, ...remote })) {
    if (k === 'field_updated_at') continue;
    const lt = lf[k] ?? '', rt = rf[k] ?? '';
    if (lt >= rt) { out[k] = (local as Row)[k]; if (lt) fua[k] = lt; }
    else { out[k] = (remote as Row)[k]; fua[k] = rt; }
  }
  out.field_updated_at = fua;
  return out;
}
```

- [ ] **Step 4: Rodar → PASS.**

- [ ] **Step 5: API `push` e `pull`** — auth por token de dispositivo (igual `app/api/ingest/pedido/route.ts`: resolve `dispositivos` por `token_hash` → `empresa_id`). 
  - `pull`: body `{ cursors: { [table]: iso } }` → p/ cada SYNC_TABLES, `select * where empresa_id=<scope> and updated_at > cursor order by updated_at limit 500` → `{ table: rows, nextCursor }`.
  - `push`: body `{ rows: { [table]: Row[] } }` (só tabelas `two-way`; recusa `down` com 403). P/ cada linha: busca canônica por PK+empresa; se existe → `mergeRow(incoming, canonica)` (incoming = "local"); senão insere; força `empresa_id` do escopo; grava via service_role. Devolve as linhas canônicas resultantes. Idempotente por PK.
  - Ambos: `export const runtime='nodejs'`. Validar com zod o shape. Escopo empresa **sempre** server-side.
  Inclua testes de rota (auth 401, escopo, push de tabela `down` → 403, merge aplicado).

- [ ] **Step 6:** `npm run typecheck && npm run build`. Commit.

```bash
git commit -am "feat(sync): registro de tabelas + merge campo-a-campo + API /api/sync/pull e /push (escopo por dispositivo)"
```

---

## Task 4: Cliente de sync no hub (push/pull/cursor/fila) + maestro

**Files:** Create `hub/sync.mjs`, `hub/sync-tables.mjs`, `hub/test/sync.test.mjs`. Modify `hub/maestro.mjs`.

- [ ] **Step 1: `hub/sync-tables.mjs`** — espelho mínimo do registro (mesma lista/PK/dir) usado pelo hub.

- [ ] **Step 2: Teste do ciclo** `hub/test/sync.test.mjs` (com fakes de `pullFn`/`pushFn` e um "banco" em memória)
  - Cenário pull: aplica linhas remotas no banco local (upsert por PK) e avança o cursor.
  - Cenário push: envia linhas locais com `updated_at`>cursor; ao confirmar, avança cursor; reenvio do mesmo lote é idempotente (não duplica).

- [ ] **Step 3: Rodar → FAIL. Implementar `hub/sync.mjs`**
  - `loadCursors()/saveCursors()` (numa tabela local `public._sync_cursors(table text pk, pull_at timestamptz, push_at timestamptz)` — criar se não existe).
  - `async function syncOnce({ apiBase, deviceToken, db })`: 
    1. **push**: p/ cada tabela two-way, seleciona local `updated_at > push_at` (limite 500), POST `/api/sync/push`; aplica as canônicas retornadas (upsert) + avança `push_at`.
    2. **pull**: POST `/api/sync/pull` com cursors; upsert das linhas; avança `pull_at`.
    Cursores só avançam após sucesso do lote (atômico por tabela).
  - `start({...})`: loop a cada ~10s; se offline (fetch falha) → silencia e re-tenta; nunca derruba o maestro.

- [ ] **Step 4: Rodar → PASS.**

- [ ] **Step 5: Wire no maestro** — `hub/maestro.mjs`: subir o sync (só se `cfg.cloud.apiBase` + `deviceToken` presentes) como tarefa supervisionada/loop; expor no `/status` (`lastSyncOk`, `pending`). Config em `hub/config.mjs` (`EXPED_CLOUD_API`, `EXPED_DEVICE_TOKEN`). Smoke no Linux contra a nuvem? NÃO (evitar prod). Teste só com fakes. Commit.

```bash
git commit -am "feat(hub): cliente de sync (push/pull/cursor idempotente) + integração no maestro + /status"
```

---

## Task 5: Carga inicial (cold start) + sync de login/config (down)

**Files:** Modify `hub/sync.mjs` (cold start), `app/api/sync/pull/route.ts` (paginação/snapshot).

- [ ] **Step 1: Teste** — quando os cursores estão vazios, `syncOnce` puxa **tudo** (snapshot paginado) das tabelas (two-way + down), incluindo `auth.users`/`profiles`/`empresas`, populando o banco local. Verifica paginação (mais de 1 página).

- [ ] **Step 2: Rodar → FAIL. Implementar** — cold start = pull com cursor `epoch` + paginação por `updated_at` até esgotar. Para `auth.users` (login): o `pull` da API inclui as colunas necessárias (`id,email,encrypted_password,...`) escopadas por empresa (join via profiles.empresa_id); o hub faz upsert em `auth.users` local (assim o login offline usa a senha real). Tabelas `down` são sempre sobrescritas (não passam por merge).

- [ ] **Step 3: Rodar → PASS.** `npm run typecheck`. Commit.

```bash
git commit -am "feat(sync): carga inicial (snapshot paginado) + sync de login/config nuvem->local"
```

---

## Task 6: Testes de cenário pesados + checklist de piloto

**Files:** Create `hub/test/sync-scenarios.test.mjs`. Doc: `docs/superpowers/plans/sync-piloto-checklist.md`.

- [ ] **Step 1: Cenários (vitest, com fakes/in-memory + a `mergeRow` real)**
  - **Conflito por campo:** loja A muda endereço, loja B muda telefone do mesmo cliente → após sync, ambos coexistem.
  - **3 sites:** três hubs editando o mesmo pedido (campos diferentes) → convergem iguais.
  - **Queda no meio:** push confirma metade; reexecuta → sem duplicação, cursor consistente.
  - **Fila acumulada:** N mudanças offline → um ciclo as sobe todas.
  - **Soft-delete:** item removido numa loja → some nas outras após sync (não "ressuscita").
  - **Agregado:** pedido+itens no mesmo lote → nunca pela metade.

- [ ] **Step 2: Rodar → todos PASS.** Commit.

- [ ] **Step 3: Checklist de piloto** (`docs/superpowers/plans/sync-piloto-checklist.md`) — passos no Windows com 1 cliente: instalar, cold start (dados reais aparecem), trabalhar offline, religar e ver subir; (se houver) 2ª loja convergindo; conferir contadores do `/status`. Commit.

```bash
git commit -am "test(sync): cenários (conflito/multi-site/queda/fila/soft-delete) + checklist de piloto"
```

---

## Resultado esperado

Offline **completo**: o hub local carrega os dados reais (cold start), a equipe trabalha com/sem internet, e tudo converge na nuvem com **merge por campo** e **multi-site**, de forma idempotente. Depois: **piloto com 1 cliente** (checklist) antes de liberar geral.

## Self-review (cobertura da spec)
- §4 tabelas/direção → Task 3 (registro) + Task 1. §5 cursor/fila → Task 4. §6 campo-a-campo → Task 1 (trigger) + Task 3 (mergeRow). §7 multi-site/filhos in-place → Task 2 + Task 3 (merge central) + Task 6 (3 sites). §8 cold start → Task 5. §9 idempotência → Task 4/6. §10 migração → Task 1. §11 segurança (device token/escopo) → Task 3. Sem lacunas.
