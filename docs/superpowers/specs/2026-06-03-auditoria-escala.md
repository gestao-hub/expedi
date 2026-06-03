# Auditoria de Escala — Exped (2026-06-03)

Verdito honesto: **aguenta o uso da Franzoni hoje tranquilo** (1 loja, centenas/baixos milhares de
pedidos). Mas **NÃO está pronta pra escala grande** (10k+ pedidos por status, 50k+ clientes, anos de
histórico, muitas empresas). Há ~8 pontos reais — e **2 deles dão dado ERRADO silencioso** (KPI), não só
lentidão. Abaixo, priorizado.

## 🔴 Crítico — correção de DADO (silenciosamente errado em volume)
1. **KPIs agregados em JS com `.limit(10000)`** → acima de 10k linhas o número fica **errado sem avisar**.
   - Histórico: `valor faturado` + `clientes únicos` ([app/(app)/historico/page.tsx:19-31](../../../app/(app)/historico/page.tsx)) — `sum`/`Set` em JS sobre `.limit(10000)`.
   - Admin: top clientes/bairros + tempo médio ([app/(app)/admin/page.tsx:54-132](../../../app/(app)/admin/page.tsx)) — `.limit(10000)` ×2 + `.limit(5000)`.
   - **Fix:** agregar no banco (`SUM`/`COUNT(DISTINCT)`/`GROUP BY ... LIMIT 10`) via RPC. Retorna 10 linhas em vez de 20k.

## 🔴 Crítico — sync cresce pra sempre (sem janela/retenção)
2. **Sync puxa/empurra tudo que tem `updated_at > cursor`, sem janela de tempo nem status.**
   ([lib/sync/supabase-db.ts:26-48](../../../lib/sync/supabase-db.ts), [hub/sync-tables.mjs:25,31](../../../hub/sync-tables.mjs))
   - Pedidos de anos atrás + notificações antigas circulam indefinidamente; o hub local acumula tudo.
   - `pedidoIdsDaEmpresa` carrega **todos** os IDs da empresa em memória + `.in()` gigante (100k UUIDs).
   - **Fix:** janela (ex.: `updated_at > now()-interval '1 year'` ou status aberto) + reescrever escopo de filhas como subquery/JOIN no banco (RPC) em vez de array em memória.

## 🟠 Alto — índices compostos faltando (lentidão progressiva)
3. **Só há índices de coluna única; faltam compostos pro padrão real de filtro/ordenação.**
   - `pedidos(empresa_id, status, data_entrega)` — a query mais quente do app (lista).
   - `pedidos(empresa_id, created_at)` — export, gráfico 30d, histórico.
   - `pedidos(empresa_id, updated_at)` + idem clientes/OS/notificações — usado pelo **sync** (`WHERE updated_at > cursor`).
   - `clientes(empresa_id, nome)`, `ordens_servico(empresa_id, created_at)`, `pedido_eventos(tipo, created_at)`.
   - Soft-delete parciais: `pedido_itens(deleted_at) WHERE NULL`.
   - **Fix:** migration aditiva com `CREATE INDEX` (idempotente, sem downtime).

## 🟠 Alto — lista de pedidos sem paginação real
4. **`.limit(200)` + renderiza tudo, sem paginar e sem avisar quando trunca** ([components/pedidos-list.tsx:154-157](../../../components/pedidos-list.tsx)).
   - Se uma aba passar de 200, os excedentes **somem** (mostra os 200 de entrega mais antiga).
   - **Fix:** paginação server-side **keyset** (cursor por `data_entrega,id`) — não offset (offset fica lento em página alta) e não scroll infinito (pedido do usuário). Controles "‹ Anterior / Próxima ›" + "página X" + contagem.

## 🟠 Alto — sync resiliência
5. `maxBuffer` do psql fixo em **32 MB** ([hub/sync.mjs:378,412](../../../hub/sync.mjs)) — 500 linhas grandes estouram → ciclo falha e **cursor trava**. Fix: 256 MB (ou streaming).
6. **Sem timeout no `fetch`** do pull/push → conexão pendurada **trava o sync sem aviso** (`running` fica true). Fix: `AbortSignal.timeout(30000)`.
7. **Push** drena só 500/tick (sem loop no ciclo); `runPush` faz 2-4 queries **por linha** em série ([lib/sync/engine.ts:145-205](../../../lib/sync/engine.ts)). Fix: loop de drenagem + batch das canônicas.

## 🟡 Médio — front
8. **Clientes** sem `.limit()` + sort/filter no browser, **sem debounce** ([admin/clientes/page.tsx](../../../app/(app)/admin/clientes/page.tsx), [components/clientes-table.tsx:69-91](../../../components/clientes-table.tsx)). Fix: paginação + busca server-side + debounce.
9. **Busca da lista de pedidos sem debounce** → query por tecla ([pedidos-list.tsx:181](../../../components/pedidos-list.tsx)). Fix: debounce ~300ms.
10. **Realtime** canal nome fixo `'pedidos-list'` sem `filter empresa_id`; o efeito de `itensParciais` re-roda a cada evento ([pedidos-list.tsx:239-289](../../../components/pedidos-list.tsx)). Fix: canal por empresa + filter + dependências do efeito.
11. **Export CSV** 50k em memória sem streaming ([historico/export/route.ts](../../../app/(app)/historico/export/route.ts)). Fix: exigir filtro de data + streaming.

## Pontos OK (auditados e sem risco)
- `itensParciais` na lista **não** é N+1: são 2 queries com `.in()` pra todos os parciais. ✅
- Sync **pull** é incremental por cursor + paginado (`LIMIT 500`, loop `while hasMore`), com lock anti-sobreposição. ✅
- Cursor `_sync_cursors` (pull_at/push_at) avança só após aplicar. ✅

## Escopo proposto (faseado)
- **Fase 1 (agora):** paginação keyset na lista + índices compostos (migration aditiva) + KPIs no banco (RPC). → resolve o pedido do usuário + os 2 "dados errados" + a lentidão da query quente.
- **Fase 2:** sync (janela/retenção + subquery de escopo + maxBuffer + fetch timeout) + clientes paginado + debounce.
- **Fase 3:** export streaming + push drenagem em lote + realtime por empresa + virtualização.
