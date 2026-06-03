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
