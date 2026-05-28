-- Migration 14: pedidos.cliente_endereco_id
-- Rastreia qual endereço cadastrado foi usado no pedido. Snapshot continua
-- nos campos cliente_endereco/bairro/cidade/uf/cep/telefone (não muda).

alter table public.pedidos
  add column cliente_endereco_id uuid
  references public.cliente_enderecos(id) on delete set null;

create index pedidos_cliente_endereco_idx
  on public.pedidos (cliente_endereco_id) where cliente_endereco_id is not null;
