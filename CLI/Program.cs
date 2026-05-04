using System.Net;
using System.Runtime.InteropServices;
using CKAN.Configuration;
using CKAN.Games;
using log4net;

namespace CKAN.CLI;

/// <summary>
/// CKAN AI CLI — interactive terminal assistant for KSP mod management.
/// Like Claude Code, but for CKAN.
/// </summary>
internal static class Program
{
    private static readonly ILog log = LogManager.GetLogger(typeof(Program));

    private const string CONFIG_DIR = ".ckan";
    private const string KEY_FILE = "ai_key.txt";
    private const string PROVIDER_FILE = "ai_provider.txt";

    [STAThread]
    public static async Task<int> Main(string[] args)
    {
        // TLS 1.2+ required for GitHub/Silicon Flow
        ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12
                                              | SecurityProtocolType.Tls13;

        Logging.Initialize();
        if (args.Contains("--debug"))
        {
            LogManager.GetRepository().Threshold = log4net.Core.Level.Debug;
        }

        // ── Show usage if --help ──
        if (args.Contains("--help") || args.Contains("-h"))
        {
            PrintUsage();
            return 0;
        }

        // ── Install / Uninstall to PATH ──
        if (args.Contains("--install"))
        {
            return InstallToPath();
        }
        if (args.Contains("--uninstall"))
        {
            return UninstallFromPath();
        }

        // ── Resolve provider settings ──
        var providerName = ResolveArg(args, "--provider", "-p") ?? LoadSavedSetting("provider") ?? "siliconflow";
        var baseUrlOverride = ResolveArg(args, "--base-url", "-u");
        var modelOverride = ResolveArg(args, "--model", "-m");

        // ── Resolve API key ──
        var apiKey = ResolveApiKey(args);
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            Console.WriteLine();
            ConsoleRenderer.PrintError("No API key found. Set one with:");
            ConsoleRenderer.PrintInfo("  ckan --api-key <your-key>");
            ConsoleRenderer.PrintInfo("  or set CKAN_AI_KEY environment variable");
            Console.WriteLine();
            ConsoleRenderer.PrintInfo("Providers (use --provider <name>):");
            foreach (var (key, preset) in AiClient.Providers)
            {
                if (key == "custom") continue;
                ConsoleRenderer.PrintInfo($"  {key,-16} {preset.Label} (default model: {preset.DefaultModel})");
            }
            ConsoleRenderer.PrintInfo($"  {"custom",-16} Any OpenAI-compatible endpoint (requires --base-url)");
            Console.WriteLine();
            ConsoleRenderer.PrintInfo("Examples:");
            ConsoleRenderer.PrintInfo("  ckan --api-key sk-xxx                              (uses Silicon Flow)");
            ConsoleRenderer.PrintInfo("  ckan --api-key sk-xxx --provider openai             (uses OpenAI gpt-4o-mini)");
            ConsoleRenderer.PrintInfo("  ckan --api-key sk-xxx --provider deepseek            (uses DeepSeek)");
            ConsoleRenderer.PrintInfo("  ckan --api-key sk-xxx --provider openrouter          (uses OpenRouter free tier)");
            ConsoleRenderer.PrintInfo("  ckan --api-key sk-xxx --provider custom --base-url https://my-api.com/v1 --model my-model");
            Console.WriteLine();
            return 1;
        }

        // ── Initialize CKAN Core ──
        IConfiguration config;
        GameInstanceManager instanceManager;
        RegistryManager? registryManager = null;
        RepositoryDataManager repoData;

        try
        {
            config = new JsonConfiguration();
            var user = new CliUser();
            instanceManager = new GameInstanceManager(user, config);
            repoData = new RepositoryDataManager();

            var preferred = instanceManager.GetPreferredInstance();
            if (preferred == null)
            {
                instanceManager.FindAndRegisterDefaultInstances();
                preferred = instanceManager.GetPreferredInstance();
            }

            if (preferred != null)
            {
                registryManager = RegistryManager.Instance(preferred, repoData);
            }
        }
        catch (Exception ex)
        {
            ConsoleRenderer.PrintError($"Failed to initialize CKAN: {ex.Message}");
            return 1;
        }

