# Pedido/Mapa — pagamento estruturado, ponto de retirada (híbrido), logo do cliente e mapa compacto (design)

**Data:** 2026-06-01
**Status:** Design aprovado (aguardando revisão da spec)
**Origem:** 4 pedidos do usuário sobre o fluxo de pedido / mapa de carregamento.

---

## 1. Problema / objetivo

Quatro mudanças coesas no fluxo de pedido e no mapa de carregamento (PDF):

1. **Logo do cliente no PDF** — hoje o mapa usa a logo do produto (`AppLogo`); deve usar a do cliente (white-label).
2. **Mapa compacto** — as mesmas informações devem ocupar ~metade da página (1 pedido por folha, mais denso).
3. **Pagamento em dropdown** — sem texto livre: forma de pagamento e número de parcelas viram dropdowns.
4. **Ponto de retirada com híbrido** — Loja / Depósito / Híbrido (parte o cliente retira, parte é enviada/entregue).
5. **Data de entrega visível no mapa** (pedido do cliente Franzoni) — o mapa deve mostrar claramente **a data de
   ENTREGA** ("pra quando entregar": hoje/amanhã/data), não só a data da venda. Hoje o campo "Entrega" existe mas
   é discreto e, em pedidos vindos do PDF, `data_entrega` ficou igual à `data_emissao` (a previsão de entrega do
   Hiper não vem no PDF). Capturar a previsão real e destacá-la.

## 2. Estado atual (verificado)

- `pedidos.forma_pagamento text` + `pedidos.parcelas text` — **texto livre**. Preenchidos no form de
  pedido E pela ingestão do Hiper (parser do PDF traz valores variados: "Dinheiro", "ENTREGA A RECEBER", etc.).
- `pedido_pontos_retirada.tipo` é o enum `ponto_retirada_tipo = ('loja','deposito')`. Um pedido tem 1–5
  pontos; `pedido_itens` pertence a um ponto. Logo, **dividir itens entre destinos já é suportado**.
- `components/mapa-carregamento.tsx` = o componente de impressão/PDF. Usa `<AppLogo variant="dark">`,
  renderiza header + bloco do cliente + uma seção por ponto (tabela de itens), com `print-break-before`
  entre pontos. Mostra pagamento como `forma_pagamento · parcelas`.
- `lib/validators/pedido.ts` = schema zod do form (`pedidoFormSchema`, `pontoRetiradaSchema`, `itemSchema`).
- `empresas.logo_url` existe, mas é a versão **clara** (p/ sidebar escura) — some em fundo branco.
- `pedidos` e `pedido_pontos_retirada` são tabelas **two-way** no sync (`lib/sync/tables.ts`); o push usa
  RPC `sync_push_upsert` com **allowlist de colunas**. `empresas` é tabela **down** (pull `select('*')`).

## 3. Decisões (brainstorming)

| Tema | Decisão |
|------|---------|
| Formas de pagamento | enum `credito, pix, debito, dinheiro, boleto` (dropdown) |
| Parcelas | dropdown **1x–12x**, habilitado só p/ **Crédito** e **Boleto**; demais = 1x à vista |
| Ingestão Hiper | mapeia texto→enum best-effort; não reconhecido → vazio (operador escolhe). Parcelas = extrai dígitos |
| Dados antigos | migração mapeia o que der; não-mapeável → nulo |
| Ponto de retirada | adicionar destino **`entrega`**; modo no form: **Loja / Depósito / Híbrido** |
| Híbrido | 2 blocos: retirada (loja/depósito) + Entrega; itens divididos (reusa pontos+itens existentes) |
| Logo PDF | nova coluna `empresas.logo_url_print` (escura/colorida p/ fundo branco); fallback `AppLogo` |
| Mapa compacto | densificar `mapa-carregamento.tsx` (fontes/paddings menores); 1 por folha, ~meia altura |

## 4. Componentes e mudanças

### 4.1 Pagamento estruturado
- **Banco:** novo enum `forma_pagamento_tipo`. Converter `pedidos.forma_pagamento text → forma_pagamento_tipo`
  com `USING` que mapeia valores conhecidos (lower/ilike: contém 'credito'/'crédito'→credito, 'pix'→pix,
  'debito'/'débito'→debito, 'dinheiro'→dinheiro, 'boleto'→boleto; senão NULL). Converter `parcelas text →
  smallint` (extrair dígitos via regex; vazio→NULL). Ambas colunas continuam nullable.
  - Criar enum NOVO (não estende existente) → evita o gotcha de `ALTER TYPE ADD VALUE` em transação.
  - Conversão de coluna com `USING` roda em transação normalmente (ok no dry-run).
