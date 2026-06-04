-- 20260603180000_multitenant_indices.sql — busca trigram escopada por empresa + higiene (aditivo).
create extension if not exists btree_gin;

-- Recria os índices de busca incluindo empresa_id (prefixo btree) → poda por tenant antes do GIN.
drop index if exists public.pedidos_search_trgm_idx;
create index pedidos_search_trgm_idx on public.pedidos
  using gin (empresa_id, (coalesce(cliente_nome,'') || ' ' || coalesce(documento_erp,'') || ' ' || coalesce(cliente_bairro,'')) gin_trgm_ops);

drop index if exists public.clientes_nome_trgm;
create index clientes_nome_trgm on public.clientes
  using gin (empresa_id, nome gin_trgm_ops);

-- Índice faltante (RLS de cliente_enderecos filtra empresa_id, sem índice de apoio).
create index if not exists cliente_enderecos_empresa_idx on public.cliente_enderecos (empresa_id);

-- Higiene: dropa índices de coluna única pré-multitenant (cobertos pelos compostos da Fase 1;
-- evita o planner cruzar tenants por esses paths). Nenhum código usa pelo nome (verificado).
drop index if exists public.pedidos_status_idx;
drop index if exists public.pedidos_bairro_idx;
drop index if exists public.pedidos_data_entrega_idx;