        // ── Print banner ──
        var instance = instanceManager.CurrentInstance;
        var installedCount = registryManager?.registry?.InstalledModules?.Count() ?? 0;
        var registryCount = 0;
        if (instance != null && registryManager != null)
        {
            try
            {
                registryCount = registryManager.registry
                    .CompatibleModules(instance.StabilityToleranceConfig, instance.VersionCriteria())
                    ?.Count() ?? 0;
            }
            catch { }
        }

        ConsoleRenderer.PrintBanner(
            instance?.Name ?? "",
            instance?.Version()?.ToString() ?? "unknown",
            installedCount,
            registryCount
        );

        // Show provider info after banner (will be set after aiClient is created below)

        // ── Create services ──
        AiClient aiClient;
        try
        {
            if (baseUrlOverride != null)
            {
                // Custom endpoint: user provided explicit base URL
                var model = modelOverride ?? "gpt-3.5-turbo";
                aiClient = new AiClient(apiKey, baseUrlOverride, model);
            }
            else
            {
                aiClient = AiClient.FromProvider(providerName, apiKey, modelOverride);
            }

            // Save provider preference for next run
            SaveSetting("provider", providerName);
        }
        catch (ArgumentException ex)
        {
            ConsoleRenderer.PrintError(ex.Message);
            return 1;
        }

        using var _ = aiClient;

        ConsoleRenderer.PrintInfo($"AI Provider: {aiClient.ProviderUrl}");
        ConsoleRenderer.PrintInfo($"AI Model:    {aiClient.ModelName}");
        Console.WriteLine();

        var executor = new ActionExecutor(
            instanceManager,
            registryManager,
            config,
            new CliUser(),
            repoData
        );

        // ── REPL loop ──
        Console.CancelKeyPress += (_, e) =>
        {
            e.Cancel = true;
            Console.WriteLine();
            ConsoleRenderer.PrintInfo("Press Ctrl+C again or type /quit to exit");
        };

        ConsoleRenderer.PrintInfo("Type a message to chat with CKAN AI, or /help for commands.");
        Console.WriteLine();

        while (true)
        {
            ConsoleRenderer.PrintPrompt();
            var input = Console.ReadLine();

            if (input == null) break; // EOF / pipe closed
            input = input.Trim();
            if (string.IsNullOrEmpty(input)) continue;

            // ── Slash commands ──
            if (input.StartsWith('/'))
            {
                var handled = await HandleSlashCommand(input, aiClient, executor, instanceManager, registryManager);
                if (!handled) break; // /quit
                continue;
            }

            // ── AI chat ──
            try
            {
                Console.WriteLine();
                var response = await aiClient.ChatStreamAsync(input, token =>
                {
                    ConsoleRenderer.PrintStreaming(token);
                });
                ConsoleRenderer.EndStreaming();

                // Execute any action commands in the response
                await executor.ExecuteActions(response);
            }
            catch (HttpRequestException ex)
            {
                Console.WriteLine();
                ConsoleRenderer.PrintError($"API error: {ex.Message}");
                ConsoleRenderer.PrintInfo("Check your API key and internet connection.");
                Console.WriteLine();
            }
            catch (Exception ex)
            {
                Console.WriteLine();
                ConsoleRenderer.PrintError($"Error: {ex.Message}");
                Console.WriteLine();
            }
        }

