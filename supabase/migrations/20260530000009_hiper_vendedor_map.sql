-- 20260530000009_hiper_vendedor_map.sql
-- Mapeia o vendedor do Hiper (id_usuario_vendedor) -> vendedor Franzoni, POR EMPRESA.
create table if not exists public.hiper_vendedor_map (
  empresa_id         uuid not null references public.empresas(id) on delete cascade,
  hiper_usuario_id   integer not null,
  hiper_usuario_nome text,
  vendedor_id        uuid not null references public.profiles(id) on delete restrict,
  created_at         timestamptz not null default now(),
  primary key (empresa_id, hiper_usuario_id)
);

alter table public.hiper_vendedor_map enable row level security;

-- Leitura: admin da empresa (ou platform admin). Escrita: platform admin.
-- O endpoint de ingestão usa service_role e ignora RLS.
drop policy if exists hiper_vendedor_map_read on public.hiper_vendedor_map;
create policy hiper_vendedor_map_read on public.hiper_vendedor_map for select to authenticated using (
  public.is_platform_admin()
  or (empresa_id = public.current_empresa_id() and public.current_user_role() = 'admin')
);
drop policy if exists hiper_vendedor_map_platform_write on public.hiper_vendedor_map;
create policy hiper_vendedor_map_platform_write on public.hiper_vendedor_map for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
