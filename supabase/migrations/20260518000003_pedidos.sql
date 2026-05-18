-- Migration 03: pedidos + pontos de retirada + itens

create table if not exists public.pedidos (
  id                 uuid primary key default gen_random_uuid(),
  numero_mapa        bigserial unique,                            -- nº sequencial interno (para impressão)
  documento_erp      text,                                        -- ex.: "L4077"
  data_emissao       date,
  data_entrega       date,

  -- dados do cliente (denormalizados — o pedido é o snapshot)
  cliente_codigo     text,
  cliente_nome       text not null default '',
  cliente_cnpj_cpf   text,
  cliente_endereco   text,
  cliente_bairro     text,
  cliente_cidade     text,
  cliente_uf         text,
  cliente_cep        text,
  cliente_telefone   text,

  -- comerciais
  forma_pagamento    text,
  parcelas           text,
  valor_total        numeric(14,2) not null default 0,
  observacoes        text,

  -- gestão
  status             pedido_status not null default 'rascunho',
  storage_pdf_path   text,                                        -- path no bucket pedidos-pdfs
  vendedor_id        uuid references public.profiles(id) on delete set null,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists pedidos_status_idx       on public.pedidos(status);
create index if not exists pedidos_vendedor_idx     on public.pedidos(vendedor_id);
create index if not exists pedidos_data_entrega_idx on public.pedidos(data_entrega);
create index if not exists pedidos_bairro_idx       on public.pedidos(cliente_bairro);
-- busca textual (filtro livre na listagem)
create index if not exists pedidos_search_trgm_idx
  on public.pedidos
  using gin ((coalesce(cliente_nome,'') || ' ' || coalesce(documento_erp,'') || ' ' || coalesce(cliente_bairro,'')) gin_trgm_ops);

drop trigger if exists set_pedidos_updated_at on public.pedidos;
create trigger set_pedidos_updated_at
  before update on public.pedidos
  for each row execute function public.set_updated_at();

create table if not exists public.pedido_pontos_retirada (
  id            uuid primary key default gen_random_uuid(),
  pedido_id     uuid not null references public.pedidos(id) on delete cascade,
  tipo          ponto_retirada_tipo not null default 'loja',
  empresa_nome  text not null default '',
  endereco      text,
  ordem         smallint not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists pontos_pedido_idx on public.pedido_pontos_retirada(pedido_id, ordem);

create table if not exists public.pedido_itens (
  id                  uuid primary key default gen_random_uuid(),
  ponto_retirada_id   uuid not null references public.pedido_pontos_retirada(id) on delete cascade,
  codigo              text not null default '',
  descricao           text not null default '',
  quantidade          numeric(14,3) not null default 0,
  unidade             text not null default 'UN',
  preco_unitario      numeric(14,4) not null default 0,
  desconto            numeric(14,4) not null default 0,
  total               numeric(14,2) not null default 0,
  referencia          text,
  lote                text,
  peso_bruto          numeric(14,3),
  peso_liquido        numeric(14,3),
  endereco_estoque    text,
  ordem               smallint not null default 0,
  created_at          timestamptz not null default now()
);

create index if not exists itens_ponto_idx on public.pedido_itens(ponto_retirada_id, ordem);
