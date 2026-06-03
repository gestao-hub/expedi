# Escala — Fase 1 (paginação + índices + KPIs no banco) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar os riscos de escala mais críticos: paginação de verdade na lista de pedidos, índices compostos pra query quente, e KPIs agregados no banco (corrige números errados em silêncio).

**Architecture:** (1) Migration aditiva com `CREATE INDEX IF NOT EXISTS` (idempotente, aplica na nuvem + no hub via `_hub_migrations`). (2) RPCs SQL `SECURITY INVOKER` que agregam por `current_empresa_id()` (RLS aplica). (3) Paginação **offset** (`.range()`) + `count:'exact'` na `pedidos-list.tsx`, com controles "‹ Anterior / Próxima ›" e "página X de Y". Página = 50.

**Tech Stack:** Postgres/Supabase (migrations + RPC), Next.js 16, React, supabase-js, Vitest.

**Spec/auditoria:** [docs/superpowers/specs/2026-06-03-auditoria-escala.md](../specs/2026-06-03-auditoria-escala.md)

**Deploy:** as mudanças de **app** (paginação, wiring de RPC) entram por push→Vercel + auto-update do hub. As mudanças de **banco** (índices + RPCs) precisam ser **aplicadas na nuvem manualmente** (o usuário roda o SQL no Supabase) — o hub aplica sozinho via migration. Cada task de banco gera o SQL pronto pra colar.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20260603120000_escala_indices.sql` | Índices compostos (idempotente). |
| `supabase/migrations/20260603120100_kpis_rpc.sql` | Funções RPC de agregação (histórico + admin). |
| `app/(app)/historico/page.tsx` | Usa RPC de KPIs em vez de `.limit(10000)` + JS. |
| `app/(app)/admin/page.tsx` | Usa RPCs (top clientes/bairros/tempo médio). |
| `lib/pedidos/paginacao.ts` | Helper puro: calcula `{ from, to, totalPages, hasPrev, hasNext }` a partir de `page`+`pageSize`+`total`. |
| `lib/pedidos/__tests__/paginacao.test.ts` | Testes do helper. |
| `components/pedidos-list.tsx` | Paginação offset (`.range` + `count`) + controles + reset de página em filtro. |

---

## Task 1: Migration de índices compostos

**Files:**
- Create: `supabase/migrations/20260603120000_escala_indices.sql`

- [ ] **Step 1: Escrever a migration (idempotente)**

```sql
-- 20260603120000_escala_indices.sql — índices compostos p/ escala (aditivo, idempotente).
-- Cobre: query quente da lista (empresa+status+entrega), ordenação por created_at,
-- cursor do sync (updated_at), clientes, OS, eventos e filtros de soft-delete.

create index if not exists pedidos_empresa_status_entrega_idx
  on public.pedidos (empresa_id, status, data_entrega desc nulls last);

create index if not exists pedidos_empresa_created_idx
  on public.pedidos (empresa_id, created_at desc);

create index if not exists pedidos_empresa_updated_idx
  on public.pedidos (empresa_id, updated_at);

create index if not exists clientes_empresa_nome_idx
  on public.clientes (empresa_id, nome);

create index if not exists clientes_empresa_updated_idx
  on public.clientes (empresa_id, updated_at);

create index if not exists ordens_servico_empresa_created_idx
  on public.ordens_servico (empresa_id, created_at desc);

create index if not exists ordens_servico_empresa_updated_idx
  on public.ordens_servico (empresa_id, updated_at);

create index if not exists ordens_servico_manutencao_idx
  on public.ordens_servico (empresa_id, data_proxima_manutencao asc nulls last)
  where data_proxima_manutencao is not null;

create index if not exists pedido_eventos_tipo_created_idx
  on public.pedido_eventos (tipo, created_at desc);

create index if not exists pedido_itens_deleted_idx
  on public.pedido_itens (ponto_retirada_id) where deleted_at is null;

create index if not exists pontos_deleted_idx
  on public.pedido_pontos_retirada (pedido_id) where deleted_at is null;
