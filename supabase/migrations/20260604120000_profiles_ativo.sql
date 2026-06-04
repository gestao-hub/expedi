-- 20260604120000_profiles_ativo.sql — soft-deactivate de colaborador
-- Colaborador "desativado" tem ativo=false (UI mostra Inativo) + ban no GoTrue
-- (banned_until, que já desce no sync via sync_auth_users). Nunca apagamos o profile
-- (hiper_vendedor_map.vendedor_id é on delete restrict + preserva histórico de pedidos).
alter table public.profiles
  add column if not exists ativo boolean not null default true;
