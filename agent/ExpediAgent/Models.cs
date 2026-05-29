using System.Text.Json.Serialization;
namespace ExpediAgent;

public sealed class PedidoHeader
{
    public int IdPedidoVenda { get; set; }
    public string Codigo { get; set; } = "";
    public DateTime DataHoraGeracao { get; set; }
    public int IdEntidadeCliente { get; set; }
    public int IdUsuarioVendedor { get; set; }
    public DateTime? DataEntrega { get; set; }
    public string? Observacao { get; set; }
}

public sealed class ClienteRow
{
    public string Nome { get; set; } = "";
    public string? CpfCnpj { get; set; }
    public string? Logradouro { get; set; }
    public string? Numero { get; set; }
    public string? Complemento { get; set; }
    public string? Bairro { get; set; }
    public string? Cep { get; set; }
    public string? Cidade { get; set; }
    public string? Uf { get; set; }
    public string? FoneDdd { get; set; }
    public string? FoneNumero { get; set; }
}

public sealed class ItemRow
{
    public string Codigo { get; set; } = "";
    public string Descricao { get; set; } = "";
    public decimal Quantidade { get; set; }
    public decimal ValorUnitario { get; set; }
    public decimal ValorUnitarioComDesconto { get; set; }
}

// ---- payload pro endpoint (snake_case, igual ingestPedidoSchema) ----
public sealed class IngestItem
{
    [JsonPropertyName("codigo")] public string Codigo { get; set; } = "";
    [JsonPropertyName("descricao")] public string Descricao { get; set; } = "";
    [JsonPropertyName("quantidade")] public decimal Quantidade { get; set; }
    [JsonPropertyName("unidade")] public string Unidade { get; set; } = "UN";
    [JsonPropertyName("preco_unitario")] public decimal PrecoUnitario { get; set; }
    [JsonPropertyName("desconto")] public decimal Desconto { get; set; }
    [JsonPropertyName("total")] public decimal Total { get; set; }
    [JsonPropertyName("referencia")] public string? Referencia { get; set; }
}
public sealed class IngestPonto
{
    [JsonPropertyName("tipo")] public string Tipo { get; set; } = "loja";
    [JsonPropertyName("empresa_nome")] public string EmpresaNome { get; set; } = "";
    [JsonPropertyName("endereco")] public string? Endereco { get; set; }
    [JsonPropertyName("itens")] public List<IngestItem> Itens { get; set; } = new();
}
public sealed class IngestPayload
{
    [JsonPropertyName("documento_erp")] public string? DocumentoErp { get; set; }
    [JsonPropertyName("data_emissao")] public string? DataEmissao { get; set; }
    [JsonPropertyName("data_entrega")] public string? DataEntrega { get; set; }
    [JsonPropertyName("hiper_usuario_id")] public int HiperUsuarioId { get; set; }
    [JsonPropertyName("cliente_codigo")] public string? ClienteCodigo { get; set; }
    [JsonPropertyName("cliente_nome")] public string ClienteNome { get; set; } = "";
    [JsonPropertyName("cliente_cnpj_cpf")] public string? ClienteCnpjCpf { get; set; }
    [JsonPropertyName("cliente_endereco")] public string? ClienteEndereco { get; set; }
    [JsonPropertyName("cliente_bairro")] public string? ClienteBairro { get; set; }
    [JsonPropertyName("cliente_cidade")] public string? ClienteCidade { get; set; }
    [JsonPropertyName("cliente_uf")] public string? ClienteUf { get; set; }
    [JsonPropertyName("cliente_cep")] public string? ClienteCep { get; set; }
    [JsonPropertyName("cliente_telefone")] public string? ClienteTelefone { get; set; }
    [JsonPropertyName("valor_total")] public decimal ValorTotal { get; set; }
    [JsonPropertyName("observacoes")] public string? Observacoes { get; set; }
    [JsonPropertyName("pontos_retirada")] public List<IngestPonto> PontosRetirada { get; set; } = new();
}
