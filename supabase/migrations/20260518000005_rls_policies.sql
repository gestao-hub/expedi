-- Migration 05: Row Level Security
-- Modelo:
--   admin     → tudo
--   vendedor  → seus próprios pedidos (vendedor_id = auth.uid())
--   logistica → todos os pedidos, mas só pode mudar status e gravar pedido_logistica

-- Helper: pega role do usuário corrente
create or replace function public.current_user_role()
returns user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

-- =========================================================================
-- profiles
-- =========================================================================
alter table public.profiles enable row level security;

drop policy if exists "profiles_self_read"   on public.profiles;
drop policy if exists "profiles_admin_all"   on public.profiles;
drop policy if exists "profiles_self_update" on public.profiles;

create policy "profiles_self_read" on public.profiles
  for select using (id = auth.uid() or current_user_role() = 'admin');

create policy "profiles_self_update" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy "profiles_admin_all" on public.profiles
  for all using (current_user_role() = 'admin') with check (current_user_role() = 'admin');

-- Impede usuário comum de alterar o próprio role; só admin pode (via policy admin_all)
create or replace function public.prevent_self_role_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.role is distinct from old.role) and current_user_role() <> 'admin' then
    raise exception 'Você não pode alterar o próprio role';
  end if;
  return new;
end $$;

drop trigger if exists profiles_prevent_role_change on public.profiles;
create trigger profiles_prevent_role_change
  before update on public.profiles
  for each row execute function public.prevent_self_role_change();

-- =========================================================================
-- pedidos
-- =========================================================================
alter table public.pedidos enable row level security;

drop policy if exists "pedidos_read"        on public.pedidos;
drop policy if exists "pedidos_vendedor_iu" on public.pedidos;
drop policy if exists "pedidos_logistica_u" on public.pedidos;
drop policy if exists "pedidos_admin_all"   on public.pedidos;

-- Vendedor vê os seus; logística e admin veem todos
create policy "pedidos_read" on public.pedidos for select using (
  current_user_role() in ('admin','logistica') or vendedor_id = auth.uid()
);

-- Vendedor insere/edita os próprios (status rascunho/pendente apenas)
create policy "pedidos_vendedor_iu" on public.pedidos for insert
  with check (current_user_role() = 'vendedor' and vendedor_id = auth.uid());

create policy "pedidos_vendedor_update" on public.pedidos for update
  using  (current_user_role() = 'vendedor' and vendedor_id = auth.uid() and status in ('rascunho','pendente'))
  with check (current_user_role() = 'vendedor' and vendedor_id = auth.uid() and status in ('rascunho','pendente','cancelado'));

-- Logística pode atualizar status (em_separacao, finalizado, cancelado)
create policy "pedidos_logistica_u" on public.pedidos for update
  using (current_user_role() = 'logistica')
  with check (current_user_role() = 'logistica');

create policy "pedidos_admin_all" on public.pedidos
  for all using (current_user_role() = 'admin') with check (current_user_role() = 'admin');

-- =========================================================================
-- pontos de retirada + itens — herdam acesso do pedido
-- =========================================================================
alter table public.pedido_pontos_retirada enable row level security;
alter table public.pedido_itens          enable row level security;

drop policy if exists "pontos_via_pedido" on public.pedido_pontos_retirada;
create policy "pontos_via_pedido" on public.pedido_pontos_retirada for all using (
  exists (select 1 from public.pedidos p where p.id = pedido_id
    and (current_user_role() in ('admin','logistica') or p.vendedor_id = auth.uid()))
) with check (
  exists (select 1 from public.pedidos p where p.id = pedido_id
    and (current_user_role() in ('admin','logistica') or p.vendedor_id = auth.uid()))
);

drop policy if exists "itens_via_ponto" on public.pedido_itens;
create policy "itens_via_ponto" on public.pedido_itens for all using (
  exists (
    select 1 from public.pedido_pontos_retirada pr
    join public.pedidos p on p.id = pr.pedido_id
    where pr.id = ponto_retirada_id
      and (current_user_role() in ('admin','logistica') or p.vendedor_id = auth.uid())
  )
) with check (
  exists (
    select 1 from public.pedido_pontos_retirada pr
    join public.pedidos p on p.id = pr.pedido_id
    where pr.id = ponto_retirada_id
      and (current_user_role() in ('admin','logistica') or p.vendedor_id = auth.uid())
  )
);

-- =========================================================================
-- pedido_logistica + pedido_eventos
-- =========================================================================
alter table public.pedido_logistica enable row level security;
alter table public.pedido_eventos   enable row level security;

drop policy if exists "logistica_read"  on public.pedido_logistica;
drop policy if exists "logistica_write" on public.pedido_logistica;

create policy "logistica_read" on public.pedido_logistica for select using (
  exists (select 1 from public.pedidos p where p.id = pedido_id
    and (current_user_role() in ('admin','logistica') or p.vendedor_id = auth.uid()))
);

create policy "logistica_write" on public.pedido_logistica for all
  using  (current_user_role() in ('admin','logistica'))
  with check (current_user_role() in ('admin','logistica'));

drop policy if exists "eventos_read"   on public.pedido_eventos;
drop policy if exists "eventos_insert" on public.pedido_eventos;

create policy "eventos_read" on public.pedido_eventos for select using (
  exists (select 1 from public.pedidos p where p.id = pedido_id
    and (current_user_role() in ('admin','logistica') or p.vendedor_id = auth.uid()))
);

create policy "eventos_insert" on public.pedido_eventos for insert with check (
  exists (select 1 from public.pedidos p where p.id = pedido_id
    and (current_user_role() in ('admin','logistica') or p.vendedor_id = auth.uid()))
);
