using System.IO;
using System.Windows;

namespace CKAN.Modern;

/// <summary>
/// CKAN Modern — WPF Application Entry Point.
/// Hosts the React frontend in WebView2 and bridges to the C# Core.
/// </summary>
public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        // Frontend is embedded as assembly resources — no wwwroot directory check needed.
    }
}
