# Pedido/Mapa — pagamento, retirada híbrida, logo cliente, mapa compacto — Plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pagamento em dropdown (forma+parcelas estruturados), ponto de retirada com modo Loja/Depósito/Híbrido (destino `entrega`), logo do cliente no PDF e mapa de carregamento compacto (~meia página).

**Architecture:** Migrations aditivas (enums novos + conversão de coluna com USING; coluna `logo_url_print`). Helpers puros de mapeamento de pagamento (texto Hiper→enum) com testes. Form e mapa existentes adaptados. Tabelas `pedidos`/`pedido_pontos_retirada` são two-way no sync; a mesma migração roda no hub local via bootstrap.

**Tech Stack:** Next 16/React 19, react-hook-form + zod, Supabase Postgres, Tailwind v4/shadcn, vitest, .NET (agente, só leitura de pagamento).

**Spec:** `docs/superpowers/specs/2026-06-01-pedido-pagamento-retirada-mapa-design.md`

**Constraints (CLAUDE.md):** migrations via Management API (token desta sessão) — inventariar → dry-run BEGIN/ROLLBACK → aplicar → validar; ≤100 linhas; uma coisa por migration; commitar `.sql` só após aplicar. Enum NOVO + convert (evita `ALTER TYPE ADD VALUE` em transação). Preferir Serena pra TS. Manter 140 testes verdes. Allowlist do `sync_push_upsert` é dinâmica (information_schema) — NÃO mexer. Supabase ref `louaguxcohfeicxxqggw`.

---

## File Structure
- `supabase/migrations/2026060100002x_*.sql` — 3 migrations (pagamento; destino entrega; logo_url_print).
- `lib/parser/forma-pagamento.ts` (novo) — `mapFormaPagamento`, `parseParcelas`, `FORMAS_PAGAMENTO`, rótulos.
- `lib/parser/__tests__/forma-pagamento.test.ts` (novo).
- `lib/validators/pedido.ts` — `forma_pagamento` enum, `parcelas` int, `tipo` +`entrega`.
- `components/pedido-form.tsx` — dropdowns de pagamento + modo de retirada.
- `lib/parser/extrair-pagamento.ts`, `lib/parser/to-form-input.ts`, `lib/pedidos/inserir.ts`, `app/api/ingest/pedido/route.ts` — aplicar helpers na ingestão.
- `components/mapa-carregamento.tsx` — logo do cliente, rótulos Loja/Depósito/Entrega, densificação.
- `app/(print)/imprimir/[id]/page.tsx`, `app/(print)/imprimir/lote/page.tsx`, `app/(app)/{vendas,historico,logistica}/[id]/page.tsx` — passar `logoUrlPrint` ao mapa.
- `public/clientes/franzoni-print.png` (novo asset) + `empresas.logo_url_print` na nuvem.

---

## FASE 1 — Banco (controlador aplica; protocolo CLAUDE.md)

### Task 1.1: Migration — enum de pagamento + conversão das colunas

**Files:** Create `supabase/migrations/20260601000020_pagamento_estruturado.sql`

- [ ] **Step 1: Inventariar** (Management API):
```sql
select column_name, data_type from information_schema.columns
 where table_schema='public' and table_name='pedidos' and column_name in ('forma_pagamento','parcelas');
select distinct forma_pagamento from public.pedidos where forma_pagamento is not null;
select distinct parcelas from public.pedidos where parcelas is not null;
```
Anote os valores reais (pra conferir o mapeamento). Esperado: ambas `text`.

