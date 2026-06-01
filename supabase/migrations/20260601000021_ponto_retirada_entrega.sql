-- 20260601000021_ponto_retirada_entrega.sql — adiciona destino 'entrega'
-- enum NOVO + convert (evita ALTER TYPE ADD VALUE em transação). Enum antigo
-- ponto_retirada_tipo fica órfão (pode ser referenciado por migrations antigas), sem custo.
do $$ begin
  create type ponto_retirada_destino as enum ('loja','deposito','entrega');
exception when duplicate_object then null; end $$;

alter table public.pedido_pontos_retirada alter column tipo drop default;
alter table public.pedido_pontos_retirada
  alter column tipo type ponto_retirada_destino using tipo::text::ponto_retirada_destino;
alter table public.pedido_pontos_retirada alter column tipo set default 'loja'::ponto_retirada_destino;
