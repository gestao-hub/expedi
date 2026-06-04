-- 20260603180100_kpis_empresa_explicito.sql — empresa_id explícito no WHERE das RPCs de KPI
-- pra o planner enxergar o predicado e usar os índices compostos (empresa_id, ...). INVOKER:
-- current_empresa_id() roda como o usuário (mesma segurança/escopo de antes — não muda resultado).
create or replace function public.historico_kpis()
returns table (pedidos_finalizados bigint, valor_faturado numeric, clientes_unicos bigint)
language sql stable security invoker as $$
  select count(*)::bigint, coalesce(sum(valor_total),0)::numeric, count(distinct cliente_nome)::bigint
  from public.pedidos
  where empresa_id = public.current_empresa_id() and status='finalizado' and deleted_at is null;
$$;

create or replace function public.admin_top_clientes(p_limit int default 10)
returns table (cliente_nome text, total numeric, pedidos bigint)
language sql stable security invoker as $$
  select cliente_nome, sum(valor_total)::numeric, count(*)::bigint from public.pedidos
  where empresa_id = public.current_empresa_id() and status='finalizado' and deleted_at is null and cliente_nome is not null
  group by cliente_nome order by 2 desc limit greatest(1, least(p_limit,100));
$$;

create or replace function public.admin_top_bairros(p_limit int default 10)
returns table (cliente_bairro text, pedidos bigint)
language sql stable security invoker as $$
  select cliente_bairro, count(*)::bigint from public.pedidos
  where empresa_id = public.current_empresa_id() and deleted_at is null and cliente_bairro is not null
  group by cliente_bairro order by 2 desc limit greatest(1, least(p_limit,100));
$$;

create or replace function public.admin_tempo_medio_horas()
returns numeric language sql stable security invoker as $$
  select avg(extract(epoch from (ev.created_at - p.created_at)) / 3600.0)::numeric
  from public.pedido_eventos ev
  join public.pedidos p on p.id = ev.pedido_id
  where p.empresa_id = public.current_empresa_id()
    and ev.tipo = 'status_change' and (ev.payload->>'to') = 'finalizado' and p.deleted_at is null;
$$;