- [ ] **Step 2: Escrever a migration**
```sql
-- 20260601000020_pagamento_estruturado.sql — forma_pagamento/parcelas estruturados
do $$ begin
  create type forma_pagamento_tipo as enum ('credito','pix','debito','dinheiro','boleto');
exception when duplicate_object then null; end $$;

-- forma_pagamento text -> enum (mapeia conhecidos; resto NULL)
alter table public.pedidos
  alter column forma_pagamento type forma_pagamento_tipo
  using (
    case
      when forma_pagamento ilike '%credito%' or forma_pagamento ilike '%crédito%' then 'credito'::forma_pagamento_tipo
      when forma_pagamento ilike '%pix%'     then 'pix'::forma_pagamento_tipo
      when forma_pagamento ilike '%debito%'  or forma_pagamento ilike '%débito%'  then 'debito'::forma_pagamento_tipo
      when forma_pagamento ilike '%dinheiro%' or forma_pagamento ilike '%espécie%' or forma_pagamento ilike '%especie%' then 'dinheiro'::forma_pagamento_tipo
      when forma_pagamento ilike '%boleto%'  then 'boleto'::forma_pagamento_tipo
      else null
    end
  );

-- parcelas text -> smallint (extrai dígitos; clamp 1..12; vazio/0 -> NULL)
alter table public.pedidos
  alter column parcelas type smallint
  using (
    case
      when parcelas ~ '\d+' then least(greatest((regexp_replace(parcelas,'\D','','g'))::int, 1), 12)::smallint
      else null
    end
  );
```

- [ ] **Step 3: Dry-run** `BEGIN; <migration> ROLLBACK;` → esperado sem erro. Se algum valor não-mapeado causar erro, o `else null` cobre; se o regex de parcelas falhar em algum valor, ajuste e repita.

- [ ] **Step 4: Aplicar** (`apply_migration` name `pagamento_estruturado`). Validar:
```sql
select column_name, data_type, udt_name from information_schema.columns
 where table_schema='public' and table_name='pedidos' and column_name in ('forma_pagamento','parcelas');
select forma_pagamento, parcelas, count(*) from public.pedidos group by 1,2;
```
Esperado: `forma_pagamento` udt=`forma_pagamento_tipo`, `parcelas` smallint; valores coerentes.

- [ ] **Step 5: Commit** do `.sql`.

### Task 1.2: Migration — destino `entrega` em pedido_pontos_retirada

**Files:** Create `supabase/migrations/20260601000021_ponto_retirada_entrega.sql`

- [ ] **Step 1: Inventariar**
```sql
select column_default, udt_name from information_schema.columns
 where table_schema='public' and table_name='pedido_pontos_retirada' and column_name='tipo';
select distinct tipo from public.pedido_pontos_retirada;
```
Esperado: udt `ponto_retirada_tipo`, default `'loja'`.

- [ ] **Step 2: Escrever a migration** (enum NOVO + convert; trata o default)
```sql
-- 20260601000021_ponto_retirada_entrega.sql — adiciona destino 'entrega'
do $$ begin
  create type ponto_retirada_destino as enum ('loja','deposito','entrega');
exception when duplicate_object then null; end $$;

alter table public.pedido_pontos_retirada alter column tipo drop default;
alter table public.pedido_pontos_retirada
  alter column tipo type ponto_retirada_destino using tipo::text::ponto_retirada_destino;
alter table public.pedido_pontos_retirada alter column tipo set default 'loja'::ponto_retirada_destino;
```
> Nota: não removemos o enum antigo `ponto_retirada_tipo` (pode estar referenciado em RLS/migrations); fica órfão, sem custo.

- [ ] **Step 3: Dry-run** `BEGIN; ... ROLLBACK;` → sem erro.

- [ ] **Step 4: Aplicar** + validar:
```sql
select udt_name, column_default from information_schema.columns
 where table_name='pedido_pontos_retirada' and column_name='tipo';
-- aceita o novo valor?
begin; insert into public.pedido_pontos_retirada(pedido_id,tipo,empresa_nome)
 select id,'entrega','teste' from public.pedidos limit 1; rollback;
```
Esperado: udt `ponto_retirada_destino`; insert de teste com `entrega` não dá erro (rollback desfaz).

- [ ] **Step 5: Commit** do `.sql`.

### Task 1.3: Migration — empresas.logo_url_print

**Files:** Create `supabase/migrations/20260601000022_empresa_logo_print.sql`

- [ ] **Step 1**: `select column_name from information_schema.columns where table_name='empresas' and column_name='logo_url_print';` → esperado vazio.
- [ ] **Step 2**: migration:
```sql
-- 20260601000022_empresa_logo_print.sql — logo p/ fundo claro (PDF/impressão)
alter table public.empresas add column if not exists logo_url_print text;
```
- [ ] **Step 3**: dry-run → sem erro. **Step 4**: aplicar + `select logo_url_print from empresas limit 1;` (esperado null). **Step 5**: commit.
> `empresas` é tabela `down` (pull `select('*')`) → a coluna desce ao hub sozinha.