```

> NOTA: sem `CONCURRENTLY` — as tabelas são pequenas hoje (criação instantânea) e `CONCURRENTLY`
> não roda dentro de transação (quebraria o apply do hub). Se no futuro as tabelas forem grandes,
> aplicar os índices na nuvem manualmente com `CONCURRENTLY` antes de mergear a migration.

- [ ] **Step 2: Validar a sintaxe localmente (dry-run mental + lint SQL básico)**

Run: `node -e "const s=require('fs').readFileSync('supabase/migrations/20260603120000_escala_indices.sql','utf8'); const n=(s.match(/create index/gi)||[]).length; if(n!==11) throw new Error('esperado 11 indices, achei '+n); if(!/if not exists/i.test(s)) throw new Error('faltou IF NOT EXISTS'); console.log('OK: '+n+' indices idempotentes')"`
Expected: `OK: 11 indices idempotentes`

- [ ] **Step 3: Verificar que os nomes de coluna existem (cruzar com colunas conhecidas)**

As colunas usadas existem (confirmado na auditoria): `pedidos(empresa_id,status,data_entrega,created_at,updated_at)`, `clientes(empresa_id,nome,updated_at)`, `ordens_servico(empresa_id,created_at,updated_at,data_proxima_manutencao)`, `pedido_eventos(tipo,created_at)`, `pedido_itens(ponto_retirada_id,deleted_at)`, `pedido_pontos_retirada(pedido_id,deleted_at)`. Se alguma divergir no apply, o `CREATE INDEX` falha explícito (reportar, não inventar).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260603120000_escala_indices.sql
git commit -m "perf(db): indices compostos p/ escala (lista, sync, clientes, OS, eventos)"
```

---

## Task 2: RPCs de KPI (agregação no banco) + wiring das páginas

**Files:**
- Create: `supabase/migrations/20260603120100_kpis_rpc.sql`
- Modify: `app/(app)/historico/page.tsx`, `app/(app)/admin/page.tsx`

- [ ] **Step 1: Escrever as RPCs (agregam por empresa via RLS helper)**

```sql
-- 20260603120100_kpis_rpc.sql — KPIs agregados no banco (corrige soma/contagem em JS sobre limit).
-- SECURITY INVOKER: roda como o usuário → RLS de pedidos aplica (escopo por empresa).
-- current_empresa_id() já existe (usado nas policies).

-- Histórico: total finalizado, valor faturado, clientes únicos.
create or replace function public.historico_kpis()
returns table (pedidos_finalizados bigint, valor_faturado numeric, clientes_unicos bigint)
language sql stable security invoker
as $$
  select count(*)::bigint,
         coalesce(sum(valor_total), 0)::numeric,
         count(distinct cliente_nome)::bigint
  from public.pedidos
  where status = 'finalizado' and deleted_at is null;
$$;

-- Admin: top clientes por faturamento (finalizado).
create or replace function public.admin_top_clientes(p_limit int default 10)
returns table (cliente_nome text, total numeric, pedidos bigint)
language sql stable security invoker
as $$
  select cliente_nome, sum(valor_total)::numeric, count(*)::bigint
  from public.pedidos
  where status = 'finalizado' and deleted_at is null and cliente_nome is not null
  group by cliente_nome
  order by 2 desc
  limit greatest(1, least(p_limit, 100));
$$;

-- Admin: top bairros por volume.
create or replace function public.admin_top_bairros(p_limit int default 10)
returns table (cliente_bairro text, pedidos bigint)
language sql stable security invoker
as $$
  select cliente_bairro, count(*)::bigint
  from public.pedidos
  where deleted_at is null and cliente_bairro is not null
  group by cliente_bairro
  order by 2 desc
  limit greatest(1, least(p_limit, 100));
$$;

grant execute on function public.historico_kpis() to authenticated;
grant execute on function public.admin_top_clientes(int) to authenticated;
grant execute on function public.admin_top_bairros(int) to authenticated;
```

> Decisão: deixei `tempo_medio` (admin) fora da Fase 1 — depende de join com `pedido_eventos`
> e é menos crítico; entra na Fase 2 junto com o resto do admin. As 3 RPCs acima cobrem os KPIs
> que estavam **errados em silêncio**.

- [ ] **Step 2: Validar sintaxe**

Run: `node -e "const s=require('fs').readFileSync('supabase/migrations/20260603120100_kpis_rpc.sql','utf8'); ['historico_kpis','admin_top_clientes','admin_top_bairros'].forEach(f=>{if(!s.includes('function public.'+f)) throw new Error('faltou '+f)}); if(!/security invoker/gi.test(s)) throw new Error('faltou security invoker'); console.log('OK 3 RPCs')"`
Expected: `OK 3 RPCs`

- [ ] **Step 3: Trocar `historico/page.tsx` pra usar a RPC**

LER o arquivo. Substituir o bloco que faz `.select('valor_total, cliente_nome').eq('status','finalizado').limit(10000)` + o `reduce`/`Set` por:
```ts
const { data: kpi } = await supabase.rpc('historico_kpis').single();
const pedidosFinalizados = Number(kpi?.pedidos_finalizados ?? 0);
const valorTotal = Number(kpi?.valor_faturado ?? 0);
const clientesUnicos = Number(kpi?.clientes_unicos ?? 0);
```
Ajustar os nomes das variáveis ao que o JSX já usa (manter o mesmo nome exibido nos cards). Remover o `.limit(10000)` e a agregação em JS.

