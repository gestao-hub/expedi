-- 00-roles-ext.sql
-- PARTE 1 do bootstrap (roda ANTES do GoTrue).
--
-- Cria apenas o que o GoTrue precisa para subir e rodar as MIGRATIONS DELE:
--   - extensões usadas pelo app e por uuid/crypto
--   - roles do Supabase (anon/authenticated/service_role/authenticator)
--   - supabase_auth_admin (DONO do schema auth — o GoTrue cria auth.users etc.)
--
-- NÃO cria o schema auth nem auth.users: isso é responsabilidade do GoTrue
-- (`auth migrate`), igual ao Supabase real. Os helpers auth.uid()/role()/jwt(),
-- grants e o shim de storage entram DEPOIS, em 00-prelude-helpers.sql.
--
-- Idempotente.

-- ============================================================
-- 1) Extensões
-- ============================================================
create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "pg_trgm";     -- busca textual
create extension if not exists "unaccent";    -- normaliza acentos

-- ============================================================
-- 2) Roles do Supabase
--    PostgREST loga como 'authenticator' e troca de role via SET ROLE.
-- ============================================================
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticator') then
    create role authenticator login password 'authpass' noinherit;
  end if;
end $$;

grant anon          to authenticator;
grant authenticated to authenticator;
grant service_role  to authenticator;

-- ============================================================
-- 3) supabase_auth_admin — dono do schema auth (igual ao Supabase real).
--    O GoTrue conecta com esse usuário e cria/roda as migrations do auth.
--    Precisa poder CREATE SCHEMA no banco do app.
-- ============================================================
do $$ begin
  if not exists (select from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin login password 'authpass' createrole noinherit;
  end if;
end $$;

-- Permite ao GoTrue criar objetos no banco corrente.
grant create on database exped to supabase_auth_admin;

-- IMPORTANTE: o GoTrue NÃO cria o schema auth — ele assume que já existe
-- (com search_path=auth) e cria as tabelas DENTRO dele. Em Postgres puro o
-- schema não existe, então o migrator falha com "no schema has been selected
-- to create in (SQLSTATE 3F000)". Criamos o schema VAZIO aqui, dono =
-- supabase_auth_admin (igual ao Supabase real); o GoTrue popula auth.users etc.
create schema if not exists auth authorization supabase_auth_admin;

-- O GoTrue também precisa enxergar/usar pgcrypto (gen_random_uuid em auth.users).
-- pgcrypto fica em public por padrão neste cluster nativo.
grant usage on schema public to supabase_auth_admin;
