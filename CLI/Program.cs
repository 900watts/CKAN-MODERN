using System.Diagnostics.CodeAnalysis;
using log4net;

[assembly: log4net.Config.XmlConfigurator(ConfigFile = "log4net.xml", Watch = true)]

namespace CKAN.CLI;

/// <summary>
/// Entry point for CKAN-CLI — AI-powered REPL for KSP mod management.
/// Interactive startup: pick provider → pick model → enter REPL.
/// </summary>
public static class Program
{
    private static readonly ILog log = LogManager.GetLogger(typeof(Program));

    public static async Task<int> Main(string[] args)
    {
        Logging.Initialize();
        ConsoleRenderer.InitConsole();

        // ── Interactive provider/model selection ───────────────────────
        if (args.Length == 0)
        {
            // Interactive mode
            var client = await InteractiveSetup();
            if (client == null) return 0;
            await RunRepl(client);
        }
        else
        {
            // CLI flag mode (--model / --endpoint / --api-key)
            var client = FlagModeSetup(args);
            if (client == null) return 1;
            await RunRepl(client);
        }

        RegistryManager.DisposeAll();
        return 0;
    }

    // ── Interactive startup ────────────────────────────────────────────

    private static async Task<AiClient?> InteractiveSetup()
    {
        // Step 1: Pick a provider
        var providerNames = ProviderConfig.Providers
            .Select(p => $"{p.Name,-22} {ConsoleRenderer.DimGray(p.HelpNote ?? "")}")
            .ToArray();

        ConsoleRenderer.PrintInfo("Select an AI provider:");
        var providerIdx = ConsoleRenderer.InteractiveMenu("", providerNames);
        if (providerIdx < 0) return null;

        var provider = ProviderConfig.Providers[providerIdx];
        Console.WriteLine();

        // Step 2: Resolve or enter API key
        string? apiKey = ProviderConfig.ResolveApiKey(provider);
        if (apiKey == null && provider.EnvApiKey != null)
        {
            apiKey = ConsoleRenderer.PromptInput(
                $"Enter {provider.Name} API key",
                $"(set {provider.EnvApiKey} env var to skip)");
            if (string.IsNullOrEmpty(apiKey))
            {
                ConsoleRenderer.PrintError($"API key required for {provider.Name}.");
                return null;
            }
        }

        // Step 3: Pick or confirm endpoint
        var endpoint = ConsoleRenderer.PromptInput("Endpoint", provider.DefaultEndpoint);

        // Step 4: Pick a model (with custom input option)
        var modelIdx = ConsoleRenderer.InteractiveMenu(
            $"Select a model for {provider.Name}",
            provider.AvailableModels,
            out var customModel,
            allowCustom: true);
        var model = modelIdx == int.MaxValue
            ? customModel ?? provider.DefaultModel
            : modelIdx >= 0 ? provider.AvailableModels[modelIdx] : provider.DefaultModel;

        Console.WriteLine();

        // Step 5: Create the client
        var client = AiClient.Create(provider.Type, endpoint, model, apiKey);
        ConsoleRenderer.PrintSuccess($"Connected to {client.ProviderName}  ({client.ModelName})");
        Console.WriteLine();

        return client;
    }

    // ── CLI flag mode ──────────────────────────────────────────────────

