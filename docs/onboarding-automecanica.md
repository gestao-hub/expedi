# Onboarding de automecânica / assistência (módulo OS)

Roteiro mecânico pra plugar um cliente que usa **Ordem de Serviço** no Hiper. A estrutura da OS
já está mapeada e é a mesma em todo Hiper (ver `memory/hiper-schema-os.md`), então só sobra
confirmar **2 coisas por-cliente**. Passo a passo:

## 0. Pré-requisitos
- Empresa criada no painel do operador (tenant + `empresa_id`).
- Agente/hub instalado na máquina do cliente, lendo o Hiper local (`Server=.\HIPER; Database=Hiper`).
- Interruptor de OS ligado pra essa empresa; conexão de WhatsApp por QR feita (self-service).

## 1. Rodar 2 queries só-leitura no Hiper do cliente (NUNCA escrever)

**(a) Quais valores de `situacao` a OS usa de verdade:**
```sql
SELECT situacao, COUNT(*) AS qtd,
       SUM(CASE WHEN aguardando_aprovacao_orcamento=1 THEN 1 ELSE 0 END) AS aguard_aprov,
       SUM(CASE WHEN data_hora_finalizacao IS NOT NULL THEN 1 ELSE 0 END) AS finalizadas
FROM ordem_servico
GROUP BY situacao ORDER BY situacao;
```

**(b) O que cada campo livre do objeto significa (labels Marca/Modelo/Ano/...):**
```sql
SELECT TOP 20 nome, identificacao,
       objeto_adicional1, objeto_adicional2, objeto_adicional3,
       objeto_adicional4, objeto_adicional5
FROM objeto WHERE situacao=1;
```
Olhando os dados reais dá pra deduzir o rótulo de cada `objeto_adicionalN` (ex.: col1="Fiat",
col2="Uno", col3="2015" → adicional1=Marca, adicional2=Modelo, adicional3=Ano). Se houver dúvida,
**perguntar ao cliente** o que ele digita em cada campo na tela de cadastro de objeto do Hiper.

## 2. Preencher o de-para (config da empresa)

Com as respostas acima:
- **Gatilho "pedir autorização do orçamento"** → preferir a flag `aguardando_aprovacao_orcamento=1`
  (mais confiável que decodificar número). Fallback: o valor de `situacao` que o cliente confirmar.
- **Gatilho "serviço pronto"** → `data_hora_finalizacao` preenchida (ou o `situacao` de finalizado).
- **`objeto` exibido no app** = `objeto.nome` + `objeto.identificacao` (placa/série) + os `adicionalN`
  relevantes, já com os rótulos descobertos.

> Recomendação: começar com **gatilho automático OFF e botões manuais** (operador dispara
> "autorizar"/"pronto" na tela). Mais confiável até a gente ver o padrão real do cliente. Ligar
> automático depois, quando os valores estiverem confirmados em produção.

## 3. Ingestão (agente)
O agente, ao ler uma OS, envia pro app:
- cabeçalho: `email_cliente`, `fone_*`/`celular_*`, `nome_cliente`, datas;
- objeto: `nome` + `identificacao` (+ adicionais);
- defeito/diagnóstico/garantia (de `objeto_ordem_servico`);
- peças (`item_ordem_servico`), serviços + técnico (`servico_ordem_servico.id_usuario_tecnico`).

## 4. Validar 1 OS de ponta a ponta
Abrir 1 OS real no Hiper → confirmar que aparece no app com objeto/contato certos → marcar
"aguardando aprovação" no Hiper e ver o gatilho/botão de autorização → finalizar e ver o "pronto".

---
**Resumo:** estrutura = 100% pronta e reutilizável. Por cliente, só os passos 1–2 (≈ minutos).
Referências: `memory/hiper-schema-os.md`, `memory/hiper-schema-local.md`, `memory/hiper-modulos-completos.md`.
