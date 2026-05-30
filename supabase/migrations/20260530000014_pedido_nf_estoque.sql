-- 20260530000014_pedido_nf_estoque.sql — #3 NF-e + #5 estoque
-- NF-e no cabeçalho do pedido (Hiper: pedido_venda → operacao_pdv → nota_fiscal).
alter table public.pedidos
  add column if not exists nf_numero    text,
  add column if not exists nf_chave     text,
  add column if not exists nf_emitida_em timestamptz,
  add column if not exists nf_valor     numeric;

-- Estoque: snapshot do saldo no Hiper no momento da ingestão, por item.
alter table public.pedido_itens
  add column if not exists saldo_estoque numeric;