- [ ] **Step 4: Trocar `admin/page.tsx` (top clientes/bairros) pra usar as RPCs**

LER o arquivo. Substituir as duas queries `.select(...).limit(10000)` + os loops de `Map` por:
```ts
const [{ data: topClientes }, { data: topBairros }] = await Promise.all([
  supabase.rpc('admin_top_clientes', { p_limit: 10 }),
  supabase.rpc('admin_top_bairros', { p_limit: 10 }),
]);
```
Adaptar o JSX: `topClientes` agora é `[{cliente_nome, total, pedidos}]` e `topBairros` é `[{cliente_bairro, pedidos}]`. Manter o resto do dashboard (tempoMedio etc.) como está por enquanto.

- [ ] **Step 5: Verificar**

Run: `npm run typecheck` (exit 0).
Run: `grep -n "limit(10000)" "app/(app)/historico/page.tsx" "app/(app)/admin/page.tsx"` → **zero** ocorrências nessas duas (as que mexemos).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260603120100_kpis_rpc.sql "app/(app)/historico/page.tsx" "app/(app)/admin/page.tsx"
git commit -m "perf(kpi): agrega no banco via RPC (corrige soma/contagem truncada em limit 10000)"
```

---

## Task 3: Helper de paginação (puro, testável)

**Files:**
- Create: `lib/pedidos/paginacao.ts`, `lib/pedidos/__tests__/paginacao.test.ts`

- [ ] **Step 1: Teste primeiro**

```ts
// lib/pedidos/__tests__/paginacao.test.ts
import { describe, it, expect } from 'vitest';
import { calcularPaginacao, PAGE_SIZE } from '../paginacao';

