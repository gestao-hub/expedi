# Escala 100k — Design (sync sem array em memória, push em lote, export streaming, KPI tempo médio)

> Data: 2026-06-03 · Projeto: Exped · Fase "100k+ pedidos por loja". Auditoria base:
> [docs/superpowers/specs/2026-06-03-auditoria-escala.md](2026-06-03-auditoria-escala.md).

## 1. Objetivo e escopo

Tornar a plataforma sólida em **100k+ pedidos numa loja** (anos de operação) sem regressão.
Quatro mudanças, recortadas pelo que realmente importa nessa escala:

1. **Sync sem array gigante em memória** (escopo de filhas via RPC com JOIN no banco).
2. **Push em lote no lado da LEITURA** (pré-busca canônicas/pais do lote; mantém a lógica de merge intacta).
3. **Export CSV em streaming** (sem carregar 50k linhas na RAM).
4. **KPI "tempo médio" no banco** (RPC), fechando o último KPI que ainda agrega em JS.

### Fora de escopo (decidido)
- **Retenção/janela de histórico:** NÃO fazer — não esconder dado. O sync é incremental; o custo é só
  disco (linhas pequenas) + cold-start único, aceitável pra loja única.
- **Trgm multi-tenant + cold-start paralelo:** só importam com MUITAS lojas — deferidos.
- **Batching de ESCRITA no push (upsert):** mantém per-row (via RPC `sync_push_upsert`) — o ganho grande
  e seguro está na leitura; escrita em lote fica pra depois se necessário.

## 2. #1 — Sync: escopo de filhas via RPC (sem `pedidoIdsDaEmpresa`)

**Problema:** [lib/sync/supabase-db.ts:26-63](../../../lib/sync/supabase-db.ts) — pra escopar `pedido_pontos_retirada`,
`pedido_itens`, `os_itens`, `os_servicos`, o `selectChanges` carrega **todos os IDs da empresa** num array
(`pedidoIdsDaEmpresa`/`pontoIdsDaEmpresa`/`osIdsDaEmpresa`) e usa `.in(array)`. Com 100k pedidos = 100k UUIDs
na RAM do Next + URL gigante a cada ciclo de pull.

**Solução:** RPC que faz o JOIN no banco. Migration nova:

```sql
-- sync_children_changed: linhas filhas mudadas (updated_at > cursor) escopadas à empresa
-- via JOIN com o ancestral que tem empresa_id. SECURITY INVOKER (chamada pelo service_role
-- do /api/sync/pull → bypassa RLS; o escopo é o WHERE empresa_id). Branch fixo por tabela
-- (sem SQL dinâmico = sem injeção via nome de tabela).
create or replace function public.sync_children_changed(
  p_table text, p_empresa uuid, p_cursor timestamptz, p_limit int
) returns setof jsonb language plpgsql stable security invoker as $$
begin
  if p_table = 'pedido_pontos_retirada' then
    return query
      select to_jsonb(c) from public.pedido_pontos_retirada c
      join public.pedidos p on p.id = c.pedido_id
      where p.empresa_id = p_empresa and c.updated_at > p_cursor
      order by c.updated_at asc limit p_limit;
  elsif p_table = 'pedido_itens' then
    return query
      select to_jsonb(c) from public.pedido_itens c
      join public.pedido_pontos_retirada pr on pr.id = c.ponto_retirada_id
      join public.pedidos p on p.id = pr.pedido_id
      where p.empresa_id = p_empresa and c.updated_at > p_cursor
      order by c.updated_at asc limit p_limit;
  elsif p_table in ('os_itens','os_servicos') then
    return query execute format(
      'select to_jsonb(c) from public.%I c
       join public.ordens_servico o on o.id = c.os_id
       where o.empresa_id = $1 and c.updated_at > $2
       order by c.updated_at asc limit $3', p_table)
      using p_empresa, p_cursor, p_limit;
  else
    raise exception 'sync_children_changed: tabela nao suportada %', p_table;
  end if;
end; $$;
grant execute on function public.sync_children_changed(text, uuid, timestamptz, int) to service_role, authenticated;
```
> `os_itens`/`os_servicos` compartilham a mesma forma (`os_id` → `ordens_servico`), então uso `format(%I)`
> com a tabela **whitelisted** no `in (...)` acima (o `%I` só roda pra esses dois nomes já validados).

**Wiring** ([lib/sync/supabase-db.ts](../../../lib/sync/supabase-db.ts)): no `selectChanges`, o ramo das filhas
deixa de chamar `pedidoIdsDaEmpresa`/`.in()` e passa a chamar a RPC:
```ts
if (!hasDirectEmpresaId(table)) {
  const { data, error } = await supabase.rpc('sync_children_changed', {
    p_table: table, p_empresa: empresaId, p_cursor: cursor, p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as Row[];   // jsonb por linha
}
// (ramo direto por empresa_id continua igual)
```
Remove `pedidoIdsDaEmpresa`/`pontoIdsDaEmpresa`/`osIdsDaEmpresa`. **Comportamento idêntico** (mesmas linhas,
mesma ordem, mesmo cursor) — só move o escopo pro SQL. Tipos da RPC adicionados em `lib/types/database.ts`.

## 3. #2 — Push: pré-busca em lote (leitura), merge intacto

**Problema:** [lib/sync/engine.ts:140-205](../../../lib/sync/engine.ts) — o `runPush` faz, por linha:
`parentBelongsToEmpresa` (filhas) + `findCanonical` + às vezes `findCanonicalGlobal` + `upsertRaw`. Com 500
linhas/lote = até ~2000 queries em série.

