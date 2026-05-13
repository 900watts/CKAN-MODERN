using System.Windows;
using CKAN.Modern.CLI;

[assembly: log4net.Config.XmlConfigurator(ConfigFile = "log4net.xml", Watch = true)]

namespace CKAN.Modern;

/// <summary>
/// CKAN Modern — Dual-mode WPF Application Entry Point.
///
/// Double-click (or run without args): Opens the WPF GUI with WebView2.
/// CLI mode ("cli" arg or renamed to CKAN-MCLI.exe): Runs the AI-powered REPL.
/// </summary>
public partial class App : System.Windows.Application
{
    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        try
        {
            var args = Environment.GetCommandLineArgs();
            var exeName = System.IO.Path.GetFileNameWithoutExtension(Environment.ProcessPath);

            // CLI mode: "cli" argument or exe renamed to CKAN-MCLI
            if (args.Any(a => a.Equals("cli", StringComparison.OrdinalIgnoreCase))
                || exeName?.Equals("CKAN-MCLI", StringComparison.OrdinalIgnoreCase) == true)
            {
                // Skip remaining args: first is the exe path, second is "cli" if present
                var cliArgs = args.Skip(1)
                    .Where(a => !a.Equals("cli", StringComparison.OrdinalIgnoreCase))
                    .ToArray();

                try
                {
                    await CliMain.Run(cliArgs);
                }
                catch (Exception ex)
                {
                    System.Windows.MessageBox.Show(
                        $"CLI mode failed to start:\n{ex.Message}",
                        "CKAN Modern — Startup Error",
                        MessageBoxButton.OK,
                        MessageBoxImage.Error);
                }

                Shutdown();
                return;
            }

            // GUI mode: show the main window
            try
            {
                new MainWindow().Show();
            }
            catch (Exception ex)
            {
                System.Windows.MessageBox.Show(
                    $"GUI failed to start:\n{ex.Message}",
                    "CKAN Modern — Startup Error",
                    MessageBoxButton.OK,
                    MessageBoxImage.Error);
                Shutdown();
            }
        }
        catch (Exception ex)
        {
            System.Windows.MessageBox.Show(
                $"Application failed to start:\n{ex.Message}",
                "CKAN Modern — Fatal Startup Error",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
            Shutdown();
        }
    }
}