- **Validator (`lib/validators/pedido.ts`):** `forma_pagamento: z.enum([...]).nullable().optional()`;
  `parcelas: z.number().int().min(1).max(12).nullable().optional()`.
- **Form (app de vendas, novo pedido/edição):** dois `Select` (shadcn). Forma → as 5 opções. Parcelas →
  1..12, `disabled` quando forma ∉ {credito, boleto} (e nesses casos força 1).
- **Mapa:** renderizar rótulo amigável (`Crédito 3x`, `Pix`, `Dinheiro`, `Boleto 6x`).
- **Ingestão (`agent`/`lib/parser`):** helper `mapFormaPagamento(raw): enum|null` + `parseParcelas(raw): int|null`
  aplicados no ponto onde hoje gravam o texto. Best-effort; não-reconhecido → null.

### 4.2 Ponto de retirada / híbrido
- **Banco:** adicionar destino `entrega` ao domínio de `pedido_pontos_retirada.tipo`. Implementação segura
  (evitar `ALTER TYPE ADD VALUE` em transação): **migrar a coluna p/ um enum novo** `ponto_retirada_destino
  = ('loja','deposito','entrega')` via `USING tipo::text::ponto_retirada_destino`, ou aplicar `ADD VALUE`
  fora de transação. O plano decide; preferência por enum novo + convert (testável no dry-run).
- **Validator:** `pontoRetiradaSchema.tipo: z.enum(['loja','deposito','entrega'])`. O form deriva os pontos
  do "modo de retirada".
- **Form:** seletor **Modo de retirada** (Loja / Depósito / Híbrido):
  - Loja → 1 ponto `loja` com todos os itens.
  - Depósito → 1 ponto `deposito` com todos os itens.
  - Híbrido → 2 blocos: um ponto de retirada (escolhe loja **ou** depósito) + um ponto `entrega`; o usuário
    distribui os itens entre os dois (UI de pontos+itens já existente). O bloco `entrega` usa o endereço do
    cliente por padrão (editável).
  - O "modo" não precisa de coluna nova: é **derivado** dos tipos dos pontos (loja só → Loja; deposito só →
    Depósito; tem `entrega` → Híbrido). O form mantém o modo em estado local pra orquestrar a UI.
- **Mapa:** título de cada bloco = `Loja` / `Depósito` / `Entrega`. Bloco `entrega` destaca "Enviar para:" +
  endereço.

### 4.3 Logo do cliente no PDF
- **Banco:** `alter table empresas add column logo_url_print text` (down table → sincroniza sozinho).
- **Componente de logo p/ fundo claro:** o `mapa-carregamento.tsx` recebe a empresa (ou `logoUrlPrint`) e
  renderiza `<img src={logo_url_print}>` quando houver; senão `<AppLogo variant="dark">` (produto).
- **Asset Franzoni:** extrair a versão escura/colorida (commit `6039b87`, `public/logo-dark.png` da época)
  → `public/clientes/franzoni-print.png`; setar `empresas.logo_url_print='/clientes/franzoni-print.png'`.
- Quem passa a empresa pro componente do mapa: a página que renderiza o mapa/PDF já carrega o pedido;
  adicionar o fetch da empresa (logo_url_print) e passar como prop.

### 4.4 Mapa compacto
- Densificar `mapa-carregamento.tsx`: reduzir tamanhos de fonte (header, KV, tabela), paddings das células,
  margens; manter legibilidade (mín. 9–10px no print). Ajustar o CSS de print pra ocupar ~meia página com
  1 pedido. Sem mudar paginação (pedido grande transborda normalmente).

### 4.5 Data de entrega em destaque no mapa
- **Exibição (mapa):** elevar a data de entrega de um KV discreto para um item **destacado** no cabeçalho
  do mapa (ex.: "ENTREGAR: 02/06 (amanhã)"), com dica relativa **Hoje / Amanhã / dia-da-semana** calculada
  de `data_entrega` (e a janela `data_entrega_inicio – data_entrega` quando houver). Função pura
  `rotuloEntrega(data_entrega, data_entrega_inicio, hoje)` testável.
