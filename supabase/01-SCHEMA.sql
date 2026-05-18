-- ============================================================
-- Franzoni Mapa de Carregamento — Schema completo
-- Gerado a partir de supabase/migrations/*.sql
-- Copie/cole este arquivo no Supabase Dashboard → SQL Editor → Run
-- ============================================================


-- >>> 20260518000001_extensions_enums.sql >>>
-- Franzoni Mapa de Carregamento
-- Migration 01: extensions + enums

create extension if not exists "pg_trgm";    -- busca textual (filtros logística)
create extension if not exists "unaccent";   -- normaliza acentos em buscas
create extension if not exists "pgcrypto";   -- gen_random_uuid()

do $$ begin
  create type user_role as enum ('admin', 'vendedor', 'logistica');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pedido_status as enum (
    'rascunho',
    'pendente',
    'em_separacao',
    'finalizado',
    'cancelado'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type ponto_retirada_tipo as enum ('loja', 'deposito');
exception when duplicate_object then null; end $$;
-- <<< 20260518000001_extensions_enums.sql <<<


-- >>> 20260518000002_profiles.sql >>>
-- Migration 02: profiles + handle_new_user trigger

create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text not null default '',
  email         text not null default '',
  role          user_role not null default 'vendedor',
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles(role);

-- updated_at trigger reutilizável
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-cria profile ao criar user (lendo role e full_name do raw_user_meta_data, se vierem)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'vendedor')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
-- <<< 20260518000002_profiles.sql <<<


-- >>> 20260518000003_pedidos.sql >>>
-- Migration 03: pedidos + pontos de retirada + itens

create table if not exists public.pedidos (
  id                 uuid primary key default gen_random_uuid(),
  numero_mapa        bigserial unique,                            -- nº sequencial interno (para impressão)
  documento_erp      text,                                        -- ex.: "L4077"
  data_emissao       date,
  data_entrega       date,

  -- dados do cliente (denormalizados — o pedido é o snapshot)
  cliente_codigo     text,
  cliente_nome       text not null default '',
  cliente_cnpj_cpf   text,
  cliente_endereco   text,
  cliente_bairro     text,
  cliente_cidade     text,
  cliente_uf         text,
  cliente_cep        text,
  cliente_telefone   text,

  -- comerciais
  forma_pagamento    text,
  parcelas           text,
  valor_total        numeric(14,2) not null default 0,
  observacoes        text,

  -- gestão
  status             pedido_status not null default 'rascunho',
  storage_pdf_path   text,                                        -- path no bucket pedidos-pdfs
  vendedor_id        uuid references public.profiles(id) on delete set null,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists pedidos_status_idx       on public.pedidos(status);
create index if not exists pedidos_vendedor_idx     on public.pedidos(vendedor_id);
create index if not exists pedidos_data_entrega_idx on public.pedidos(data_entrega);
create index if not exists pedidos_bairro_idx       on public.pedidos(cliente_bairro);
-- busca textual (filtro livre na listagem)
create index if not exists pedidos_search_trgm_idx
  on public.pedidos
  using gin ((coalesce(cliente_nome,'') || ' ' || coalesce(documento_erp,'') || ' ' || coalesce(cliente_bairro,'')) gin_trgm_ops);

drop trigger if exists set_pedidos_updated_at on public.pedidos;
create trigger set_pedidos_updated_at
  before update on public.pedidos
  for each row execute function public.set_updated_at();

create table if not exists public.pedido_pontos_retirada (
  id            uuid primary key default gen_random_uuid(),
  pedido_id     uuid not null references public.pedidos(id) on delete cascade,
  tipo          ponto_retirada_tipo not null default 'loja',
  empresa_nome  text not null default '',
  endereco      text,
  ordem         smallint not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists pontos_pedido_idx on public.pedido_pontos_retirada(pedido_id, ordem);

create table if not exists public.pedido_itens (
  id                  uuid primary key default gen_random_uuid(),
  ponto_retirada_id   uuid not null references public.pedido_pontos_retirada(id) on delete cascade,
  codigo              text not null default '',
  descricao           text not null default '',
  quantidade          numeric(14,3) not null default 0,
  unidade             text not null default 'UN',
  preco_unitario      numeric(14,4) not null default 0,
  desconto            numeric(14,4) not null default 0,
  total               numeric(14,2) not null default 0,
  referencia          text,
  lote                text,
  peso_bruto          numeric(14,3),
  peso_liquido        numeric(14,3),
  endereco_estoque    text,
  ordem               smallint not null default 0,
  created_at          timestamptz not null default now()
);

create index if not exists itens_ponto_idx on public.pedido_itens(ponto_retirada_id, ordem);
-- <<< 20260518000003_pedidos.sql <<<


-- >>> 20260518000004_logistica_eventos.sql >>>
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
-- <<< 20260518000004_logistica_eventos.sql <<<


-- >>> 20260518000005_rls_policies.sql >>>
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
-- <<< 20260518000005_rls_policies.sql <<<


-- >>> 20260518000006_storage_realtime.sql >>>
-- Migration 06: Storage bucket de PDFs + realtime publication

-- Bucket privado para os PDFs dos pedidos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pedidos-pdfs',
  'pedidos-pdfs',
  false,
  10485760,                       -- 10 MB
  array['application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Policies do Storage: usuário só lê/escreve seus próprios PDFs;
-- logística e admin leem qualquer um.
drop policy if exists "pdfs_owner_write" on storage.objects;
drop policy if exists "pdfs_owner_read"  on storage.objects;
drop policy if exists "pdfs_staff_read"  on storage.objects;

create policy "pdfs_owner_write" on storage.objects
  for all to authenticated
  using  (bucket_id = 'pedidos-pdfs' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'pedidos-pdfs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "pdfs_staff_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'pedidos-pdfs'
    and current_user_role() in ('admin', 'logistica')
  );

-- Realtime: publica as tabelas que o front escuta (idempotente)
do $$ begin
  alter publication supabase_realtime add table public.pedidos;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.pedido_eventos;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.pedido_logistica;
exception when duplicate_object then null; end $$;
-- <<< 20260518000006_storage_realtime.sql <<<

