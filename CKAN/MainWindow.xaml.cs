using System.IO;
using System.Windows;
using Microsoft.Web.WebView2.Core;
using CKAN.Modern.IPC;

namespace CKAN.Modern;

/// <summary>
/// Main window — hosts WebView2 that renders the React frontend.
/// Sets up the IPC bridge between JavaScript and C# Core.
/// </summary>
public partial class MainWindow : Window
{
    private IpcBridge? _bridge;

    public MainWindow()
    {
        InitializeComponent();
    }

    private async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        // Initialize WebView2 with a user data folder in AppData
        var userDataFolder = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "CKAN", "WebView2");

        var env = await CoreWebView2Environment.CreateAsync(
            userDataFolder: userDataFolder);

        await webView.EnsureCoreWebView2Async(env);
    }

    private void WebView_CoreWebView2InitializationCompleted(
        object? sender, CoreWebView2InitializationCompletedEventArgs e)
    {
        if (!e.IsSuccess)
        {
            MessageBox.Show(
                $"WebView2 failed to initialize:\n{e.InitializationException?.Message}\n\n" +
                "Make sure the WebView2 Runtime is installed.\n" +
                "Download from: https://developer.microsoft.com/en-us/microsoft-edge/webview2/",
                "CKAN Modern",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
            return;
        }

        var core = webView.CoreWebView2;

        // Set up IPC bridge — exposes C# methods to JavaScript
        _bridge = new IpcBridge(core);
        core.WebMessageReceived += _bridge.OnWebMessageReceived;

        // Dev tools in Debug mode
#if DEBUG
        core.Settings.AreDevToolsEnabled = true;
#else
        core.Settings.AreDevToolsEnabled = false;
#endif

        // Disable context menu in Release
#if !DEBUG
        core.Settings.AreDefaultContextMenusEnabled = false;
#endif

        // Navigate to the React frontend
        var wwwroot = Path.Combine(AppContext.BaseDirectory, "wwwroot");
        var indexHtml = Path.Combine(wwwroot, "index.html");

        if (File.Exists(indexHtml))
        {
            // Production: load built files from wwwroot
            core.SetVirtualHostNameToFolderMapping(
                "ckan.local", wwwroot,
                CoreWebView2HostResourceAccessKind.Allow);

            core.Navigate("https://ckan.local/index.html");
        }
        else
        {
            // Dev mode: connect to Vite dev server
            core.Navigate("http://localhost:5173");
        }
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