    private static AiClient? FlagModeSetup(string[] args)
    {
        var model    = "deepseek-coder-v2:latest";
        var endpoint = "http://localhost:11434";
        string? apiKey = null;

        for (int i = 0; i < args.Length; i++)
        {
            switch (args[i].ToLowerInvariant())
            {
                case "--model":
                    model = GetArgValue(args, ref i, "model");
                    break;
                case "--endpoint":
                    endpoint = GetArgValue(args, ref i, "endpoint");
                    break;
                case "--api-key":
                    apiKey = GetArgValue(args, ref i, "api-key");
                    break;
                case "--provider":
                {
                    var name = GetArgValue(args, ref i, "provider").ToLowerInvariant();
                    var match = ProviderConfig.Providers.FirstOrDefault(p =>
                        p.Name.Contains(name, StringComparison.OrdinalIgnoreCase) ||
                        p.Type.ToString().Equals(name, StringComparison.OrdinalIgnoreCase));
                    if (match == null)
                    {
                        Console.Error.WriteLine($"Unknown provider '{name}'.");
                        Console.Error.WriteLine($"Available: {string.Join(", ", ProviderConfig.Providers.Select(p => p.Type.ToString()))}");
                        return null;
                    }
                    apiKey ??= ProviderConfig.ResolveApiKey(match);
                    break;
                }
                default:
                    Console.Error.WriteLine($"Unknown option: {args[i]}");
                    return null;
            }
        }

        var client = AiClient.CreateFromEndpoint(endpoint, model, apiKey);
        ConsoleRenderer.PrintSuccess($"Connected to {client.ProviderName}  ({client.ModelName})");
        Console.WriteLine();
        return client;
    }

    // ── REPL loop ──────────────────────────────────────────────────────

    private static async Task RunRepl(AiClient ai)
    {
        var user = new CliUser();
        using var executor = new ActionExecutor(user);

        // Print welcome banner with instance info
        var (gameVer, installedCount, registryCount, instanceName) = executor.GetInstanceInfo();
        ConsoleRenderer.PrintWelcome(gameVer, installedCount, registryCount, instanceName, ai.ProviderName, ai.ModelName);

        while (true)
        {
            ConsoleRenderer.PrintPrompt();
            var input = Console.ReadLine()?.Trim();

            if (string.IsNullOrEmpty(input))
                continue;

            // Slash commands
            if (input.StartsWith("/"))
            {
                var handled = HandleSlashCommand(input, ai, executor);
                if (handled == SlashResult.Exit)
                    break;
                continue;
            }

            // AI-powered mode
            string aiResponse;
            using (var writer = new ConsoleRenderer.TokenWriter())
            {
                aiResponse = await ConsoleRenderer.WithSpinner(
                    "Thinking...",
                    (cts) =>
                    {
                        writer.SetSpinnerCts(cts);
                        return ai.Chat(input, token => {
                            // Strip markdown chars from each token for clean display.
                            // The full-text strip below ensures command parsing is clean too.
                            var clean = token.Replace("**", "").Replace("__", "").Replace("~~", "").Replace("`", "");
                            writer.Write(clean);
                        });
                    }
                );
                // Full-text strip for safe command parsing
                aiResponse = ConsoleRenderer.StripMarkdown(aiResponse);
            }

            if (string.IsNullOrEmpty(aiResponse))
            {
                ConsoleRenderer.PrintError("No response from AI. Is the model running?");
                continue;
            }

            Console.WriteLine();

            // Execute action commands parsed from AI response
            var summaries = await executor.ExecuteCommands(aiResponse);
            foreach (var summary in summaries)
            {
                if (summary.StartsWith("Install failed") || summary.StartsWith("Uninstall failed") ||
                    summary.StartsWith("Cannot") || summary.StartsWith("Module '") && summary.Contains("not found"))
                {
                    ConsoleRenderer.PrintError(summary);
                }
                else
                {
                    ConsoleRenderer.PrintSuccess(summary);
                }
            }
        }
    }

    private static string GetArgValue(string[] args, ref int i, string name)
    {
        if (i + 1 >= args.Length || args[i + 1].StartsWith("--"))
        {
            Console.Error.WriteLine($"--{name} requires a value.");
            Environment.Exit(1);
        }
        return args[++i];
    }

