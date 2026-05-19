-- Migration 09: cadastro de motoristas e veículos
--
-- Vai popular o datalist do BaixaForm da logística (antes vazio).
-- Mesma política do clientes: todos lêem, todos inserem (necessário
-- pro autocomplete criar inline), só admin edita/apaga.

create table if not exists public.motoristas (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  cpf         text,
  cnh         text,
  telefone    text,
  observacoes text,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists motoristas_cpf_uniq
  on public.motoristas (cpf) where cpf is not null;

create index if not exists motoristas_nome_trgm
  on public.motoristas using gin (nome gin_trgm_ops);

drop trigger if exists set_motoristas_updated_at on public.motoristas;
create trigger set_motoristas_updated_at
  before update on public.motoristas
  for each row execute function public.set_updated_at();

create table if not exists public.veiculos (
  id            uuid primary key default gen_random_uuid(),
  placa         text not null,
  modelo        text,
  marca         text,
  capacidade_kg numeric(10,2),
  observacoes   text,
  ativo         boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists veiculos_placa_uniq on public.veiculos (placa);

create index if not exists veiculos_modelo_trgm
  on public.veiculos using gin (modelo gin_trgm_ops);

drop trigger if exists set_veiculos_updated_at on public.veiculos;
create trigger set_veiculos_updated_at
  before update on public.veiculos
  for each row execute function public.set_updated_at();

-- RLS: idem clientes
alter table public.motoristas enable row level security;
alter table public.veiculos    enable row level security;

drop policy if exists motoristas_read on public.motoristas;
create policy motoristas_read on public.motoristas
  for select to authenticated using (true);

drop policy if exists motoristas_insert on public.motoristas;
create policy motoristas_insert on public.motoristas
  for insert to authenticated with check (true);

drop policy if exists motoristas_admin_update on public.motoristas;
create policy motoristas_admin_update on public.motoristas
  for update to authenticated
  using (current_user_role() = 'admin')
  with check (current_user_role() = 'admin');

drop policy if exists motoristas_admin_delete on public.motoristas;
create policy motoristas_admin_delete on public.motoristas
  for delete to authenticated
  using (current_user_role() = 'admin');

drop policy if exists veiculos_read on public.veiculos;
create policy veiculos_read on public.veiculos
  for select to authenticated using (true);

drop policy if exists veiculos_insert on public.veiculos;
create policy veiculos_insert on public.veiculos
  for insert to authenticated with check (true);

drop policy if exists veiculos_admin_update on public.veiculos;
create policy veiculos_admin_update on public.veiculos
  for update to authenticated
  using (current_user_role() = 'admin')
  with check (current_user_role() = 'admin');

drop policy if exists veiculos_admin_delete on public.veiculos;
create policy veiculos_admin_delete on public.veiculos
  for delete to authenticated
  using (current_user_role() = 'admin');
