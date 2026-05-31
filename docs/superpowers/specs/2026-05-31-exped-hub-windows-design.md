# Exped Hub Windows — Empacotamento do runtime local (sub-projeto 2)

**Data:** 2026-05-31
**Status:** Design aprovado (aguardando revisão da spec)
**Depende de:** sub-projeto 1 (runtime local / Jeito A) — CONCLUÍDO, veredito GO (PR #19).
**Spec mãe:** `docs/superpowers/specs/2026-05-31-expedi-local-offline-design.md` (o conteúdo já é "Exped").

---

## 1. Objetivo

Empacotar o "hub local" (validado no Linux no sub-projeto 1) num **instalador único pro Windows**,
sem Docker, que sobe a pilha Supabase nativa + o app Exped + storage local, gerenciada por **um
único serviço** (o "maestro"), com **auto-atualização** segura. Ao final, a equipe do cliente
acessa o Exped local pela rede, com ou sem internet. (A **sincronização** com a nuvem é o
sub-projeto 3 — aqui o hub funciona sozinho.)

## 2. Decisões (brainstorming)

| Tema | Decisão |
|------|---------|
| Orquestração | **Jeito 2 — maestro único**: 1 serviço Windows (Node) sobe/vigia todas as peças |
| PDFs offline | **SIM** — incluir um **storage local** (filesystem) com a API `/storage/v1` |
| Atualizações | **Auto-update** com troca atômica + **rollback** se a nova versão não passar no health check |
| Máquina de teste | Windows disponível — execução em colaboração (eu produzo artefatos; usuário roda e reporta) |
| Instalador | **Inno Setup** (como o do agente) — instala arquivos + registra o serviço do maestro |

## 3. Componentes instalados (ex.: `C:\Exped\`)

- **Node portátil** (runtime pro app + maestro + gateway + storage).
- **Postgres portátil** (win-x64, zip/embedded — sem instalar serviço próprio do Postgres).
- **PostgREST.exe** (win-x64) + **GoTrue.exe** (win-x64; ver Risco 9.1).
- **App Exped** já buildado (`next build` standalone) + Node.
- **gateway** (`gateway.mjs` do sub-projeto 1) + **storage-local** (novo).
- **maestro** (novo) — registrado como o único serviço Windows (auto-start no boot).
- Pasta de **dados**: cluster Postgres, PDFs do storage, logs, estado de versão.

## 4. O maestro (responsabilidades)

Programa Node, único serviço Windows. Ao iniciar:
1. **Sobe o Postgres** (cluster em pasta de dados própria); espera ficar pronto.
2. **Bootstrap idempotente** do banco (só na 1ª vez ou em `--reset`): cria DB → roles/extensões/schema auth → `GoTrue migrate` → helpers/grants/storage shim → migrations do app. (Mesma ordem validada no spike.)
3. **Sobe** PostgREST, GoTrue (serve), gateway (1 URL), storage-local; por fim o **app** (`node server.js` do build standalone).
4. **Supervisão:** health check de cada peça antes de liberar o app; reinicia peça que cair (backoff); logs unificados em `C:\Exped\logs\`.
5. **Auto-update** (ver §6).
6. Expõe um endpoint local de status (`http://127.0.0.1:<porta>/status`) pra diagnóstico.

Boundaries: o maestro NÃO contém regra de negócio — só orquestra processos. Cada peça é um processo isolado com interface clara (porta/health).

## 5. Storage local (PDFs offline)

Serviço Node pequeno que implementa o subconjunto da API `/storage/v1` que o app usa:
- **upload** (`POST /storage/v1/object/<bucket>/<path>`) → grava em `C:\Exped\data\storage\<bucket>\<path>`.
- **download** (`GET .../object/...` e/ou signed URL) → serve o arquivo local.
- **(o que o app precisar)** — auditar `lib/supabase/*` + usos de `.storage.from(` pra cobrir exatamente as chamadas reais (upload de PDF de pedido/OS, geração de URL). YAGNI: implementar só o que é chamado.
- O gateway roteia `/storage/v1/*` pra este serviço (no spike era stub 501).
- Marca cada arquivo novo como "pendente de sync" (o sub-projeto 3 sobe pra nuvem).

## 6. Auto-atualização (segura)

- O maestro consulta periodicamente um **manifesto de versão** na nuvem (ex.: endpoint que devolve `{ versao, url_do_pacote, sha256 }`). Reusa o padrão do `/api/agent/version` já existente.
- Se a versão for mais nova: baixa o pacote, **verifica o sha256**, extrai numa pasta `releases/<versao>`.
- **Troca atômica:** atualiza um ponteiro `current` → nova versão; reinicia as peças.
- **Health check pós-troca:** se as peças não subirem saudáveis em X s, **rollback** automático pro `current` anterior. Uma atualização ruim nunca deixa o cliente no chão.
- Janela: idealmente fora do horário de pico (configurável); update do schema (migrations novas) roda no bootstrap da nova versão.

## 7. Instalador (Inno Setup)

- Um `.exe` "avançar → concluir". Copia a pasta `C:\Exped\`, registra o serviço do maestro (auto-start), abre as portas locais necessárias no firewall pra LAN, e dispara o 1º bootstrap.
- Parâmetros do cliente (ex.: empresa/identificação, secret do JWT local) gerados na instalação ou vindos de um arquivo de config entregue pelo operador.
- Desinstalador remove serviço + arquivos (opção de preservar dados).

## 8. Testes e handoff (com Windows)

Execução em colaboração: eu produzo os artefatos; o usuário roda no Windows e reporta (como no agente .NET). Ordem:
1. **Validar GoTrue no Windows** (Risco 9.1) — antes de tudo.
2. Validar cada binário nativo no Windows (Postgres portátil, PostgREST, GoTrue) subindo isolado.
3. Maestro subindo a pilha + bootstrap + health.
4. App acessível na LAN (login + leitura + escrita + **PDF via storage local**).
5. Instalador completo do zero numa VM limpa.
6. Auto-update: publicar uma "versão nova" fake e ver troca + rollback.

## 9. Riscos

- **9.1 GoTrue no Windows:** pode não haver build oficial win-x64. Mitigação: cross-compilar do Go (`GOOS=windows GOARCH=amd64 go build`) — é a 1ª tarefa do plano (provar que roda). Se inviável, reavaliar auth local (fallback) — mas só com dado real.
- **9.2 Postgres portátil no Windows:** escolher a forma mais simples/confiável (zip oficial do PostgreSQL win-x64 + initdb em pasta de dados própria, rodando como processo filho do maestro, não como serviço do PG).
- **9.3 Next standalone no Node portátil:** validar `next build` (output standalone) rodando sob o Node bundlado.
- **9.4 Auto-update parcial/corrompido:** mitigado por sha256 + troca atômica + rollback + health check.
- **9.5 Permissões/Firewall/Antivírus no Windows:** o instalador precisa lidar (abrir portas LAN; binários podem assustar antivírus → considerar assinatura de código, já listada na ativação).

## 10. Escopo / Não-objetivos

**No escopo:** instalador Windows único; maestro (supervisão + boot order + health); pilha nativa win-x64; storage local (PDFs); auto-update com rollback; testes no Windows.

**Fora do escopo:** o **sincronizador** nuvem⇄local (sub-projeto 3); multi-site; assinatura de código (passo de ativação à parte). Sem sync, o hub é uma "ilha" funcional — útil pra validar tudo antes de plugar a sincronização.

## 11. Decomposição (para o plano de implementação)

1. **Spike GoTrue/PostgREST/Postgres no Windows** (provar binários nativos rodando).
2. **Maestro** (boot order + supervisão + health + logs) — validado subindo a pilha.
3. **Storage local** (API mínima + roteamento no gateway) + app lendo/gravando PDF offline.
4. **App standalone** empacotado + Node portátil.
5. **Auto-update** (manifesto + download + sha256 + troca atômica + rollback).
6. **Instalador Inno Setup** + bootstrap + firewall + teste do zero em VM.

Cada item é uma fatia testável. O sub-projeto entrega o **hub local Windows funcionando sozinho**; a sincronização é o próximo.
