# Onboarding de cliente — manual de campo (híbrido offline)

> **Decisão (2026-06-01):** todo cliente novo é **híbrido offline**. Não existe mais modo
> "só nuvem". Cada cliente recebe **agente + hub local**; o agente aponta pro **hub local**
> (`http://127.0.0.1:3000`); a nuvem é espelho/acesso remoto via sincronizador.

## O que se instala (sempre os dois)

| Peça | Instalador | Admin? | Onde | Função |
|---|---|---|---|---|
| **Agente** | `ExpedAgentSetup.exe` | Não | `%LOCALAPPDATA%\ExpedAgent` (auto-start no logon) | Lê o Hiper (SQL Server) e envia pro hub local |
| **Hub** | `ExpedHubSetup.exe` | **Sim** | `C:\Exped` (serviço `ExpedHub`, auto-start) | Roda o Exped inteiro na LAN (`:3000`), sincroniza com a nuvem |

**Dependências na máquina:** Windows + acesso ao Hiper (login do Windows) + uma máquina que
**fica ligada** no horário de trabalho. **Sem Docker, sem runtime** — Node/Postgres/PostgREST/
GoTrue vêm no pacote do hub; o agente é .NET self-contained. O hub baixa os binários no install
(ou usar a variante offline-bundle do `.iss`).

---

## Passo a passo

### 1. Operador (painel — sem instalar nada)
- [ ] Criar a **empresa** (tenant) → anota o `empresa_id`.
- [ ] Gerar o **token de dispositivo** da empresa → guarda (vai no agente E no hub).
- [ ] **White-label:** subir a logo (`logo_url`) e a cor (`cor_primaria`).
- [ ] Ligar o **interruptor de OS** (`usa_os`) se for automecânica/assistência.
- [ ] (Automecânica) ter em mãos o **de-para da `situacao`** — ver `docs/onboarding-automecanica.md`.

### 2. Máquina do cliente — instalar o HUB (como Administrador)
- [ ] Rodar `ExpedHubSetup.exe` → instala em `C:\Exped`, gera `jwtSecret` aleatório, baixa
      binários, registra o serviço `ExpedHub`, abre firewall (3000 e 54320).
- [ ] No `C:\Exped\config.json`, conferir/ajustar e **injetar os dados da nuvem**:
  - `EXPED_CLOUD_API` (ou `cloud.apiBase`) → URL da nuvem (`https://app-exped.vercel.app`)
  - `EXPED_DEVICE_TOKEN` (ou `cloud.deviceToken`) → o token do dispositivo
  - (se editar o config depois, rodar `install-service.ps1` de novo pra propagar pro serviço)
- [ ] `sc query ExpedHub` → `RUNNING`. `http://127.0.0.1:3001/status` → todas as peças `running:true`.
- [ ] **1º login online** (com internet) → o hub puxa os dados da nuvem (cold start) e as senhas.

### 3. Máquina do cliente — instalar o AGENTE (sem admin)
- [ ] Rodar `ExpedAgentSetup.exe` (auto-start no logon).
- [ ] Editar `appsettings.json`:
  ```json
  {
    "Agent": {
      "ApiBaseUrl": "http://127.0.0.1:3000",            // hub LOCAL (padrão híbrido)
      "DeviceToken": "<token do dispositivo>",
      "SqlConnectionString": "Server=.\\HIPER;Database=Hiper;Trusted_Connection=True;TrustServerCertificate=True;",
      "SituacoesGatilho": "2,5,7",                        // situações de VENDA que disparam ingestão
      "SyncOs": false,                                    // true só p/ automecânica/assistência
      "SituacoesOsGatilho": ""                            // de-para de OS (preencher p/ automecânica)
    }
  }
  ```

### 4. Validação (com OUTRO PC/celular na LAN)
- [ ] `http://<ip-do-servidor>:3000/login` abre de outro aparelho da rede.
- [ ] Login → ver mapa / OS → criar/editar → o PDF abre.
- [ ] **Teste de queda:** desligar a internet → app continua funcionando → criar/editar →
      religar → a alteração sobe pra nuvem (`/status` `pendingPush` zera).
- [ ] **Reboot:** reiniciar a máquina → `ExpedHub` sobe sozinho.

### 5. Avisos de pedido novo (PC do operador)
- [ ] No **PC do operador** (o mesmo que roda o Hiper), abrir o Exped por
      **http://localhost:3000** (não pelo IP da LAN). Isso libera a **notificação do Windows**
      e o **som** do aviso de pedido novo (recurso só disponível em contexto seguro = localhost).
- [ ] Clicar uma vez no **sino → "Ativar avisos"** (o navegador exige esse clique para liberar
      som e permissão de notificação). Aceitar a permissão de notificação.
- [ ] No sino, escolher a forma do aviso (som, repetir, notificação) e usar **"Testar aviso"**.
- [ ] Deixar essa aba do Exped **aberta** (pode ficar minimizada atrás do Hiper). Quando um pedido
      sair do Hiper, toca o som + notificação + a aba pisca.
- [ ] Pelo **IP da LAN** (outros PCs/celulares) o aviso ainda toca som e pisca a aba, mas **sem**
      a notificação do Windows (limitação de contexto inseguro do navegador).

---

## Fluxo dos dados (híbrido)
```
Hiper (SQL local) → [Agente] → Hub local (Postgres) ⇄ [Sincronizador] ⇄ Nuvem (Supabase)
                                     ↑                                        ↑
                          equipe via LAN (:3000)                  operador/dono remoto
```
O agente escreve no **hub local**; o sincronizador mantém local⇄nuvem iguais quando há internet.
Sem internet, tudo continua no local; sincroniza ao voltar.

## Pontos de atenção
- **`.exe` não assinados** → SmartScreen alerta; "Mais informações → Executar assim mesmo".
  (Assinatura de código está adiada por opção — quando feita, some o alerta.)
- **Login offline** exige **1 login online antes** naquele aparelho.
- Cada cliente novo deve rodar **~1 semana de uso real** + teste de queda antes de considerar 100%.

Referências: `hub/win/README.md` (runbook técnico do hub), `docs/onboarding-automecanica.md`
(de-para da OS), `memory/onboarding-hibrido-decisao.md`.
