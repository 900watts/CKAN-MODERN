using System.IO;
using System.Windows;
using CKAN.Modern.CLI;
using log4net;

namespace CKAN.Modern;

/// <summary>
/// CKAN Modern — WPF Application Entry Point.
/// Supports --cli flag to launch REPL mode instead of the GUI.
/// </summary>
public partial class App : Application
{
    private static readonly ILog log = LogManager.GetLogger(typeof(App));

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        // Check for --cli flag
        var args = e.Args;
        if (args.Length > 0 && args[0].Equals("--cli", StringComparison.OrdinalIgnoreCase))
        {
            // Run in CLI mode — suppress the WPF window
            ShutdownMode = ShutdownMode.OnExplicitShutdown;

            // Parse CLI-specific args
            var model    = "deepseek-coder-v2:latest";
            var endpoint = "http://localhost:11434";
            string? apiKey = null;

            for (int i = 1; i < args.Length; i++)
            {
                switch (args[i].ToLowerInvariant())
                {
                    case "--model":
                        if (i + 1 < args.Length) model = args[++i];
                        break;
                    case "--endpoint":
                        if (i + 1 < args.Length) endpoint = args[++i];
                        break;
                    case "--api-key":
                        if (i + 1 < args.Length) apiKey = args[++i];
                        break;
                }
            }

            // Run the REPL synchronously
            try
            {
                using var repl = new CliRepl(endpoint, model, apiKey);
                repl.Run().GetAwaiter().GetResult();
            }
            catch (Exception ex)
            {
                log.Error("CLI mode failed", ex);
                Console.Error.WriteLine($"Fatal error: {ex.Message}");
            }
            finally
            {
                RegistryManager.DisposeAll();
                Shutdown();
            }
        }

        // Otherwise, normal WPF startup continues (MainWindow.xaml loads automatically)
    }
}