**Solução (lado da leitura, sem tocar na semântica de merge):** dois métodos novos no `SyncDb`, pré-carregados
ANTES do loop:
```ts
// novos em SyncDb:
findCanonicalMany(table: SyncTable, empresaId: string, pks: unknown[]): Promise<Map<string, Row>>;
parentsInEmpresa(parentTable: string, parentIds: unknown[], empresaId: string): Promise<Set<string>>;
```
`runPush`, por tabela do lote:
1. Coleta os `pks` (de `t.pk`) e, pra filhas, os `parentIds` (de `t.parent.fk`).
2. `const canon = await db.findCanonicalMany(t, empresaId, pks)` (1 query: `where pk = any($pks) and empresa…`).
3. Pra filhas: `const validParents = await db.parentsInEmpresa(t.parent.table, parentIds, empresaId)` (1 query).
4. O loop existente roda **igual**, mas lê `canon.get(pk)` em vez de `await findCanonical(...)`, e
   `validParents.has(parentId)` em vez de `await parentBelongsToEmpresa(...)`. **`mergeRow`, ordem, decisões
   INSERT/UPDATE, guardas cross-tenant — tudo idêntico.**
- `findCanonicalGlobal` (caminho raro: só INSERT com PK pré-existente) e `upsertRaw` (escrita) ficam **per-row**.

**Implementação real** (`makeSupabaseSyncDb`): `findCanonicalMany` = `.in(pk, pks)` (+ escopo igual ao
`findCanonical`); `parentsInEmpresa` = `select id from <parentTable> where id = any(parentIds) and <escopo empresa>`
→ Set. Reusa a mesma resolução de escopo do `parentBelongsToEmpresa` atual.

## 4. #3 — Export CSV em streaming

**Problema:** [app/(app)/historico/export/route.ts](../../../app/(app)/historico/export/route.ts) — `.limit(50000)`
+ join, tudo em memória, monta string CSV. Estoura RAM/limite da Vercel em volume.

**Solução:** `ReadableStream` que pagina a query em blocos de 1000 (`.range`) e escreve cada bloco no stream;
header CSV primeiro. **Exigir filtro de data** (`?from=&to=`) quando o status não for terminal — evita varrer
tudo. `Content-Type: text/csv; charset=utf-8` + `Content-Disposition: attachment`. Sem `.limit(50000)`.

## 5. #4 — KPI tempo médio no banco (RPC)

**Problema:** [app/(app)/admin/page.tsx:111-133](../../../app/(app)/admin/page.tsx) — puxa 5k eventos + 2ª query
com 5k IDs, calcula média em JS.

**Solução:** RPC (na mesma migration dos outros KPIs ou nova):
```sql
create or replace function public.admin_tempo_medio_horas()
returns numeric language sql stable security invoker as $$
  select avg(extract(epoch from (ev.created_at - p.created_at)) / 3600.0)::numeric
  from public.pedido_eventos ev
  join public.pedidos p on p.id = ev.pedido_id
  where ev.tipo = 'status_change' and (ev.payload->>'to') = 'finalizado' and p.deleted_at is null;
$$;
grant execute on function public.admin_tempo_medio_horas() to authenticated;
```
Wiring no admin: `const { data: tempoMedioHoras } = await supabase.rpc('admin_tempo_medio_horas')`. Remove a
query de 5k eventos + a 2ª query de IDs. Tipo adicionado em `database.ts`.

## 6. Testes e segurança (o ponto crítico)

- **#2 (engine) por TDD:** estender o **DB fake** dos testes (`lib/sync/__tests__/engine.test.ts`,
  `scenarios.test.ts`) com `findCanonicalMany`/`parentsInEmpresa`, e **manter `merge.test.ts` + `scenarios.test.ts`
  + `engine.test.ts` 100% verdes** — eles são a rede da semântica de merge. Adicionar teste novo: "push em lote
  produz o MESMO resultado que o per-row" (mesma entrada → mesmas linhas gravadas).
- **#1/#4 (RPCs):** SQL aditivo idempotente, comportamento preservado (mesmas linhas). Validados por inspeção +
  aplicados na nuvem (usuário roda) e no hub (via _hub_migrations).
- **NÃO forçar auto-update no hub da Franzoni** — as mudanças de `hub/*.mjs` e do sync só valem no **próximo
  reinstall** (testável). A nuvem (rotas /api/sync) atualiza via Vercel; o contrato hub↔nuvem é **preservado**
  (o hub manda os mesmos requests; só muda o interno da rota).
- **Verificação adversarial:** após implementar, rodar revisão multi-agente focada em (a) a RPC de escopo
  retorna exatamente as mesmas linhas que o array `.in()`; (b) o push em lote preserva a semântica de merge.

## 7. Arquivos
- Migration: `supabase/migrations/20260603140000_escala_100k.sql` (RPC sync_children_changed + admin_tempo_medio_horas).
- `lib/sync/supabase-db.ts` (selectChanges via RPC; +findCanonicalMany/parentsInEmpresa; −*IdsDaEmpresa).
- `lib/sync/engine.ts` (SyncDb +2 métodos; runPush pré-busca).
- `lib/sync/__tests__/*` (fake DB + teste de equivalência lote↔per-row).
- `lib/types/database.ts` (+2 RPCs).
- `app/(app)/historico/export/route.ts` (streaming).
- `app/(app)/admin/page.tsx` (RPC tempo médio).