        ConsoleRenderer.PrintInfo("Goodbye!");
        return 0;
    }

    /// <summary>
    /// Handle slash commands. Returns false if the REPL should exit.
    /// </summary>
    private static async Task<bool> HandleSlashCommand(
        string input,
        AiClient aiClient,
        ActionExecutor executor,
        GameInstanceManager instanceManager,
        RegistryManager? registryManager)
    {
        var parts = input.Split(' ', 2, StringSplitOptions.TrimEntries);
        var cmd = parts[0].ToLowerInvariant();
        var arg = parts.Length > 1 ? parts[1] : "";

        switch (cmd)
        {
            case "/quit" or "/exit" or "/q":
                return false;

            case "/help" or "/h":
                Console.WriteLine();
                ConsoleRenderer.PrintInfo("Commands:");
                ConsoleRenderer.PrintInfo("  /help         — Show this help");
                ConsoleRenderer.PrintInfo("  /status       — Show instance info");
                ConsoleRenderer.PrintInfo("  /installed    — List installed mods");
                ConsoleRenderer.PrintInfo("  /search <q>   — Search for mods");
                ConsoleRenderer.PrintInfo("  /install <id> — Install a mod");
                ConsoleRenderer.PrintInfo("  /remove <id>  — Uninstall a mod");
                ConsoleRenderer.PrintInfo("  /refresh      — Refresh mod repository");
                ConsoleRenderer.PrintInfo("  /providers    — List available AI providers");
                ConsoleRenderer.PrintInfo("  /clear        — Clear chat history");
                ConsoleRenderer.PrintInfo("  /quit         — Exit");
                Console.WriteLine();
                ConsoleRenderer.PrintInfo("CLI Flags:");
                ConsoleRenderer.PrintInfo("  --api-key <key>         Set API key");
                ConsoleRenderer.PrintInfo("  --provider <name>       Set AI provider (siliconflow, openai, deepseek, openrouter, custom)");
                ConsoleRenderer.PrintInfo("  --model <model>         Override model name");
                ConsoleRenderer.PrintInfo("  --base-url <url>        Custom OpenAI-compatible endpoint URL");
                ConsoleRenderer.PrintInfo("  --debug                 Enable debug logging");
                Console.WriteLine();
                ConsoleRenderer.PrintInfo("How to install the 'ckan' command:");
                ConsoleRenderer.PrintInfo("  Run: CKAN-CLI.exe --install");
                ConsoleRenderer.PrintInfo("  Then open a new CMD and type: ckan");
                Console.WriteLine();
                return true;

            case "/status":
                var inst = instanceManager.CurrentInstance;
                var count = registryManager?.registry?.InstalledModules?.Count() ?? 0;
                Console.WriteLine();
                if (inst != null)
                {
                    ConsoleRenderer.PrintInfo($"Instance: {inst.Name} ({inst.Version()})");
                    ConsoleRenderer.PrintInfo($"Path: {inst.GameDir}");
                    ConsoleRenderer.PrintInfo($"Installed: {count} mods");
                }
                else
                {
                    ConsoleRenderer.PrintWarning("No active game instance");
                }
                Console.WriteLine();
                return true;

            case "/installed" or "/list":
                Console.WriteLine();
                executor.ListInstalled();
                return true;

            case "/search" or "/find":
                if (string.IsNullOrEmpty(arg))
                {
                    ConsoleRenderer.PrintError("Usage: /search <query>");
                }
                else
                {
                    executor.ExecuteSearch(arg);
                }
                return true;

            case "/install":
                if (string.IsNullOrEmpty(arg))
                {
                    ConsoleRenderer.PrintError("Usage: /install <ModIdentifier>");
                }
                else
                {
                    await executor.ExecuteInstall(arg);
                }
                return true;

            case "/remove" or "/uninstall":
                if (string.IsNullOrEmpty(arg))
                {
                    ConsoleRenderer.PrintError("Usage: /remove <ModIdentifier>");
                }
                else
                {
                    await executor.ExecuteUninstall(arg);
                }
                return true;

            case "/refresh":
                await executor.ExecuteRefresh();
                return true;

            case "/clear":
                aiClient.ClearHistory();
                ConsoleRenderer.PrintSuccess("Chat history cleared");
                return true;

            case "/key":
                if (string.IsNullOrEmpty(arg))
                {
                    ConsoleRenderer.PrintError("Usage: /key <api-key>");
                }
                else
                {
                    SaveApiKey(arg);
                    ConsoleRenderer.PrintSuccess("API key saved");
                }
                return true;

            case "/providers":
                Console.WriteLine();
                ConsoleRenderer.PrintInfo("Available AI Providers:");
                ConsoleRenderer.PrintInfo("  (use --provider <name> when starting CKAN-CLI)");
                Console.WriteLine();
                foreach (var (key, preset) in AiClient.Providers)
                {
                    if (key == "custom")
                    {
                        ConsoleRenderer.PrintInfo($"  {key,-16} {preset.Label}");
                        ConsoleRenderer.PrintInfo($"  {"",16} Requires: --base-url <url> --model <model>");
                    }
                    else
                    {
                        ConsoleRenderer.PrintInfo($"  {key,-16} {preset.Label}");
                        ConsoleRenderer.PrintInfo($"  {"",16} Default model: {preset.DefaultModel}");
                    }
                }
                Console.WriteLine();
                ConsoleRenderer.PrintInfo($"Current: {aiClient.ProviderUrl} / {aiClient.ModelName}");
                Console.WriteLine();
                return true;

            default:
                ConsoleRenderer.PrintError($"Unknown command: {cmd}. Type /help for options.");
                return true;
        }
    }

    private static string? ResolveApiKey(string[] args)
    {
        // 1. --api-key flag
        for (int i = 0; i < args.Length - 1; i++)
        {
            if (args[i] == "--api-key" || args[i] == "-k")
            {
                var key = args[i + 1];
                SaveApiKey(key);
                return key;
            }
        }

        // 2. Environment variable
        var envKey = Environment.GetEnvironmentVariable("CKAN_AI_KEY");
        if (!string.IsNullOrWhiteSpace(envKey)) return envKey;

        // 3. Config file
        var configPath = GetKeyFilePath();
        if (File.Exists(configPath))
        {
            var saved = File.ReadAllText(configPath).Trim();
            if (!string.IsNullOrWhiteSpace(saved)) return saved;
        }

        return null;
    }

    private static void SaveApiKey(string key)
    {
        try
        {
            var dir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                CONFIG_DIR);
            Directory.CreateDirectory(dir);
            File.WriteAllText(Path.Combine(dir, KEY_FILE), key.Trim());
        }
        catch { /* best effort */ }
    }

    private static string GetKeyFilePath()
    {
        return Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            CONFIG_DIR,
            KEY_FILE);
    }

    private static string? ResolveArg(string[] args, string longFlag, string shortFlag)
    {
        for (int i = 0; i < args.Length - 1; i++)
        {
            if (args[i] == longFlag || args[i] == shortFlag)
                return args[i + 1];
        }
        return null;
    }

    private static string? LoadSavedSetting(string name)
    {
        try
        {
            var path = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                CONFIG_DIR,
                $"ai_{name}.txt");
            if (File.Exists(path))
            {
                var val = File.ReadAllText(path).Trim();
                if (!string.IsNullOrWhiteSpace(val)) return val;
            }
        }
        catch { }
        return null;
    }

    private static void SaveSetting(string name, string value)
    {
        try
        {
            var dir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                CONFIG_DIR);
            Directory.CreateDirectory(dir);
            File.WriteAllText(Path.Combine(dir, $"ai_{name}.txt"), value.Trim());
        }
        catch { }
    }

    // ── Install / Uninstall to system PATH ──

    private const string BIN_DIR = "bin";
    private const string CMD_NAME = "ckan";

    private static string GetBinDir()
    {
        return Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            CONFIG_DIR,
            BIN_DIR);
    }

    private static int InstallToPath()
    {
        try
        {
            var binDir = GetBinDir();
            Directory.CreateDirectory(binDir);

            var currentExe = Environment.ProcessPath
                ?? System.Reflection.Assembly.GetExecutingAssembly().Location;

            if (string.IsNullOrEmpty(currentExe))
            {
                ConsoleRenderer.PrintError("Cannot determine current executable path.");
                return 1;
            }

            var targetExe = Path.Combine(binDir, $"{CMD_NAME}.exe");

            // Copy the exe
            ConsoleRenderer.PrintInfo($"Copying to {targetExe}...");
            File.Copy(currentExe, targetExe, overwrite: true);

            // Add to user PATH if not already there
            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                var userPath = Environment.GetEnvironmentVariable("PATH",
                    EnvironmentVariableTarget.User) ?? "";

                if (!userPath.Split(';').Any(p =>
                    p.Trim().Equals(binDir, StringComparison.OrdinalIgnoreCase)))
                {
                    var newPath = string.IsNullOrWhiteSpace(userPath)
                        ? binDir
                        : $"{userPath};{binDir}";
                    Environment.SetEnvironmentVariable("PATH", newPath,
                        EnvironmentVariableTarget.User);
                    ConsoleRenderer.PrintInfo($"Added {binDir} to user PATH.");
                }
                else
                {
                    ConsoleRenderer.PrintInfo("PATH already contains the install directory.");
                }
            }

            Console.WriteLine();
            ConsoleRenderer.PrintSuccess("Installed successfully!");
            Console.WriteLine();
            ConsoleRenderer.PrintInfo("Open a NEW Command Prompt window, then type:");
            Console.WriteLine();
            ConsoleRenderer.PrintInfo("  ckan --api-key <your-key>       (first time)");
            ConsoleRenderer.PrintInfo("  ckan                            (after key is saved)");
            Console.WriteLine();
            ConsoleRenderer.PrintInfo("To uninstall: ckan --uninstall");
            Console.WriteLine();
            return 0;
        }
        catch (Exception ex)
        {
            ConsoleRenderer.PrintError($"Install failed: {ex.Message}");
            return 1;
        }
    }

    private static int UninstallFromPath()
    {
        try
        {
            var binDir = GetBinDir();
            var targetExe = Path.Combine(binDir, $"{CMD_NAME}.exe");

            if (File.Exists(targetExe))
            {
                File.Delete(targetExe);
                ConsoleRenderer.PrintInfo($"Removed {targetExe}");
            }

            // Remove from user PATH
            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                var userPath = Environment.GetEnvironmentVariable("PATH",
                    EnvironmentVariableTarget.User) ?? "";
                var parts = userPath.Split(';')
                    .Where(p => !p.Trim().Equals(binDir, StringComparison.OrdinalIgnoreCase))
                    .ToArray();
                Environment.SetEnvironmentVariable("PATH", string.Join(';', parts),
                    EnvironmentVariableTarget.User);
            }

            Console.WriteLine();
            ConsoleRenderer.PrintSuccess("Uninstalled. The 'ckan' command has been removed.");
            Console.WriteLine();
            return 0;
        }
        catch (Exception ex)
        {
            ConsoleRenderer.PrintError($"Uninstall failed: {ex.Message}");
            return 1;
        }
    }

    private static void PrintUsage()
    {
        Console.WriteLine();
        ConsoleRenderer.PrintInfo("CKAN AI CLI — AI-powered KSP mod manager");
        Console.WriteLine();
        ConsoleRenderer.PrintInfo("Usage:");
        ConsoleRenderer.PrintInfo("  ckan [options]");
        Console.WriteLine();
        ConsoleRenderer.PrintInfo("Quick Start:");
        ConsoleRenderer.PrintInfo("  CKAN-CLI.exe --install                 Install 'ckan' command to PATH");
        ConsoleRenderer.PrintInfo("  ckan --api-key <key>                   Start with your API key");
        ConsoleRenderer.PrintInfo("  ckan                                   Start (after key is saved)");
        Console.WriteLine();
        ConsoleRenderer.PrintInfo("Options:");
        ConsoleRenderer.PrintInfo("  --install                Install 'ckan' command to PATH (one-time setup)");
        ConsoleRenderer.PrintInfo("  --uninstall              Remove 'ckan' command from PATH");
        ConsoleRenderer.PrintInfo("  --api-key, -k <key>      API key for your AI provider");
        ConsoleRenderer.PrintInfo("  --provider, -p <name>    AI provider preset (default: siliconflow)");
        ConsoleRenderer.PrintInfo("  --model, -m <model>      Override the default model for the provider");
        ConsoleRenderer.PrintInfo("  --base-url, -u <url>     Custom OpenAI-compatible API base URL");
        ConsoleRenderer.PrintInfo("  --debug                  Enable debug logging");
        ConsoleRenderer.PrintInfo("  --help, -h               Show this help");
        Console.WriteLine();
        ConsoleRenderer.PrintInfo("Providers:");
        foreach (var (key, preset) in AiClient.Providers)
        {
            if (key == "custom") continue;
            ConsoleRenderer.PrintInfo($"  {key,-16} {preset.Label,-24} {preset.DefaultModel}");
        }
        ConsoleRenderer.PrintInfo($"  {"custom",-16} {"Custom Endpoint",-24} (requires --base-url)");
        Console.WriteLine();
        ConsoleRenderer.PrintInfo("Examples:");
        ConsoleRenderer.PrintInfo("  ckan --api-key sk-xxx");
        ConsoleRenderer.PrintInfo("  ckan --api-key sk-xxx --provider openai");
        ConsoleRenderer.PrintInfo("  ckan --api-key sk-xxx --provider deepseek --model deepseek-reasoner");
        ConsoleRenderer.PrintInfo("  ckan --api-key sk-xxx --base-url https://my-llm.com/v1 --model my-model");
        Console.WriteLine();
        ConsoleRenderer.PrintInfo("Environment variables:");
        ConsoleRenderer.PrintInfo("  CKAN_AI_KEY              API key (alternative to --api-key)");
        Console.WriteLine();
    }
}