---

## FASE 2 — Helpers de pagamento + validator (TDD)

### Task 2.1: `lib/parser/forma-pagamento.ts` (TDD)

**Files:** Create `lib/parser/forma-pagamento.ts` + `lib/parser/__tests__/forma-pagamento.test.ts`

- [ ] **Step 1: Teste que falha**
```ts
// lib/parser/__tests__/forma-pagamento.test.ts
import { describe, it, expect } from 'vitest';
import { mapFormaPagamento, parseParcelas, rotuloFormaPagamento } from '../forma-pagamento';

describe('mapFormaPagamento', () => {
  it('mapeia textos do Hiper para o enum', () => {
    expect(mapFormaPagamento('Cartão de Crédito')).toBe('credito');
    expect(mapFormaPagamento('PIX')).toBe('pix');
    expect(mapFormaPagamento('Débito')).toBe('debito');
    expect(mapFormaPagamento('Dinheiro 1x')).toBe('dinheiro');
    expect(mapFormaPagamento('BOLETO BANCARIO')).toBe('boleto');
  });
  it('não reconhecido vira null', () => {
    expect(mapFormaPagamento('ENTREGA A RECEBER')).toBeNull();
    expect(mapFormaPagamento('')).toBeNull();
    expect(mapFormaPagamento(null)).toBeNull();
  });
});

describe('parseParcelas', () => {
  it('extrai dígitos e faz clamp 1..12', () => {
    expect(parseParcelas('10x')).toBe(10);
    expect(parseParcelas('3')).toBe(3);
    expect(parseParcelas('24x')).toBe(12);   // clamp
    expect(parseParcelas('0')).toBeNull();
    expect(parseParcelas('à vista')).toBeNull();
    expect(parseParcelas(null)).toBeNull();
  });
});

describe('rotuloFormaPagamento', () => {
  it('formata p/ exibição', () => {
    expect(rotuloFormaPagamento('credito', 3)).toBe('Crédito 3x');
    expect(rotuloFormaPagamento('pix', null)).toBe('Pix');
    expect(rotuloFormaPagamento(null, null)).toBe('—');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run lib/parser/__tests__/forma-pagamento.test.ts` → FAIL (módulo inexistente).

- [ ] **Step 3: Implementar**
```ts
// lib/parser/forma-pagamento.ts
export const FORMAS_PAGAMENTO = ['credito', 'pix', 'debito', 'dinheiro', 'boleto'] as const;
export type FormaPagamento = (typeof FORMAS_PAGAMENTO)[number];

/** Só Crédito e Boleto aceitam parcelamento; os demais são 1x. */
export const FORMAS_COM_PARCELAS: ReadonlySet<FormaPagamento> = new Set(['credito', 'boleto']);

const ROTULOS: Record<FormaPagamento, string> = {
  credito: 'Crédito', pix: 'Pix', debito: 'Débito', dinheiro: 'Dinheiro', boleto: 'Boleto',
};

/** Texto livre (PDF do Hiper) → enum; não reconhecido → null. */
export function mapFormaPagamento(raw: string | null | undefined): FormaPagamento | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (s.includes('credito') || s.includes('crédito')) return 'credito';
  if (s.includes('pix')) return 'pix';
  if (s.includes('debito') || s.includes('débito')) return 'debito';
  if (s.includes('dinheiro') || s.includes('especie') || s.includes('espécie')) return 'dinheiro';
  if (s.includes('boleto')) return 'boleto';
  return null;
}

/** Texto livre ("10x") → inteiro 1..12; vazio/0/sem-dígito → null. */
export function parseParcelas(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  const m = String(raw).match(/\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(n, 12);
}

/** Rótulo amigável p/ o mapa: "Crédito 3x", "Pix", "—". */
export function rotuloFormaPagamento(forma: FormaPagamento | null | undefined, parcelas: number | null | undefined): string {
  if (!forma) return '—';
  const base = ROTULOS[forma];
  return FORMAS_COM_PARCELAS.has(forma) && parcelas && parcelas > 1 ? `${base} ${parcelas}x` : base;
}
```

