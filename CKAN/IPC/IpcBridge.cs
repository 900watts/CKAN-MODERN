using Microsoft.Web.WebView2.Core;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Newtonsoft.Json.Serialization;

namespace CKAN.Modern.IPC;

/// <summary>
/// Bridges WebView2 JS interop with the IpcHandler.
/// - Receives messages from the React frontend via WebMessageReceived
/// - Routes them to IpcHandler for processing
/// - Sends responses back via PostWebMessageAsJson
/// - Forwards PushEvents from IpcHandler to the frontend
/// </summary>
public sealed class IpcBridge : IDisposable
{
    private readonly CoreWebView2 _webView;
    private readonly IpcHandler _handler;
    private bool _disposed;

    private static readonly JsonSerializerSettings JsonSettings = new()
    {
        ContractResolver = new CamelCasePropertyNamesContractResolver(),
    };

    public IpcBridge(CoreWebView2 webView)
    {
        _webView = webView;
        _handler = new IpcHandler();

        // Forward push events from handler to the frontend
        _handler.PushEvent += OnPushEvent;
    }

    /// <summary>
    /// Handle incoming WebMessage from the React frontend.
    /// </summary>
    public void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        var requestJson = e.TryGetWebMessageAsString();
        if (string.IsNullOrEmpty(requestJson)) return;

        try
        {
            var request = JsonConvert.DeserializeObject<IpcRequest>(requestJson, JsonSettings);
            if (request == null || string.IsNullOrEmpty(request.Id)) return;

            // Fire-and-forget: handle the request and send response
            _ = HandleRequestAsync(request);
        }
        catch (JsonException)
        {
            // Malformed JSON from frontend — ignore
        }
    }

    private async Task HandleRequestAsync(IpcRequest request)
    {
        try
        {
            var data = await _handler.HandleAsync(request);

            var response = new IpcResponse
            {
                Id = request.Id,
                Success = true,
                Data = data,
            };

            PostResponse(response);
        }
        catch (Exception ex)
        {
            PostResponse(new IpcResponse
            {
                Id = request.Id,
                Success = false,
                Error = ex.Message,
            });
        }
    }

    /// <summary>
    /// Send an IPC response back to the WebView2 frontend.
    /// Must be marshalled to the UI thread because PostWebMessageAsJson
    /// requires the calling thread to be the WebView2 owner thread.
    /// </summary>
    private void PostResponse(IpcResponse response)
    {
        if (_disposed) return;

        var app = System.Windows.Application.Current;
        if (app != null && !app.Dispatcher.CheckAccess())
        {
            app.Dispatcher.InvokeAsync(() => PostResponseCore(response));
        }
        else
        {
            PostResponseCore(response);
        }
    }

    private void PostResponseCore(IpcResponse response)
    {
        if (_disposed) return;
        var json = JsonConvert.SerializeObject(response, JsonSettings);
        _webView.PostWebMessageAsJson(json);
    }

    /// <summary>
    /// Forward a push event from IpcHandler to the React frontend.
    /// Must be marshalled to the UI thread because PostWebMessageAsJson
    /// requires the calling thread to be the WebView2 owner thread.
    /// </summary>
    private void OnPushEvent(string channel, object data)
    {
        if (_disposed) return;

        var app = System.Windows.Application.Current;
        if (app != null && !app.Dispatcher.CheckAccess())
        {
            app.Dispatcher.InvokeAsync(() => OnPushEventCore(channel, data));
        }
        else
        {
            OnPushEventCore(channel, data);
        }
    }

    private void OnPushEventCore(string channel, object data)
    {
        if (_disposed) return;

        var message = JsonConvert.SerializeObject(new
        {
            type = "push",
            channel,
            data,
        }, JsonSettings);

        _webView.PostWebMessageAsJson(message);
    }

    /// <summary>
    /// Delegate to IpcHandler.AutoRefreshOnStartup.
    /// Triggers a background repository refresh after the bridge is fully wired up.
    /// </summary>
    public void AutoRefreshOnStartup()
    {
        _handler.AutoRefreshOnStartup();
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;

        _handler.PushEvent -= OnPushEvent;
        _handler.Dispose();
    }
}
