using System.Text.Json;
namespace ExpediAgent;

public sealed class StateStore
{
    private readonly string _path;
    public StateStore()
    {
        var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "ExpediAgent");
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "state.json");
    }
    private sealed class State { public int Hwm { get; set; } }

    public int GetHwm()
    {
        try { return File.Exists(_path) ? (JsonSerializer.Deserialize<State>(File.ReadAllText(_path))?.Hwm ?? 0) : 0; }
        catch { return 0; }
    }
    public void SetHwm(int hwm) => File.WriteAllText(_path, JsonSerializer.Serialize(new State { Hwm = hwm }));
}
