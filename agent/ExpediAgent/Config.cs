namespace ExpediAgent;

public sealed class AgentConfig
{
    public string ApiBaseUrl { get; set; } = "";
    public string DeviceToken { get; set; } = "";
    public string SqlConnectionString { get; set; } = "";
    public int PollIntervalSeconds { get; set; } = 30;
    public short SituacaoGatilho { get; set; } = 5;
    public int PdfGraceMinutes { get; set; } = 3;
    public string TempDir { get; set; } = "";
    public string ResolvedTempDir => string.IsNullOrWhiteSpace(TempDir) ? Path.GetTempPath() : TempDir;
}