    private static SlashResult HandleSlashCommand(string input, AiClient ai, ActionExecutor executor)
    {
        var parts = input.Split(' ', 2, StringSplitOptions.RemoveEmptyEntries);
        var cmd   = parts[0].ToLowerInvariant();

        switch (cmd)
        {
            case "/quit":
            case "/exit":
                ConsoleRenderer.PrintInfo("Goodbye!");
                return SlashResult.Exit;

            case "/status":
            {
                var (gameVer, installedCount, registryCount, instanceName) = executor.GetInstanceInfo();
                ConsoleRenderer.PrintSuccess($"Instance: {instanceName ?? "—"}");
                ConsoleRenderer.PrintInfo($"  Game version:    {gameVer}");
                ConsoleRenderer.PrintInfo($"  Installed mods:  {installedCount}");
                ConsoleRenderer.PrintInfo($"  Registry mods:   {registryCount}");
                return SlashResult.Handled;
            }

            case "/installed":
            {
                var instance = executor.CurrentInstance;
                if (instance == null || executor.Registry == null)
                {
                    ConsoleRenderer.PrintError("No active game instance.");
                    return SlashResult.Handled;
                }

                var installed = executor.Registry.InstalledModules
                    .OrderBy(m => m.Module.name)
                    .ToArray();

                if (installed.Length == 0)
                {
                    ConsoleRenderer.PrintInfo("No mods installed.");
                    return SlashResult.Handled;
                }

                var headers = new[] { "Identifier", "Version", "Name", "Auto" };
                var rows = installed.Select(im => new[]
                {
                    im.Module.identifier,
                    im.Module.version?.ToString() ?? "—",
                    im.Module.name,
                    im.AutoInstalled ? "yes" : ""
                }).ToList();

                ConsoleRenderer.PrintTable(headers, rows);
                return SlashResult.Handled;
            }

            case "/clear":
                ai.ClearHistory();
                ConsoleRenderer.PrintSuccess("Conversation history cleared.");
                return SlashResult.Handled;

            case "/help":
                PrintHelp();
                return SlashResult.Handled;

            default:
                ConsoleRenderer.PrintError($"Unknown command: {cmd}. Type /help for available commands.");
                return SlashResult.Handled;
        }
    }

    private static void PrintHelp()
    {
        ConsoleRenderer.PrintSuccess("CKAN-CLI Commands");
        ConsoleRenderer.PrintInfo("  /quit or /exit       Exit");
        ConsoleRenderer.PrintInfo("  /status              Show instance info");
        ConsoleRenderer.PrintInfo("  /installed           List installed mods");
        ConsoleRenderer.PrintInfo("  /clear               Clear conversation history");
        ConsoleRenderer.PrintInfo("  /help                Show this help");
        Console.WriteLine();
        ConsoleRenderer.PrintInfo("You can also ask me anything in natural language!");
        ConsoleRenderer.PrintInfo("Examples:");
        ConsoleRenderer.PrintInfo("  \"Search for scatterer\"");
        ConsoleRenderer.PrintInfo("  \"Install ModuleManager\"");
        ConsoleRenderer.PrintInfo("  \"What mods do I have installed?\"");
        ConsoleRenderer.PrintInfo("  \"Update all my mods\"");
    }

    private enum SlashResult { Handled, Exit }
}

/// <summary>
/// Console-based IUser implementation for the REPL CLI.
/// </summary>
[ExcludeFromCodeCoverage]
public class CliUser : IUser
{
    public bool Headless => true;

    public bool RaiseYesNoDialog(string question) => true;
    public int RaiseSelectionDialog(string message, params object[] args) => 0;

    public void RaiseError(string message, params object[] args)
    {
        ConsoleRenderer.PrintError(string.Format(message, args));
    }

    public void RaiseProgress(string message, int percent) { }
    public void RaiseProgress(ByteRateCounter rateCounter) { }

    public void RaiseMessage(string message, params object[] args)
    {
        var formatted = string.Format(message, args);
        if (!string.IsNullOrWhiteSpace(formatted))
            ConsoleRenderer.PrintInfo(formatted);
    }
}
