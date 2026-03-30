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

        // Ensure wwwroot exists
        var wwwroot = Path.Combine(AppContext.BaseDirectory, "wwwroot");
        if (!Directory.Exists(wwwroot))
        {
            MessageBox.Show(
                "Frontend files not found.\n\n" +
                "Run 'npm run build' in the src-ui directory first,\n" +
                "or build in Release mode to auto-build the frontend.",
                "CKAN Modern",
                MessageBoxButton.OK,
                MessageBoxImage.Warning);
        }
    }
}
