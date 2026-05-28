-- Migration 13: tabela cliente_enderecos
-- Cada cliente (PF ou PJ, chave: cnpj_cpf) pode ter múltiplos endereços de
-- entrega. Um endereço pode ser marcado como padrão. Seed inicial copia
-- clientes.*_padrao como "Principal" pra preservar o que já existia.

create table public.cliente_enderecos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  rotulo text not null,
  endereco text,
  bairro text,
  cidade text,
  uf text,
  cep text,
  telefone text,
  is_padrao boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- no máx 1 endereço padrão por cliente
create unique index cliente_enderecos_padrao_uniq
  on public.cliente_enderecos (cliente_id) where is_padrao = true;

create index cliente_enderecos_cliente_idx
  on public.cliente_enderecos (cliente_id);

-- seed: copia clientes.*_padrao
insert into public.cliente_enderecos
  (cliente_id, rotulo, endereco, bairro, cidade, uf, cep, telefone, is_padrao)
select id, 'Principal', endereco_padrao, bairro_padrao, cidade_padrao,
       uf_padrao, cep_padrao, telefone_padrao, true
from public.clientes
where coalesce(endereco_padrao, bairro_padrao, cidade_padrao, cep_padrao) is not null;

-- RLS: SELECT/INSERT pra qualquer autenticado; UPDATE/DELETE só admin
alter table public.cliente_enderecos enable row level security;

create policy enderecos_read on public.cliente_enderecos
  for select using (auth.uid() is not null);

create policy enderecos_insert on public.cliente_enderecos
  for insert with check (auth.uid() is not null);

create policy enderecos_update on public.cliente_enderecos
  for update using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

create policy enderecos_delete on public.cliente_enderecos
  for delete using (public.current_user_role() = 'admin');

-- trigger updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists cliente_enderecos_updated_at on public.cliente_enderecos;
create trigger cliente_enderecos_updated_at
  before update on public.cliente_enderecos
  for each row execute function public.set_updated_at();
