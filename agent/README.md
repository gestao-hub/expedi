# ExpediAgent — agente local (Hiper → Expedi)

Serviço Windows (.NET 8) que detecta pedidos novos no Hiper (SQL Server local),
monta o payload e faz POST autenticado no `/api/ingest/pedido` da plataforma Expedi.

## Pré-requisitos (máquina do cliente)
- Windows + .NET 8 SDK (para build) — em produção o `.exe` é self-contained (não precisa runtime).
- Acesso de leitura ao SQL Server do Hiper (instância `.\HIPER`, banco `Hiper`) — Windows Auth.
- Um **token de dispositivo** provisionado na nuvem (ver "Provisionamento").

## Configurar
Edite `ExpediAgent/appsettings.json`:
- `ApiBaseUrl`: URL da plataforma (ex.: `https://franzoni.vercel.app`).
- `DeviceToken`: token do dispositivo (provisionado na nuvem).
- `SqlConnectionString`: conexão com o Hiper (default já aponta `.\HIPER`).
- `SituacaoGatilho`: valor de `pedido_venda.situacao` que dispara o sync (default 5 = aberto — **confirmar** na instalação).
- `PollIntervalSeconds` (30), `PdfGraceMinutes` (3), `TempDir` (vazio = `%TEMP%`).

## Rodar em console (teste)
```bat
cd agent\ExpediAgent
dotnet run
```
Crie um pedido no Hiper (com itens e PDF impresso); em ~poll+carência o log mostra
`Pedido Lxxx sincronizado (Created, com PDF)`. Confira na plataforma: o pedido aparece
como **rascunho** pro vendedor revisar ("Revisar e enviar").

## Publicar + instalar como Serviço do Windows
```bat
dotnet publish agent\ExpediAgent -c Release -r win-x64 -p:PublishSingleFile=true --self-contained true -o C:\ExpediAgent
:: copie o appsettings.json (com o token) pra C:\ExpediAgent ao lado do .exe
sc create ExpediAgent binPath= "C:\ExpediAgent\ExpediAgent.exe" start= auto
sc description ExpediAgent "Sincroniza pedidos do Hiper com a plataforma Expedi"
sc start ExpediAgent
```
> Como serviço (LocalSystem), o `%TEMP%` é `C:\Windows\Temp` — diferente do usuário do PDV.
> Se o PDF não for encontrado: rode o serviço sob a conta do usuário do PDV, ou aponte
> `Agent:TempDir` pro temp correto, ou configure o Hiper pra salvar o PDF numa pasta fixa.

## Provisionamento (nuvem, operador)
No Supabase (SQL Editor), gere um token aleatório (ex.: `openssl rand -hex 24` com prefixo
`hpr_`), guarde o cru pro `appsettings.json` e insira só o SHA-256:
```sql
insert into public.dispositivos (empresa_id, nome, token_hash, ativo)
values ('<EMPRESA_UUID>', '<NOME_DA_LOJA>', '<SHA256_DO_TOKEN>', true);

insert into public.hiper_vendedor_map (empresa_id, hiper_usuario_id, hiper_usuario_nome, vendedor_id)
values ('<EMPRESA_UUID>', 1, 'Michel', '<UUID_DO_VENDEDOR>')
on conflict (empresa_id, hiper_usuario_id) do update set vendedor_id = excluded.vendedor_id;
```

## Detalhes de design
- **Carência de PDF:** se o pedido nasce no banco antes de ser impresso, o agente espera o
  PDF aparecer (até `PdfGraceMinutes`) antes de sincronizar — assim o pagamento (que só
  existe no PDF) é capturado. Passou da carência, sincroniza sem PDF (vendedor preenche).
- **Idempotência:** high-water mark local (`%ProgramData%\ExpediAgent\state.json`) +
  dedup no servidor (por `documento_erp`). Nunca duplica.