- [ ] **Step 4: Rodar e ver passar** — esperado 3 describes verdes.
- [ ] **Step 5: Commit** `feat(pagamento): helpers mapFormaPagamento/parseParcelas/rotulo`.

### Task 2.2: validator — enum/int + destino entrega

**Files:** Modify `lib/validators/pedido.ts`

- [ ] **Step 1: Atualizar o teste** (se houver teste do schema; senão adicionar um mínimo em `lib/validators/__tests__/pedido.test.ts`):
```ts
import { describe, it, expect } from 'vitest';
import { pedidoFormSchema } from '../pedido';
describe('pedidoFormSchema pagamento/retirada', () => {
  const base = { cliente_nome: 'X', valor_total: 0,
    pontos_retirada: [{ tipo: 'entrega', empresa_nome: '', itens: [] }] };
  it('aceita forma enum, parcelas int e tipo entrega', () => {
    const r = pedidoFormSchema.safeParse({ ...base, forma_pagamento: 'credito', parcelas: 6 });
    expect(r.success).toBe(true);
  });
  it('rejeita forma fora do enum e parcelas > 12', () => {
    expect(pedidoFormSchema.safeParse({ ...base, forma_pagamento: 'cheque' }).success).toBe(false);
    expect(pedidoFormSchema.safeParse({ ...base, parcelas: 99 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Editar `lib/validators/pedido.ts`** (use Serena `replace_symbol_body` ou Edit):
  - Importar/embutir o enum: `import { FORMAS_PAGAMENTO } from '@/lib/parser/forma-pagamento';`
  - Em `pontoRetiradaSchema`: `tipo: z.enum(['loja', 'deposito', 'entrega'])`.
  - Em `pedidoFormSchema`: trocar
    `forma_pagamento: z.string().max(LONG).nullable().optional(),` por
    `forma_pagamento: z.enum(FORMAS_PAGAMENTO).nullable().optional(),`
    e `parcelas: z.string().max(SHORT).nullable().optional(),` por
    `parcelas: z.number().int().min(1).max(12).nullable().optional(),`.

- [ ] **Step 4: Rodar e ver passar** + `npx tsc --noEmit` (pode acusar usos antigos de `parcelas` como string / `forma_pagamento` em outros arquivos — corrija nos arquivos das Fases seguintes; se quebrar aqui, anote e siga, mas a suíte não pode regredir nos testes já existentes). Se `tsc` quebrar em `from-db.ts`/`inserir.ts`, trate na Fase 4 e rode o tsc final lá.
- [ ] **Step 5: Commit** `feat(pedido): schema pagamento enum/int + ponto destino entrega`.

---

## FASE 3 — Form de pedido (dropdowns + modo de retirada)

### Task 3.1: Dropdowns de pagamento

**Files:** Modify `components/pedido-form.tsx` (bloco de pagamento, ~linhas 305-336)

- [ ] **Step 1: Ler o arquivo** inteiro pra casar com o padrão (`Controller`, `register`, componentes `@/components/ui/*`). O bloco atual usa `<Input {...register('forma_pagamento')}>`, um checkbox "ENTREGA A RECEBER" e `<Input {...register('parcelas')}>`.
- [ ] **Step 2: Substituir** por dois selects:
  - **Forma**: um `<select>` (ou `Select` shadcn se já usado no arquivo) com `Controller name="forma_pagamento"`, opções das 5 formas (`FORMAS_PAGAMENTO` + `rotulo`), placeholder "—" (valor null permitido). Remover o checkbox "ENTREGA A RECEBER".
  - **Parcelas**: `Controller name="parcelas"` com opções 1..12 (`valueAsNumber`); `disabled` quando `watch('forma_pagamento')` ∉ {credito, boleto} — nesse caso forçar valor 1 (ou null) via `setValue`. Importar `FORMAS_COM_PARCELAS` de `@/lib/parser/forma-pagamento`.
  - Garantir `setValueAs`/`valueAsNumber` corretos (parcelas é number; '' → null).
- [ ] **Step 3: Verificar** `npx tsc --noEmit` (no escopo do form) e que o form monta. Sem teste unitário de UI; validação visual.
- [ ] **Step 4: Commit** `feat(pedido-form): dropdowns de forma de pagamento e parcelas`.

### Task 3.2: Modo de retirada (Loja/Depósito/Híbrido)

**Files:** Modify `components/pedido-form.tsx` (bloco de pontos, ~linhas 225-283)

- [ ] **Step 1: Adicionar um seletor "Modo de retirada"** acima da lista de pontos, em estado local derivado dos pontos atuais:
  - `modo = pontos.some(p => p.tipo==='entrega') ? 'hibrido' : (pontos[0]?.tipo==='deposito' ? 'deposito' : 'loja')`.
  - Ao trocar o modo:
    - **Loja**: manter 1 ponto `tipo='loja'` com todos os itens (se havia 2 pontos, concentrar itens no primeiro; remover extras). 
    - **Depósito**: idem com `tipo='deposito'`.
    - **Híbrido**: garantir 2 pontos — um de retirada (loja **ou** depósito, sub-seletor) + um `tipo='entrega'`; manter os itens onde já estão (usuário redistribui).
  - Use os helpers do `useFieldArray` (`addPonto`/`removePonto`/`setValue`) já presentes.
- [ ] **Step 2: No `<select>` de tipo por ponto**, adicionar `<option value="entrega">Entrega</option>` (além de loja/deposito). No modo Híbrido, o ponto de entrega usa o endereço do cliente como default em `empresa_nome`/`endereco` (preencher via `setValue` ao criar).
- [ ] **Step 3: Validação leve** — impedir salvar com um ponto usado sem itens (mensagem). Reusar o erro do schema (`pontos_retirada` min 1 já existe).
- [ ] **Step 4: Verificar** tsc + montagem. **Step 5: Commit** `feat(pedido-form): modo de retirada loja/deposito/hibrido (entrega)`.

---

## FASE 4 — Ingestão (aplicar helpers de pagamento)

### Task 4.1: parser → enum/int

**Files:** Modify `lib/parser/extrair-pagamento.ts`, `lib/parser/to-form-input.ts`, `lib/pedidos/inserir.ts`, `app/api/ingest/pedido/route.ts`

- [ ] **Step 1: Ler** os 4 arquivos pra achar onde `forma_pagamento`/`parcelas` (string) são produzidos e gravados. `extrair-pagamento.ts` hoje devolve `{forma_pagamento: string|null, parcelas: string|null}`.
- [ ] **Step 2: Converter na borda de ENTRADA** (o ponto onde o texto do Hiper vira o registro gravado): aplicar `mapFormaPagamento(...)` e `parseParcelas(...)` de `@/lib/parser/forma-pagamento`, de modo que o valor persistido já seja `FormaPagamento|null` e `number|null`. Preferir converter em `to-form-input.ts` (que monta o `PedidoFormInput`) e/ou no `route.ts` de ingestão, conforme o fluxo real. Atualizar tipos de retorno de `extrair-pagamento.ts` se fizer sentido (ou converter no consumidor).
- [ ] **Step 3: Ajustar `lib/pedidos/inserir.ts` e `lib/pedidos/from-db.ts`** pros tipos novos (parcelas number, forma enum). Remover casts/`string` antigos.
- [ ] **Step 4: Rodar a suíte inteira** `npx vitest run` (140+ verdes) e `npx tsc --noEmit` (zero erros — agora todos os usos de pagamento estão coerentes). Corrigir o que o tsc apontar nesses arquivos.
- [ ] **Step 5: Commit** `feat(ingestao): mapeia pagamento do Hiper para enum/int`.

---

## FASE 5 — Mapa (logo cliente + rótulos + compacto)

### Task 5.1: logo do cliente no mapa

**Files:** Modify `components/mapa-carregamento.tsx`; `app/(print)/imprimir/[id]/page.tsx`, `.../lote/page.tsx`, `app/(app)/{vendas,historico,logistica}/[id]/page.tsx`

- [ ] **Step 1: Prop nova** `logoUrlPrint?: string | null` no `MapaCarregamento`. No header (linha ~55), trocar `<AppLogo variant="dark" size={56} />` por: se `logoUrlPrint` → `<img src={logoUrlPrint} alt="" className="h-14 w-auto object-contain" />`; senão `<AppLogo variant="dark" size={56} />` (fallback produto).
- [ ] **Step 2: Cada página que renderiza o mapa** busca a empresa do pedido e passa `logoUrlPrint`. Na print `[id]`: após carregar `pedido`, adicionar `const { data: empresa } = await supabase.from('empresas').select('logo_url_print').eq('id', pedido.empresa_id).maybeSingle();` e `<MapaCarregamento ... logoUrlPrint={empresa?.logo_url_print ?? null} />`. Repetir nas demais (lote: buscar as empresas dos pedidos do lote; vendas/historico/logistica `[id]`). (Confirmar que `pedidos.empresa_id` existe — multitenant; se a página não tiver, buscar via join.)
- [ ] **Step 3: Rótulo de pagamento** no mapa (linha ~108): trocar `forma_pagamento · parcelas` por `rotuloFormaPagamento(pedido.forma_pagamento, pedido.parcelas)` (import de `@/lib/parser/forma-pagamento`).
- [ ] **Step 4: Rótulo do ponto** (linha ~118): mapear `loja→Loja`, `deposito→Depósito`, `entrega→Entrega`; no bloco `entrega` mostrar "Enviar para:" + endereço do cliente.
- [ ] **Step 5: tsc + visual.** **Commit** `feat(mapa): logo do cliente (logo_url_print) + rotulos pagamento/entrega`.

### Task 5.2: densificação (meia página)

**Files:** Modify `components/mapa-carregamento.tsx` (+ CSS de print se houver `globals.css`/classe print)

- [ ] **Step 1: Reduzir** tamanhos: header (`text-lg`→`text-base`), KV labels/values menores, tabela `text-xs`→`text-[10px]` com `py-0.5`, paddings do container (`px-6 py-4`→`px-4 py-2`), gaps. Manter ≥9px no print.
- [ ] **Step 2: Conferir** que 1 pedido típico (≤ ~15 itens) cabe em ~meia página A4 na pré-visualização de impressão; pedido grande transborda normalmente (sem mudar paginação).
- [ ] **Step 3: Commit** `style(mapa): densifica layout (~meia pagina)`.

---

### Task 5.3: Data de entrega em destaque (pedido do cliente)

**Files:** Create `lib/pedidos/entrega.ts` + `lib/pedidos/__tests__/entrega.test.ts`; Modify `components/mapa-carregamento.tsx`

- [ ] **Step 1: Teste que falha**
```ts
// lib/pedidos/__tests__/entrega.test.ts
import { describe, it, expect } from 'vitest';
import { rotuloEntrega } from '../entrega';
const hoje = new Date('2026-06-01T12:00:00');
describe('rotuloEntrega', () => {
  it('hoje / amanhã / atrasado', () => {
    expect(rotuloEntrega('2026-06-01', null, hoje)).toBe('01/06 (hoje)');
    expect(rotuloEntrega('2026-06-02', null, hoje)).toBe('02/06 (amanhã)');
    expect(rotuloEntrega('2026-05-30', null, hoje)).toBe('30/05 (atrasado)');
  });
  it('data distante = só a data, sem dica', () => {
    expect(rotuloEntrega('2026-06-20', null, hoje)).toBe('20/06');
  });
  it('janela início–fim', () => {
    expect(rotuloEntrega('2026-06-02', '2026-06-01', hoje)).toBe('01/06 – 02/06 (amanhã)');
  });
  it('sem data', () => {
    expect(rotuloEntrega(null, null, hoje)).toBe('A definir');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run lib/pedidos/__tests__/entrega.test.ts`.

- [ ] **Step 3: Implementar**
```ts
// lib/pedidos/entrega.ts
import { format, differenceInCalendarDays, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/** Rótulo destacado da entrega: "02/06 (amanhã)", "01/06 – 02/06 (amanhã)", "20/06", "A definir".
 *  `hoje` é injetado p/ testabilidade (sem Date.now interno). */
