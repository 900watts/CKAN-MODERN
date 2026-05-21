using System.Text;
using Microsoft.Web.WebView2.Core;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using log4net;

namespace CKAN.Modern.IPC;

/// <summary>
/// IPC Bridge — handles bidirectional communication between the
/// React frontend (WebView2) and the C# CKAN Core backend.
///
/// The frontend sends JSON messages via window.chrome.webview.postMessage().
/// This bridge receives them, routes to the appropriate handler,
/// and sends responses back via CoreWebView2.PostWebMessageAsJson().
/// </summary>
public sealed class IpcBridge : IDisposable
{
    private static readonly ILog log = LogManager.GetLogger(typeof(IpcBridge));
    private readonly CoreWebView2 _webView;
    private readonly IpcHandler _handler;

    public IpcBridge(CoreWebView2 webView)
    {
        _webView = webView;
        _handler = new IpcHandler();

        // Subscribe to handler push events and forward to frontend via WebView2.
        // PostWebMessageAsJson must be called on the UI thread, so dispatch accordingly.
        _handler.PushEvent += (channel, data) =>
        {
            System.Windows.Application.Current.Dispatcher.BeginInvoke(() =>
            {
                PushEvent(channel, data);
            });
        };

        // Auto-refresh repository in the background on startup
        _handler.AutoRefreshOnStartup();
    }

    /// <summary>
    /// Called when the frontend posts a message via chrome.webview.postMessage().
    /// Message format: { id: string, channel: string, args: any }
    /// </summary>
    public async void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        string? json = null;
        try
        {
            json = e.WebMessageAsJson;
            var message = JsonConvert.DeserializeObject<IpcRequest>(json);

            if (message == null || string.IsNullOrEmpty(message.Id) || string.IsNullOrEmpty(message.Channel))
            {
                return;
            }

            // Route to handler and get result
            var result = await _handler.HandleAsync(message);

            // Send response back to frontend
            var response = new IpcResponse
            {
                Id = message.Id,
                Success = true,
                Data = result
            };

            SendToFrontend(response);
        }
        catch (Exception ex)
        {
            // Try to extract the request ID for error correlation
            string? requestId = null;
            if (json != null)
            {
                try
                {
                    var obj = JObject.Parse(json);
                    requestId = obj["id"]?.ToString();
                }
                catch (Exception parseEx)
                {
                    log.Warn("[IpcBridge] Failed to parse request ID from JSON for error correlation", parseEx);
                }
            }

            log.Error($"[IpcBridge] IPC request failed (id={requestId ?? "unknown"})", ex);

            if (requestId != null)
            {
                SendToFrontend(new IpcResponse
                {
                    Id = requestId,
                    Success = false,
                    Error = ex.Message
                });
            }
        }
    }

    /// <summary>
    /// Push an event from C# to the frontend (e.g., download progress).
    /// </summary>
    public void PushEvent(string channel, object data)
    {
        var evt = new IpcEvent
        {
            Channel = channel,
            Data = data
        };
        var json = JsonConvert.SerializeObject(evt);
        _webView.PostWebMessageAsJson(json);
    }

    private void SendToFrontend(IpcResponse response)
    {
        var json = JsonConvert.SerializeObject(response);
        _webView.PostWebMessageAsJson(json);
    }

    public void Dispose()
    {
        _handler.Dispose();
    }
}

/// <summary>
/// Incoming request from the frontend.
/// </summary>
public class IpcRequest
{
    [JsonProperty("id")]
    public string Id { get; set; } = "";

    [JsonProperty("channel")]
    public string Channel { get; set; } = "";

    [JsonProperty("args")]
    public JToken? Args { get; set; }
}

/// <summary>
/// Response sent back to the frontend.
/// </summary>
public class IpcResponse
{
    [JsonProperty("id")]
    public string Id { get; set; } = "";

    [JsonProperty("success")]
    public bool Success { get; set; }

    [JsonProperty("data")]
    public object? Data { get; set; }

    [JsonProperty("error")]
    public string? Error { get; set; }
}

/// <summary>
/// Push event from C# to the frontend (no request ID).
/// </summary>
public class IpcEvent
{
    [JsonProperty("channel")]
    public string Channel { get; set; } = "";

    [JsonProperty("data")]
    public object? Data { get; set; }
}
