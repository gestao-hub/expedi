using System.Text.Json;
namespace ExpedAgent;

/// <summary>Pedido ingerido sem NF, aguardando faturamento pra re-sincronizar a NF.</summary>
public sealed class NfPendente
{
    public int IdPedidoVenda { get; set; }
    public string DocumentoErp { get; set; } = "";
    public DateTime AddedAtUtc { get; set; }
}

public sealed class StateStore
{
    private readonly string _path;
    public StateStore()
    {
        var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "ExpedAgent");
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "state.json");
    }
    private sealed class State
    {
        public int Hwm { get; set; }
        public int OsHwm { get; set; }
        public List<NfPendente> NfPendentes { get; set; } = new();
    }

    private State Load()
    {
        try { return File.Exists(_path) ? (JsonSerializer.Deserialize<State>(File.ReadAllText(_path)) ?? new State()) : new State(); }
        catch { return new State(); }
    }
    private void Save(State s) => File.WriteAllText(_path, JsonSerializer.Serialize(s));

    public int GetHwm() => Load().Hwm;
    public void SetHwm(int hwm) { var s = Load(); s.Hwm = hwm; Save(s); }

    public int GetOsHwm() => Load().OsHwm;
    public void SetOsHwm(int hwm) { var s = Load(); s.OsHwm = hwm; Save(s); }

    public List<NfPendente> GetNfPendentes() => Load().NfPendentes;

    /// <summary>Adiciona um pedido à lista de "aguardando NF" (no-op se o id já está lá).</summary>
    public void AddNfPendente(int idPedidoVenda, string documentoErp, DateTime nowUtc)
    {
        var s = Load();
        if (s.NfPendentes.Exists(p => p.IdPedidoVenda == idPedidoVenda)) return;
        s.NfPendentes.Add(new NfPendente { IdPedidoVenda = idPedidoVenda, DocumentoErp = documentoErp, AddedAtUtc = nowUtc });
        Save(s);
    }

    public void RemoveNfPendente(int idPedidoVenda)
    {
        var s = Load();
        if (s.NfPendentes.RemoveAll(p => p.IdPedidoVenda == idPedidoVenda) > 0) Save(s);
    }

    /// <summary>Remove pendentes mais antigos que ttlDias (pedido que nunca faturou).</summary>
    public void PruneNfPendentes(DateTime nowUtc, int ttlDias)
    {
        var s = Load();
        if (s.NfPendentes.RemoveAll(p => (nowUtc - p.AddedAtUtc).TotalDays > ttlDias) > 0) Save(s);
    }
}
