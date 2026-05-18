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
