using Newtonsoft.Json.Linq;

namespace CKAN.Modern.IPC;

/// <summary>
/// An incoming IPC request from the React frontend.
/// </summary>
public sealed class IpcRequest
{
    public string Id { get; init; } = string.Empty;
    public string Channel { get; init; } = string.Empty;
    public JToken? Args { get; init; }
}

/// <summary>
/// An outgoing IPC response back to the React frontend.
/// </summary>
public sealed class IpcResponse
{
    public string Id { get; init; } = string.Empty;
    public bool Success { get; init; }
    public object? Data { get; init; }
    public string? Error { get; init; }
}
