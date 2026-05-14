using System.IO;
using System.Reflection;
using System.Windows;
using System.Windows.Threading;
using Microsoft.Web.WebView2.Core;
using CKAN.Modern.IPC;

namespace CKAN.Modern;

/// <summary>
/// Main window — hosts WebView2 that renders the React frontend.
/// In Release builds, the frontend is embedded as assembly resources
/// and served via WebResourceRequested — no external files needed.
/// In Debug, it connects to the Vite dev server.
/// </summary>
public partial class MainWindow : Window
{
    private IpcBridge? _bridge;
    private static readonly Assembly _assembly = Assembly.GetExecutingAssembly();

    private static readonly Dictionary<string, string> MimeTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        [".html"] = "text/html",
        [".js"]   = "application/javascript",
        [".css"]  = "text/css",
        [".json"] = "application/json",
        [".svg"]  = "image/svg+xml",
        [".png"]  = "image/png",
        [".ico"]  = "image/x-icon",
        [".woff"] = "font/woff",
        [".woff2"]= "font/woff2",
        [".ttf"]  = "font/ttf",
    };

    private CancellationTokenSource? _initTimeoutCts;

    public MainWindow()
    {
        InitializeComponent();
    }

    private async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        try
        {
            var userDataFolder = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "CKAN", "WebView2");

            // Disable web security so the embedded React frontend can call
            // external AI APIs (Silicon Flow, OpenAI, etc.) without CORS
            // restrictions. This is safe because the app only loads trusted
            // embedded code — it is not a general-purpose browser.
            // Also ignore certificate errors for the self-hosted https://ckan.local origin.
            var options = new CoreWebView2EnvironmentOptions
            {
                AdditionalBrowserArguments = "--disable-web-security --ignore-certificate-errors"
            };

            var env = await CoreWebView2Environment.CreateAsync(
                null, userDataFolder, options);

            await webView.EnsureCoreWebView2Async(env);

            // Start a 30-second timeout in case CoreWebView2InitializationCompleted
            // never fires (e.g., hung init). We check after the delay and close if
            // the bridge was never set up.
            _initTimeoutCts = new CancellationTokenSource();
            _ = TimeoutAfterInit(_initTimeoutCts.Token);
        }
        catch (Exception ex)
        {
            System.Windows.MessageBox.Show(
                $"WebView2 initialization failed:\n{ex.Message}\n\n" +
                "Make sure the WebView2 Runtime is installed.\n" +
                "Download from: https://developer.microsoft.com/en-us/microsoft-edge/webview2/",
                "CKAN Modern",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
            Close();
        }
    }

    private async Task TimeoutAfterInit(CancellationToken ct)
    {
        try
        {
            await Task.Delay(30_000, ct);
        }
        catch (OperationCanceledException)
        {
            return; // Init completed in time
        }

        // Timeout: if bridge was never set up, show error and close
        if (_bridge == null && !ct.IsCancellationRequested)
        {
            Dispatcher.Invoke(() =>
            {
                System.Windows.MessageBox.Show(
                    "WebView2 initialization timed out after 30 seconds.\n\n" +
                    "Make sure the WebView2 Runtime is installed.\n" +
                    "Download from: https://developer.microsoft.com/en-us/microsoft-edge/webview2/",
                    "CKAN Modern",
                    MessageBoxButton.OK,
                    MessageBoxImage.Error);
                Close();
            });
        }
    }

    private void WebView_CoreWebView2InitializationCompleted(
        object? sender, CoreWebView2InitializationCompletedEventArgs e)
    {
        // Cancel the timeout — init completed (success or failure)
        _initTimeoutCts?.Cancel();
        _initTimeoutCts?.Dispose();
        _initTimeoutCts = null;

        if (!e.IsSuccess)
        {
            System.Windows.MessageBox.Show(
                $"WebView2 failed to initialize:\n{e.InitializationException?.Message}\n\n" +
                "Make sure the WebView2 Runtime is installed.\n" +
                "Download from: https://developer.microsoft.com/en-us/microsoft-edge/webview2/",
                "CKAN Modern",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
            Close();
            return;
        }

        var core = webView.CoreWebView2;

        // Set up IPC bridge
        _bridge = new IpcBridge(core);
        core.WebMessageReceived += _bridge.OnWebMessageReceived;

        // Trigger background repository refresh on startup
        _bridge.AutoRefreshOnStartup();

#if DEBUG
        core.Settings.AreDevToolsEnabled = true;
#else
        core.Settings.AreDevToolsEnabled = false;
        core.Settings.AreDefaultContextMenusEnabled = false;
#endif

        // Check if we have embedded resources (Release) or should use Vite (Debug)
        if (HasEmbeddedFrontend())
        {
            // Intercept all requests to ckan.local and serve from embedded resources
            core.AddWebResourceRequestedFilter("https://ckan.local/*", CoreWebView2WebResourceContext.All);
            core.WebResourceRequested += OnWebResourceRequested;
            core.Navigate("https://ckan.local/index.html");
        }
        else
        {
            // Dev mode: connect to Vite dev server
            core.Navigate("http://localhost:5173");
        }
    }

    /// <summary>
    /// Serve embedded resources for ckan.local requests.
    /// </summary>
    private void OnWebResourceRequested(object? sender, CoreWebView2WebResourceRequestedEventArgs e)
    {
        var uri = new Uri(e.Request.Uri);
        var path = uri.AbsolutePath.TrimStart('/');
        if (string.IsNullOrEmpty(path)) path = "index.html";

        var stream = GetEmbeddedResource(path);
        if (stream != null)
        {
            var ext = Path.GetExtension(path);
            var mime = MimeTypes.GetValueOrDefault(ext, "application/octet-stream");

            e.Response = webView.CoreWebView2.Environment.CreateWebResourceResponse(
                stream, 200, "OK", $"Content-Type: {mime}\nAccess-Control-Allow-Origin: *");
        }
        else
        {
            e.Response = webView.CoreWebView2.Environment.CreateWebResourceResponse(
                null, 404, "Not Found", "");
        }
    }

    /// <summary>
    /// Get an embedded resource stream by its wwwroot-relative path.
    /// </summary>
    private static Stream? GetEmbeddedResource(string relativePath)
    {
        var resourceName = "CKAN.Modern.wwwroot." + relativePath
            .Replace('/', '.')
            .Replace('\\', '.');

        // Try exact match first
        var stream = _assembly.GetManifestResourceStream(resourceName);
        if (stream != null) return stream;

        // Try case-insensitive match
        var names = _assembly.GetManifestResourceNames();
        foreach (var name in names)
        {
            if (name.Equals(resourceName, StringComparison.OrdinalIgnoreCase))
                return _assembly.GetManifestResourceStream(name);
        }

        // Fuzzy match: find a resource that ends with the filename
        var fileName = Path.GetFileName(relativePath);
        foreach (var name in names)
        {
            if (name.EndsWith("." + fileName, StringComparison.OrdinalIgnoreCase) ||
                name.EndsWith("." + fileName.Replace('-', '_'), StringComparison.OrdinalIgnoreCase))
            {
                return _assembly.GetManifestResourceStream(name);
            }
        }

        return null;
    }

    /// <summary>
    /// Check if the assembly has embedded frontend resources.
    /// </summary>
    private static bool HasEmbeddedFrontend()
    {
        var names = _assembly.GetManifestResourceNames();
        foreach (var name in names)
        {
            if (name.Contains("wwwroot") && name.EndsWith(".html"))
                return true;
        }
        return false;
    }

    private void WebView_NavigationCompleted(
        object? sender, CoreWebView2NavigationCompletedEventArgs e)
    {
        if (!e.IsSuccess)
        {
            Title = "CKAN — Connection Error";
        }
    }

    protected override void OnClosed(EventArgs e)
    {
        _bridge?.Dispose();
        webView?.Dispose();
        base.OnClosed(e);
    }
}
