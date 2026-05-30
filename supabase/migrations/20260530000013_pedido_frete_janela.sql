-- 20260530000013_pedido_frete_janela.sql — #4: frete + janela de entrega no pedido
-- Colunas confirmadas no Hiper (pedido_venda.valor_frete, data_previsao_entrega_inicial/_final).
-- pedidos.data_entrega já guarda o FIM da janela; adicionamos o INÍCIO + o frete.
alter table public.pedidos
  add column if not exists valor_frete numeric not null default 0,
  add column if not exists data_entrega_inicio date;