describe('calcularPaginacao', () => {
  it('página 1 de 53 itens (pageSize 50): from 0, to 49, 2 páginas, sem prev, com next', () => {
    expect(calcularPaginacao(1, 53)).toEqual({ from: 0, to: 49, totalPages: 2, hasPrev: false, hasNext: true });
  });
  it('página 2 de 53: from 50, to 99, sem next, com prev', () => {
    const r = calcularPaginacao(2, 53);
    expect(r.from).toBe(50); expect(r.hasNext).toBe(false); expect(r.hasPrev).toBe(true); expect(r.totalPages).toBe(2);
  });
  it('0 itens: 1 página, sem prev/next', () => {
    expect(calcularPaginacao(1, 0)).toEqual({ from: 0, to: PAGE_SIZE - 1, totalPages: 1, hasPrev: false, hasNext: false });
  });
  it('clampa página acima do total pra última', () => {
    const r = calcularPaginacao(99, 53);
    expect(r.from).toBe(50); expect(r.hasNext).toBe(false);
  });
  it('clampa página < 1 pra 1', () => {
    expect(calcularPaginacao(0, 53).from).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar (falha — módulo não existe)**

Run: `npx vitest run lib/pedidos/__tests__/paginacao.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

```ts
// lib/pedidos/paginacao.ts
export const PAGE_SIZE = 50;

export type Paginacao = { from: number; to: number; totalPages: number; hasPrev: boolean; hasNext: boolean };

/** Calcula o range (.range(from,to)) e os flags de navegação. Clampa page em [1, totalPages]. */
export function calcularPaginacao(page: number, total: number, pageSize = PAGE_SIZE): Paginacao {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const p = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
  const from = (p - 1) * pageSize;
  return { from, to: from + pageSize - 1, totalPages, hasPrev: p > 1, hasNext: p < totalPages };
}
```

- [ ] **Step 4: Rodar (passa, 5 testes)**

Run: `npx vitest run lib/pedidos/__tests__/paginacao.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/pedidos/paginacao.ts lib/pedidos/__tests__/paginacao.test.ts
git commit -m "feat(pedidos): helper de paginacao offset (calcularPaginacao)"
```

---

## Task 4: Paginação offset na lista (`pedidos-list.tsx`)

**Files:**
- Modify: `components/pedidos-list.tsx`

- [ ] **Step 1: LER o componente** (já tem 895 linhas — entender estado, o `useEffect` da query (linhas ~148-181), o realtime (~239-289), e o rodapé da tabela onde colocar os controles).

- [ ] **Step 2: Adicionar estado de página**

Junto aos outros `useState` (perto da linha 124):
```ts
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
```
Import do helper no topo:
```ts
import { calcularPaginacao, PAGE_SIZE } from '@/lib/pedidos/paginacao';
```

- [ ] **Step 3: Trocar `.limit(200)` por count + range**

No `useEffect` da query, trocar `.select('*')` por `.select('*', { count: 'exact' })` e remover `.limit(200)`. Antes de aplicar o range, calcular a paginação com o `total` atual NÃO dá (total vem da query) — então: rode a query com `.range(from, to)` onde `from/to` vêm de `calcularPaginacao(page, total)`, e no retorno **atualize `total`** com o `count`. Padrão:
```ts
    const { from, to } = calcularPaginacao(page, total);
    let query = supabase
      .from('pedidos')
      .select('*', { count: 'exact' })
      .order(sortBy, { ascending: sortDir === 'asc', nullsFirst: false })
      .order('id', { ascending: true })       // desempate estável
      .range(from, to);
    // ...filtros status/search/data iguais...
    query.then(({ data, count, error }) => {
      if (cancel) return;
      if (error) toast.error(error.message);
      setPedidos((data ?? []) as Pedido[]);
      setTotal(count ?? 0);
      setLoading(false);
    });
```
Adicionar `page` às dependências do `useEffect` (linha ~181): `[supabase, status, search, sortBy, sortDir, dateRange, customFrom, customTo, page]`.

- [ ] **Step 4: Resetar pra página 1 quando muda filtro/busca/ordenação**

Adicionar um `useEffect` que zera a página quando qualquer filtro muda (pra não ficar "preso" numa página que não existe mais):
```ts
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [status, search, sortBy, sortDir, dateRange, customFrom, customTo]);
```

- [ ] **Step 5: Realtime → refetch da página atual (em vez de splice)**

No bloco realtime (~239-289), com paginação o splice no array local fica inconsistente (a página tem só 50). Trocar os 3 handlers (`INSERT`/`UPDATE`/`DELETE`) por um **refetch** simples: forçar o `useEffect` da query a rodar de novo. Mais simples: criar um `const [tick, setTick] = useState(0);`, no handler do realtime chamar `setTick(t=>t+1)`, e adicionar `tick` às deps do `useEffect` da query. Remover os `setPedidos((prev)=>...)` de splice.

- [ ] **Step 6: Controles de paginação no rodapé da tabela**

Depois da tabela (após o fechamento do bloco que renderiza `pedidos.map`), adicionar:
```tsx
{(() => {
  const { totalPages, hasPrev, hasNext } = calcularPaginacao(page, total);
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-muted-foreground border-t">
      <span>{total} {total === 1 ? 'pedido' : 'pedidos'} · página {Math.min(page, totalPages)} de {totalPages}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!hasPrev}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          className="px-3 py-1.5 rounded-md border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted/60"
        >‹ Anterior</button>
        <button
          type="button"
          disabled={!hasNext}
          onClick={() => setPage((p) => p + 1)}
          className="px-3 py-1.5 rounded-md border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted/60"
        >Próxima ›</button>
      </div>
    </div>
  );
})()}
```

- [ ] **Step 7: Verificar**

Run: `npm run typecheck` (exit 0).
Run: `npm run lint -- components/pedidos-list.tsx` (sem novos erros).
Run: `grep -n "limit(200)" components/pedidos-list.tsx` → **vazio**.
Run: `npm run test` (0 failed).

- [ ] **Step 8: Commit**

```bash
git add components/pedidos-list.tsx
git commit -m "feat(lista): paginacao offset de verdade (range+count, controles, reset em filtro)"
```

---

## Self-Review (autor)
- **Cobertura:** índices (T1) ✓; KPIs no banco corrigindo truncagem (T2) ✓; paginação real com controles + contagem (T3+T4) ✓. Cobre os itens 1 (KPIs), 3 (índices) e 4 (paginação) da auditoria. (Sync/clientes/realtime/export = Fases 2-3.)
- **Placeholders:** nenhum — SQL e código completos; mudanças no componente grande têm o trecho exato + instrução de onde.
- **Consistência:** `calcularPaginacao(page,total)` e `PAGE_SIZE` usados igual em T3/T4; RPCs (`historico_kpis`/`admin_top_clientes`/`admin_top_bairros`) definidas em T2 e chamadas com os mesmos nomes; índices em colunas confirmadas na auditoria.
- **Deploy:** os 2 arquivos SQL precisam ser aplicados na **nuvem** manualmente (o hub aplica sozinho). Anexar o SQL no fim da execução pro usuário colar no Supabase.
