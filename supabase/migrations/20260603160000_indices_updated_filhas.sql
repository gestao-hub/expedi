-- 20260603160000_indices_updated_filhas.sql — índices de updated_at nas tabelas FILHAS do sync.
-- Achado por medição (EXPLAIN ANALYZE em 100k+ pedidos): a Fase 1 indexou (empresa_id, updated_at)
-- nos pais (pedidos/clientes/ordens_servico), mas o sync incremental das filhas filtra por
-- `c.updated_at > cursor` (em sync_children_changed) e SEM índice varre a tabela filha inteira a
-- cada ciclo de 10s. Com o índice: ~72ms → ~0.44ms (regime permanente). Aditivo, idempotente.

create index if not exists pedido_itens_updated_idx on public.pedido_itens (updated_at);
create index if not exists pedido_pontos_updated_idx on public.pedido_pontos_retirada (updated_at);
create index if not exists os_itens_updated_idx on public.os_itens (updated_at);
create index if not exists os_servicos_updated_idx on public.os_servicos (updated_at);
