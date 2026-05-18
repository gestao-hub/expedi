-- Migration 04: dados de logística (1-1) + audit log de eventos

create table if not exists public.pedido_logistica (
  pedido_id           uuid primary key references public.pedidos(id) on delete cascade,
  pre_carga           text,
  motorista           text,
  veiculo             text,
  km_inicial          numeric(10,1),
  km_final            numeric(10,1),
  regiao              text,
  peso_bruto_total    numeric(14,3),
  peso_liquido_total  numeric(14,3),
  conferente          text,
  observacoes         text,
  updated_by          uuid references public.profiles(id) on delete set null,
  updated_at          timestamptz not null default now()
);

drop trigger if exists set_logistica_updated_at on public.pedido_logistica;
create trigger set_logistica_updated_at
  before update on public.pedido_logistica
  for each row execute function public.set_updated_at();

-- Audit log (1-N por pedido)
create table if not exists public.pedido_eventos (
  id           uuid primary key default gen_random_uuid(),
  pedido_id    uuid not null references public.pedidos(id) on delete cascade,
  tipo         text not null,                  -- 'criado' | 'editado' | 'status_change' | 'logistica_update' | 'cancelado' | ...
  descricao    text,
  payload      jsonb,                          -- {from: 'pendente', to: 'em_separacao'} etc.
  usuario_id   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists eventos_pedido_idx on public.pedido_eventos(pedido_id, created_at desc);

-- Trigger: registra evento sempre que status muda
create or replace function public.log_pedido_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'UPDATE' and new.status is distinct from old.status) then
    insert into public.pedido_eventos (pedido_id, tipo, descricao, payload, usuario_id)
    values (
      new.id,
      'status_change',
      format('Status alterado de %s para %s', old.status, new.status),
      jsonb_build_object('from', old.status, 'to', new.status),
      auth.uid()
    );
  elsif (tg_op = 'INSERT') then
    insert into public.pedido_eventos (pedido_id, tipo, descricao, payload, usuario_id)
    values (new.id, 'criado', 'Pedido criado', jsonb_build_object('status', new.status), auth.uid());
  end if;
  return new;
end $$;

drop trigger if exists pedidos_log_status on public.pedidos;
create trigger pedidos_log_status
  after insert or update of status on public.pedidos
  for each row execute function public.log_pedido_status_change();
