-- 20260603140000_escala_100k.sql — RPCs p/ sync escalável + KPI tempo médio (aditivo, idempotente).

-- (1) Filhas mudadas escopadas por empresa via JOIN no banco (substitui o array .in() em memória).
--     SECURITY DEFINER + revoke (mesmo padrão de sync_parent_in_empresa): só o service_role do
--     /api/sync/pull chama; nunca exposto a authenticated (que poderia passar qualquer empresa).
create or replace function public.sync_children_changed(
  p_table text, p_empresa uuid, p_cursor timestamptz, p_limit int
) returns setof jsonb language plpgsql stable security definer set search_path = public as $$
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
  elsif p_table = 'os_itens' then
    return query
      select to_jsonb(c) from public.os_itens c
      join public.ordens_servico o on o.id = c.os_id
      where o.empresa_id = p_empresa and c.updated_at > p_cursor
      order by c.updated_at asc limit p_limit;
  elsif p_table = 'os_servicos' then
    return query
      select to_jsonb(c) from public.os_servicos c
      join public.ordens_servico o on o.id = c.os_id
      where o.empresa_id = p_empresa and c.updated_at > p_cursor
      order by c.updated_at asc limit p_limit;
  else
    raise exception 'sync_children_changed: tabela nao suportada %', p_table;
  end if;
end $$;
revoke all on function public.sync_children_changed(text, uuid, timestamptz, int) from public, anon, authenticated;

-- (2) Subconjunto de p_ids que pertencem à empresa (checagem de pais em lote).
create or replace function public.sync_parents_in_empresa(
  p_table text, p_ids uuid[], p_empresa uuid
) returns setof uuid language plpgsql stable security definer set search_path = public as $$
begin
  if p_table = 'pedidos' then
    return query select id from public.pedidos where id = any(p_ids) and empresa_id = p_empresa;
  elsif p_table = 'ordens_servico' then
    return query select id from public.ordens_servico where id = any(p_ids) and empresa_id = p_empresa;
  elsif p_table = 'pedido_pontos_retirada' then
    return query
      select pp.id from public.pedido_pontos_retirada pp
      join public.pedidos p on p.id = pp.pedido_id
      where pp.id = any(p_ids) and p.empresa_id = p_empresa;
  else
    return; -- nenhum
  end if;
end $$;
revoke all on function public.sync_parents_in_empresa(text, uuid[], uuid) from public, anon, authenticated;

-- (3) KPI tempo médio "pendente→finalizado" (horas), agregado no banco. INVOKER + grant (RLS escopa empresa).
create or replace function public.admin_tempo_medio_horas()
returns numeric language sql stable security invoker as $$
  select avg(extract(epoch from (ev.created_at - p.created_at)) / 3600.0)::numeric
  from public.pedido_eventos ev
  join public.pedidos p on p.id = ev.pedido_id
  where ev.tipo = 'status_change' and (ev.payload->>'to') = 'finalizado' and p.deleted_at is null;
$$;
grant execute on function public.admin_tempo_medio_horas() to authenticated;
