-- 20260603120100_kpis_rpc.sql — KPIs agregados no banco (corrige soma/contagem em JS sobre limit).
-- SECURITY INVOKER: roda como o usuário → a RLS de `pedidos` aplica (escopo por empresa).

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