- **Dado (ingestão):** o agente SQL já mapeia `data_previsao_entrega_inicial/_final → data_entrega_inicio/
  data_entrega` (HiperRepository/PayloadBuilder — verificado). O gap é que pedidos ingeridos pelo **PDF**
  ficaram com `data_entrega = data_emissao` (o PDF não traz previsão). Ação: confirmar no Windows que a
  ingestão em uso é a do **agente SQL** (que tem a previsão) e re-ingerir/ajustar pedidos antigos se
  necessário; não inventar data no servidor (segue `?? null`). Sem mudança de schema (campos já existem).

## 5. Impacto no sync
- `pedidos`: colunas `forma_pagamento`/`parcelas` mudam de TIPO mas mantêm o **nome** → continuam na allowlist
  do `sync_push_upsert` (verificar que estão lá). O merge campo-a-campo segue igual.
- `pedido_pontos_retirada.tipo`: nome de coluna inalterado; novo valor de domínio. Confirmar que o hub local
  aplica a mesma migração (bootstrap aplica `supabase/migrations/*`).
- `empresas.logo_url_print`: coluna nova em tabela `down` → desce via `select('*')`. Sem allowlist a mudar.
- O hub local recebe as migrations no próximo start (git pull + restart) — mesmo schema nos dois lados.

## 6. Tratamento de erro / borda
- Pagamento não reconhecido na ingestão → null (não quebra ingestão). Form exige forma ao salvar? Não —
  permanece opcional (pedido pode não ter pagamento definido), mas o dropdown não aceita texto livre.
- Híbrido sem itens em um dos blocos → validação do form pede ao menos 1 item por bloco usado (ou bloquear
  salvar com bloco vazio). Loja/Depósito puro = 1 ponto (schema já exige ≥1 ponto).
- Logo de impressão ausente → fallback `AppLogo` (nunca quebra o PDF).

## 7. Escopo / não-objetivos
**No escopo:** as 4 mudanças acima (banco + validator + form + mapa + ingestão de pagamento) e o asset/coluna
de logo de impressão da Franzoni.
**Fora do escopo:** logo do cliente no login/sidebar (já resolvido); roteirização/cálculo de frete da entrega;
escolha de transportadora; mudar o parser do Hiper além do mapa de pagamento; impressão A5/2-por-folha.

## 8. Testes
- vitest: `mapFormaPagamento`/`parseParcelas` (vários textos do Hiper → enum/null e int/null); schema do form
  (forma enum, parcelas 1..12, tipos de ponto incl. `entrega`); derivação do modo de retirada a partir dos
  pontos. Manter os 140 testes verdes.
- Migrations: dry-run BEGIN/ROLLBACK (conversões com USING); validação de contagem/valores após aplicar.
- Visual/impressão (manual, e no Windows se quiser): mapa compacto + logo do cliente + blocos Loja/Depósito/Entrega.

## 9. Decomposição sugerida (para o plano)
1. **Banco:** enum pagamento + conversão colunas; destino `entrega`; `empresas.logo_url_print`.
2. **Validator + helpers de pagamento** (`mapFormaPagamento`/`parseParcelas`) + testes.
3. **Form de pedido:** dropdowns de pagamento + modo de retirada (loja/depósito/híbrido com entrega).
4. **Ingestão:** aplicar os helpers de pagamento no agente/parser.
5. **Mapa:** logo do cliente (logo_url_print) + rótulos Loja/Depósito/Entrega + densificação (meia página).
6. **Asset/dado Franzoni:** `public/clientes/franzoni-print.png` + `logo_url_print` na nuvem.
7. **Data de entrega em destaque:** `rotuloEntrega` (helper + teste) + destaque no cabeçalho do mapa; verificar
   ingestão da previsão no Windows.

Referências: `components/mapa-carregamento.tsx`, `lib/validators/pedido.ts`,
`supabase/migrations/20260518000003_pedidos.sql`, `supabase/migrations/20260518000001_extensions_enums.sql`,
`lib/sync/tables.ts`, `memory/hiper-schema-local.md` (pagamento vem do PDF).
