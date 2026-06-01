# Exped Sincronizador — local ⇄ nuvem (sub-projeto 3)

**Data:** 2026-06-01
**Status:** Design aprovado (aguardando revisão da spec)
**Depende de:** sub-projeto 1 (runtime local, PR #19) e 2 (hub Windows validado, PRs #20–#23).
**Spec mãe:** `docs/superpowers/specs/2026-05-31-expedi-local-offline-design.md`.

---

## 1. Objetivo

Ligar o hub local (hoje uma "ilha") à nuvem: subir o que a equipe faz offline e baixar o que muda
na nuvem, de forma **confiável** (nada some, nada duplica). Inclui **merge por campo** (edições
concorrentes no mesmo registro se combinam) e **multi-site** (um cliente com várias lojas, cada uma
com seu hub, convergindo pela nuvem). É a última peça pra o offline ficar completo e pra os **dados
reais do ERP** entrarem no banco local.

## 2. Decisões (brainstorming)

| Tema | Decisão |
|------|---------|
| Login local | **Mesmo login da nuvem** — usuários sincronizados nuvem→local (inclui hash de senha) |
| Quem manda no dado | **Dia-a-dia**: bidirecional. **Cadastros/config**: só nuvem→local |
| Conflito | **Campo-a-campo** (per-coluna last-write-wins), não registro inteiro |
| Multi-site | **Sim** — nuvem é o ponto de convergência (multi-master via central) |
| Onde roda | Peça supervisionada pelo **maestro**; ciclo ~10s quando online |
| Transporte | **Deltas por `updated_at` + cursor**, via **API de sync na nuvem** (token de dispositivo, escopo por empresa) |
| Hiper | **Nunca** escreve de volta (mantido da spec mãe) |

## 3. Arquitetura

```
LOJA A (hub local)  ─push/pull─┐
LOJA B (hub local)  ─push/pull─┤→  [API de sync na nuvem]  →  Banco nuvem (canônico + MERGE por campo)
(cada hub: ciclo ~10s)         ┘        (autentica device token, escopa empresa)
```

- **A nuvem é a autoridade de merge.** Cada hub **envia** suas linhas alteradas (com carimbo por
  campo) → a API faz o **merge campo-a-campo** contra a linha canônica → grava o resultado →
  devolve os deltas canônicos. O hub **baixa** o canônico e aplica local. Toda a lógica de conflito
  vive **num lugar só** (a nuvem) — evita divergência entre lojas.
- Ciclo do hub: **push** pendências → **pull** deltas desde o cursor → aplica. Sem internet: acumula
  na fila; reconectou: esvazia.

## 4. Tabelas e direção

- **Bidirecional (merge por campo):** `pedidos`, `pedido_pontos_retirada`, `pedido_itens`,
  `ordens_servico`, `os_itens`, `os_servicos`, `clientes`, `os_notificacoes`.
- **Só desce (nuvem→local, sobrescreve):** `empresas` (white-label/config/notif), `profiles`
  (roles), `auth.users` (login+hash), `hiper_vendedor_map`, `dispositivos`.
- **Escopo:** cada hub sincroniza **apenas as linhas da sua empresa** (a API força isso pelo token).

## 5. Detecção de mudança + cursor + fila

- Cada tabela sincronizada tem `updated_at` (com trigger) e o hub guarda um **cursor por tabela**
  (maior `updated_at` já trazido/enviado), persistido no banco local.
- **Push:** linhas locais com `updated_at` > cursor-push → enviadas em lote.
- **Pull:** API devolve linhas canônicas com `updated_at` > cursor-pull.
- **Fila offline:** as mudanças locais já ficam marcadas pelo `updated_at`; o "esvaziar" é o próximo
  push bem-sucedido. Cursores só avançam após confirmação do lote (atômico).

## 6. Conflito campo-a-campo

- Cada tabela bidirecional ganha `field_updated_at jsonb` (default `{}`). Um **trigger** BEFORE
  INSERT/UPDATE grava `field_updated_at[coluna] = now()` para cada coluna que mudou.
- **Merge (na nuvem):** para cada coluna, fica o valor do lado com `field_updated_at[coluna]` mais
  recente; `field_updated_at` resultante = máximo por coluna. Resultado: edições em campos
  diferentes do mesmo registro **coexistem**.
- **Clock skew (risco):** comparar carimbos entre sites exige relógios ~sincronizados (NTP). Mitigação:
  hubs sincronizam hora via NTP; a nuvem pode "ancorar" o carimbo do lado servidor no recebimento
  pra reduzir deriva. Documentar como requisito operacional.

## 7. Multi-site (multi-master via nuvem)

- Cada hub tem um **id de site/dispositivo** (já temos `dispositivos`). Vários hubs da mesma empresa
  fazem push/pull independentes; a **nuvem converge** com o merge por campo.
- **Listas-filhas (itens/serviços/pontos):** cada filho tem **PK estável (uuid)** + `field_updated_at`;
  são mergeados **linha a linha** (não "apaga tudo e reinsere"). **Mudança necessária no app:** a
  edição de agregado (pedido/OS) passa a **atualizar filhos in-place + soft-delete** (`deleted_at`)
  dos removidos, em vez de delete+reinsert — senão a identidade se perde no multi-site.
- **Soft-delete:** tabelas sincronizadas usam `deleted_at` (ou `status='cancelado'` onde já existe)
  pra propagar remoções como delta (hard delete não vira delta detectável).

## 8. Carga inicial (cold start)

No 1º ciclo com internet, o hub faz um **pull completo** (snapshot) das tabelas da empresa via a API
de sync (paginado), populando o banco local — é aqui que os **dados reais do ERP** entram. Depois,
só deltas. Requer internet **uma vez** (consistente com a spec mãe).

## 9. Resiliência / idempotência (o ponto crítico)

- **Lotes idempotentes:** cada upsert por PK + `field_updated_at`; reaplicar um lote não duplica nem
  corrompe. Cursor só avança após o lote confirmar.
- **Queda no meio:** retoma do último cursor confirmado; no pior caso, reenvia/rebaixa um lote já
  aplicado (idempotente → seguro).
- **Agregados:** pai + filhos do mesmo agregado vão **no mesmo lote** (consistência).
- **Observabilidade:** o `/status` do maestro mostra último sync ok, pendências na fila, e erros.

## 10. Pré-requisitos de schema (migração)

- `updated_at timestamptz` + trigger `set_updated_at` em TODA tabela bidirecional que não tiver.
- `field_updated_at jsonb not null default '{}'` + trigger de carimbo por coluna nas bidirecionais.
- `deleted_at timestamptz` onde a remoção precisa virar delta (ou usar `status='cancelado'`).
- Aplicadas via `supabase/migrations/` (protocolo: dry-run BEGIN/ROLLBACK, ≤100 linhas por migração,
  validação entre etapas) **na nuvem** e replicadas no bootstrap local (já roda as migrations).

## 11. Segurança

- **API de sync** (`/api/sync/pull`, `/api/sync/push`) autenticada pelo **token de dispositivo**
  (hash em `dispositivos`); o servidor **escopa toda query/escrita na `empresa_id` daquele
  dispositivo** (service_role no servidor, RLS-equivalente forçado em código). O hub nunca recebe
  dado de outra empresa nem chave que enxergue tudo.
- Tabelas "só descem" são **read-only** pro hub (a API recusa push nelas).
- Rate-limit/limite de lote por request.

## 12. Escopo / Não-objetivos

**No escopo:** sync bidirecional do dia-a-dia, merge por campo, multi-site (convergência via nuvem),
sync nuvem→local de login/config, carga inicial, resiliência/idempotência, observabilidade no maestro.

**Fora do escopo:** escrever no Hiper; sync hub-a-hub direto (sempre via nuvem); resolução semântica
de conflito além de campo-a-campo por timestamp (ex.: merge de texto livre).

## 13. Riscos

- **Bug de sync = dado some/duplica** — maior risco do programa todo. Mitigar: idempotência por PK,
  testes pesados de cenário (conflito por campo, 3 sites, queda no meio, fila acumulada, agregado
  parcial, soft-delete), e **piloto com 1 cliente** antes de liberar.
- **Mudar a edição de agregado** (in-place + soft-delete) toca código já em produção (vendas/OS) —
  precisa de testes de regressão.
- **Clock skew** entre sites (item 6).
- **Custo/risco maior** por 1+2 (merge por campo + multi-site) vs. o sync simples — assumido.

## 14. Decomposição (para o plano de implementação)

1. **Migração de schema:** `updated_at`/`field_updated_at`/`deleted_at` + triggers (nuvem + local).
2. **Edição de agregado in-place + soft-delete** (vendas/OS) — substitui delete+reinsert; com testes de regressão.
3. **API de sync na nuvem** (`/pull`, `/push`) — auth device token, escopo empresa, merge campo-a-campo central, paginação.
4. **Cliente sincronizador no hub** (peça do maestro): cursores, push/pull, aplicar, fila, /status.
5. **Carga inicial** (snapshot paginado) + sync nuvem→local de login/config.
6. **Testes de cenário pesados** + **piloto** (1 cliente) com simulação de queda/conflito/multi-site.

Cada item é uma fatia testável. O sub-projeto entrega o **offline completo**: hub local + nuvem
convergindo, com merge por campo e suporte a múltiplas lojas.
