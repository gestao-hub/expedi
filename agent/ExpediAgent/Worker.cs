using Microsoft.Extensions.Logging;
namespace ExpediAgent;

public sealed class Worker(AgentConfig cfg, HiperRepository repo, IngestClient client, StateStore state, ILogger<Worker> log)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        log.LogInformation("ExpediAgent iniciado. Poll a cada {S}s, situação-gatilho {Sit}.", cfg.PollIntervalSeconds, cfg.SituacaoGatilho);
        while (!ct.IsCancellationRequested)
        {
            try { await TickAsync(ct); }
            catch (Exception ex) { log.LogError(ex, "Erro no ciclo de sync"); }
            try { await Task.Delay(TimeSpan.FromSeconds(cfg.PollIntervalSeconds), ct); }
            catch (TaskCanceledException) { break; }
        }
    }

    private async Task TickAsync(CancellationToken ct)
    {
        int hwm = state.GetHwm();
        var novos = await repo.NovosPedidosAsync(hwm, cfg.SituacaoGatilho, ct);
        if (novos.Count == 0) return;

        int maxOk = hwm;
        foreach (var h in novos)
        {
            string pdf = Path.Combine(cfg.ResolvedTempDir, $"PedidoVenda_{h.IdPedidoVenda}.pdf");
            bool pdfExiste = File.Exists(pdf);
            bool dentroCarencia = (DateTime.Now - h.DataHoraGeracao).TotalMinutes < cfg.PdfGraceMinutes;

            // Espera o PDF (impressão) enquanto na carência; não avança o HWM.
            if (!pdfExiste && dentroCarencia)
            {
                log.LogInformation("Pedido {Cod}: aguardando PDF (carência).", h.Codigo);
                break; // preserva ordem; tenta de novo no próximo poll
            }

            var cli = await repo.ClienteAsync(h.IdEntidadeCliente, ct);
            var itens = await repo.ItensAsync(h.IdPedidoVenda, ct);
            if (itens.Count == 0)
            {
                log.LogWarning("Pedido {Cod} sem itens — pulando.", h.Codigo);
                maxOk = h.IdPedidoVenda; continue;
            }

            var payload = PayloadBuilder.Build(h, cli, itens);
            var r = await client.EnviarAsync(payload, pdfExiste ? pdf : null, ct);

            if (r is IngestResult.Created or IngestResult.Duplicate)
            {
                log.LogInformation("Pedido {Cod} sincronizado ({R}{Pdf}).", h.Codigo, r, pdfExiste ? ", com PDF" : ", sem PDF");
                maxOk = h.IdPedidoVenda;
            }
            else
            {
                log.LogWarning("Pedido {Cod} falhou ({R}); parando o lote (tenta no próximo poll).", h.Codigo, r);
                break; // não avança além de uma falha pra preservar ordem
            }
        }
        if (maxOk > hwm) state.SetHwm(maxOk);
    }
}
