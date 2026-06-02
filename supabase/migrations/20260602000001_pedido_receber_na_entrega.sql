-- 20260602000001_pedido_receber_na_entrega.sql
-- "Receber na entrega" é INDEPENDENTE da forma de pagamento: marca que o valor será
-- recebido na entrega (ex.: motorista recebe), enquanto forma_pagamento diz o método
-- (Pix/Dinheiro/...). Um pedido pode ser "receber na entrega em Dinheiro".
-- pedidos é tabela two-way no sync; a coluna entra na allowlist dinâmica do RPC e
-- desce no pull (select *). O hub local aplica esta migration no bootstrap.
alter table public.pedidos
  add column if not exists receber_na_entrega boolean not null default false;
