-- 00-prelude-helpers.sql
-- PARTE 2 do bootstrap (roda DEPOIS do GoTrue ter criado o schema auth + auth.users).
--
-- Aqui entram as peças do "ambiente Supabase" que NÃO são do GoTrue e que as
-- migrations do app esperam:
--   - helpers auth.uid()/auth.role()/auth.jwt() (lêem request.jwt.claims)
--   - grants de schema public para os roles (PostgREST)
--   - shim de storage (buckets/objects/foldername)
--   - publication supabase_realtime
--
-- Por que aqui e não antes do GoTrue: o GoTrue é dono do schema auth e roda as
-- migrations dele no boot, criando auth.users com TODAS as colunas. Se tentássemos
-- criar auth.users / o schema auth antes, conflitaria com as migrations do GoTrue.
-- Então: GoTrue cria auth -> ESTE arquivo adiciona os helpers por cima.
--
-- Idempotente.

-- ============================================================
-- 1) Grants no schema public para os roles do PostgREST
-- ============================================================
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;

-- ============================================================
-- 2) Helpers auth.* compatíveis com Supabase.
--    O schema auth JÁ existe (criado pelo GoTrue). Só adicionamos as funções.
--    Lêem os claims do JWT que o PostgREST injeta em request.jwt.claims.
--    Em SQL direto / service_role esses settings não existem -> retornam
--    null/anon (o código trata auth.uid() null como "servidor confiável").
-- ============================================================
grant usage on schema auth to anon, authenticated, service_role;

create or replace function auth.uid() returns uuid
  language sql stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid
$$;

create or replace function auth.role() returns text
  language sql stable
as $$
  select coalesce(current_setting('request.jwt.claims', true)::json->>'role', 'anon')
$$;

create or replace function auth.jwt() returns jsonb
  language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  )
$$;

-- ============================================================
-- 3) Schema storage + buckets/objects + foldername()
--    (migration 06 insere bucket e cria policies em storage.objects)
-- ============================================================
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz not null default now()
);

create table if not exists storage.objects (
  id          uuid primary key default gen_random_uuid(),
  bucket_id   text references storage.buckets(id),
  name        text,
  owner       uuid,
  created_at  timestamptz not null default now(),
  metadata    jsonb
);
alter table storage.objects enable row level security;

create or replace function storage.foldername(name text) returns text[]
  language sql immutable
as $$
  select string_to_array(name, '/')
$$;

-- ============================================================
-- 4) Publication supabase_realtime (migration 06 e outras dão ALTER ADD TABLE)
-- ============================================================
do $$ begin
  if not exists (select from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