export function rotuloEntrega(
  dataEntrega: string | null | undefined,
  dataInicio: string | null | undefined,
  hoje: Date,
): string {
  if (!dataEntrega) return 'A definir';
  const fim = parseISO(dataEntrega);
  const base = dataInicio && dataInicio !== dataEntrega
    ? `${format(parseISO(dataInicio), 'dd/MM')} – ${format(fim, 'dd/MM')}`
    : format(fim, 'dd/MM');
  const diff = differenceInCalendarDays(fim, hoje);
  let hint = '';
  if (diff < 0) hint = 'atrasado';
  else if (diff === 0) hint = 'hoje';
  else if (diff === 1) hint = 'amanhã';
  else if (diff <= 6) hint = format(fim, 'EEEE', { locale: ptBR });
  return hint ? `${base} (${hint})` : base;
}
```

- [ ] **Step 4: Rodar e ver passar.**

- [ ] **Step 5: Destacar no mapa** (`components/mapa-carregamento.tsx`): no cabeçalho (perto do `Mapa Nº`),
  adicionar um bloco destacado **"ENTREGAR: {rotuloEntrega(pedido.data_entrega, pedido.data_entrega_inicio, new Date())}"**
  (fonte maior/negrito, cor de destaque). Manter o KV "Emissão" como data da venda. Import de `@/lib/pedidos/entrega`.
  (No componente de print, `new Date()` é aceitável — não é workflow.)

- [ ] **Step 6: Commit** `feat(mapa): destaca data de entrega (hoje/amanha) — pedido do cliente`.

> **Verificação de DADO (Windows, não-bloqueante):** confirmar que a ingestão em uso é a do **agente SQL**
> (HiperRepository já lê `data_previsao_entrega_inicial/_final` → `data_entrega_inicio/data_entrega`); pedidos
> antigos vindos do PDF ficaram com `data_entrega = data_emissao` porque o PDF não traz a previsão. Re-ingerir
> esses pedidos pelo agente, se necessário. O servidor não inventa data (segue `?? null`).

## FASE 6 — Asset + dado da Franzoni

### Task 6.1: logo de impressão da Franzoni

**Files:** Create `public/clientes/franzoni-print.png`; update DB

- [ ] **Step 1: Extrair** a versão escura/colorida do histórico: `git show 6039b87:public/logo-dark.png > public/clientes/franzoni-print.png` (conferir visualmente que é a colorida sobre fundo claro). 
- [ ] **Step 2: Setar na nuvem** (Management API): `update empresas set logo_url_print='/clientes/franzoni-print.png' where slug='franzoni' returning slug, logo_url_print;`
- [ ] **Step 3: Commit** do asset `feat(franzoni): logo de impressao (logo_url_print)`.

---

## Self-Review (cobertura da spec)
- §4.1 pagamento (enum+colunas, validator, form, mapa, ingestão) → Tasks 1.1, 2.1, 2.2, 3.1, 4.1, 5.1 ✓
- §4.2 retirada/híbrido (destino entrega, form modo, mapa rótulo) → Tasks 1.2, 2.2, 3.2, 5.1 ✓
- §4.3 logo PDF (coluna, componente, asset Franzoni) → Tasks 1.3, 5.1, 6.1 ✓
- §4.4 mapa compacto → Task 5.2 ✓
- §4.5 data de entrega em destaque (helper rotuloEntrega + mapa + verificação ingestão) → Task 5.3 ✓
- §5 sync (allowlist dinâmica, hub aplica migração) → notas nas migrations; nada a codar ✓
- §8 testes → Tasks 2.1/2.2 (vitest); migrations validadas; visual manual ✓

**Ordem:** Fase 1 (banco) → 2 (helpers/validator) → 3 (form) → 4 (ingestão) → 5 (mapa) → 6 (asset). Cada fase mantém os 140 testes verdes; o tsc fecha 100% ao fim da Fase 4 (quando todos os usos de pagamento migram de string→enum/int).

> **Hub local:** as migrations 1.1–1.3 rodam no hub no próximo `git pull` + restart do serviço (bootstrap aplica `supabase/migrations/*`). Pedidos com destino `entrega` só sincronizam pro hub após ele aplicar a migração 1.2.
