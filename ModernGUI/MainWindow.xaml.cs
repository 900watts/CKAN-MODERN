using System;
using System.IO;
using System.Threading.Tasks;
using System.Windows;
using Microsoft.Web.WebView2.Core;
using log4net;
using CKAN.GUI.Services;

namespace CKAN.GUI;

public partial class MainWindow : Window
{
    private static readonly ILog Log = LogManager.GetLogger(typeof(MainWindow));

    private readonly IIpcService _ipcService;
    private bool _isDevMode = true; // Set to false in production

    public MainWindow()
    {
        InitializeComponent();
        _ipcService = App.Container?.Resolve<IIpcService>() 
            ?? throw new InvalidOperationException("Failed to resolve IPC service");

        Loaded += OnLoaded;
        Closing += OnClosing;
    }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        try
        {
            // Initialize WebView2
            await WebView.EnsureCoreWebView2Async();
            
            // Configure WebView2
            WebView.CoreWebView2.Settings.AreDefaultScriptDialogsEnabled = true;
            WebView.CoreWebView2.Settings.AreDevToolsEnabled = false;
            WebView.CoreWebView2.Settings.IsScriptEnabled = true;
            WebView.CoreWebView2.Settings.IsWebMessageEnabled = true;

            // Set up IPC message handler
            WebView.CoreWebView2.WebMessageReceived += OnWebMessageReceived;

            // Inject JS bridge
            InjectJavaScriptBridge();

            // Navigate to the app
            var url = _isDevMode 
                ? "http://localhost:5173" 
                : GetProductionUrl();
            
            Log.Info($"Loading UI from: {url}");
            WebView.CoreWebView2.Navigate(url);

        }
        catch (Exception ex)
        {
            Log.Error("Failed to initialize WebView2", ex);
            MessageBox.Show($"Failed to start: {ex.Message}\n\nWebView2 Runtime may not be installed.",
                "CKAN Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private void InjectJavaScriptBridge()
    {
        var js = @"
            // CKAN IPC Bridge for WebView2
            (function() {
                const CkanIpc = {
                    dotNetRef: null,
                    
                    init: function(ref) {
                        this.dotNetRef = ref;
                        console.log('[CKAN] Bridge initialized');
                    },
                    
                    isConnected: function() {
                        return this.dotNetRef !== null;
                    },
                    
                    send: function(channel, args) {
                        // Send to C# via postMessage
                        if (window.chrome && chrome.webview) {
                            chrome.webview.postMessage({
                                channel: channel,
                                args: args || {},
                                id: crypto.randomUUID()
                            });
                        } else {
                            console.warn('[CKAN] No webview bridge available');
                        }
                    },
                    
                    // Call C# and await response
                    call: async function(channel, args) {
                        return new Promise((resolve, reject) => {
                            const id = crypto.randomUUID();
                            const timeout = setTimeout(() => {
                                reject(new Error('IPC timeout: ' + channel));
                            }, 30000);
                            
                            // Store resolver for this ID
                            window.__ipcResolvers = window.__ipcResolvers || {};
                            window.__ipcResolvers[id] = { resolve, timeout };
                            
                            this.send(channel, args);
                        });
                    }
                };
                
                // Handle messages FROM C#
                if (window.chrome && chrome.webview) {
                    window.chrome.webview.addEventListener('message', function(event) {
                        const data = event.data;
                        
                        // Handle response
                        if (data.id && window.__ipcResolvers && window.__ipcResolvers[data.id]) {
                            const { resolve, timeout } = window.__ipcResolvers[data.id];
                            clearTimeout(timeout);
                            
                            if (data.success) {
                                resolve(data.data);
                            } else {
                                reject(new Error(data.error || 'IPC error'));
                            }
                            delete window.__ipcResolvers[data.id];
                            return;
                        }
                        
                        // Handle events
                        if (data.event && window.__ipcListeners && window.__ipcListeners[data.event]) {
                            window.__ipcListeners[data.event].forEach(cb => cb(data.data));
                        }
                    });
                }
                
                // Expose globally for React
                window.ckanIpc = CkanIpc;
                window.__ipcListeners = {};
                
                // Listen for events from C#
                window.ckanOn = function(event, callback) {
                    window.__ipcListeners[event] = window.__ipcListeners[event] || [];
                    window.__ipcListeners[event].push(callback);
                };
                
                window.ckanOff = function(event, callback) {
                    if (window.__ipcListeners[event]) {
                        window.__ipcListeners[event] = window.__ipcListeners[event].filter(cb => cb !== callback);
                    }
                };
                
                console.log('[CKAN] JavaScript bridge injected');
            })();
        ";

        WebView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(js);
    }

    private void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            var message = e.WebMessageAsJson;
            var data = System.Text.Json.JsonSerializer.Deserialize<IpcMessage>(message);
            
            if (data != null)
            {
                Log.Debug($"IPC: {data.Channel} ({data.Id})");
                
                Task.Run(async () =>
                {
                    try
                    {
                        var result = await _ipcService.HandleAsync(data.Channel, data.Args);
                        
                        // Send response back to JS
                        WebView.CoreWebView2.PostWebMessageAsJson(System.Text.Json.JsonSerializer.Serialize(new
                        {
                            id = data.Id,
                            success = true,
                            data = result
                        }));
                    }
                    catch (Exception ex)
                    {
                        Log.Error($"IPC error: {data.Channel}", ex);
                        WebView.CoreWebView2.PostWebMessageAsJson(System.Text.Json.JsonSerializer.Serialize(new
                        {
                            id = data.Id,
                            success = false,
                            error = ex.Message
                        }));
                    }
                });
            }
        }
        catch (Exception ex)
        {
            Log.Error("Failed to process web message", ex);
        }
    }

    private string GetProductionUrl()
    {
        // In production, load from embedded resources or adjacent folder
        var baseDir = AppDomain.CurrentDomain.BaseDirectory;
        var wwwroot = Path.Combine(baseDir, "wwwroot");
        
        if (Directory.Exists(wwwroot))
        {
            return Path.Combine(wwwroot, "index.html");
        }
        
        // Fallback: try parent src-ui/dist
        var srcUi = Path.Combine(baseDir, "..", "src-ui", "dist");
        if (Directory.Exists(srcUi))
        {
            return Path.Combine(srcUi, "index.html");
        }
        
        // Last resort: current directory
        return Path.Combine(baseDir, "index.html");
    }

    private void OnClosing(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        Log.Info("Main window closing");
    }
}

public class IpcMessage
{
    public string Id { get; set; } = "";
    public string Channel { get; set; } = "";
    public object? Args { get; set; }
}