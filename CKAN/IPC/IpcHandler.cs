using Newtonsoft.Json.Linq;

namespace CKAN.Modern.IPC;

/// <summary>
/// Routes IPC channels to actual CKAN Core methods.
/// This is the glue between the React frontend and the C# backend.
/// </summary>
public sealed class IpcHandler : IDisposable
{
    // TODO: These will be initialized with actual CKAN Core objects
    // private RegistryManager? _registryManager;
    // private GameInstanceManager? _instanceManager;

    public async Task<object?> HandleAsync(IpcRequest request)
    {
        return request.Channel switch
        {
            // ─── Mod Operations ───
            "mod:search"          => await HandleModSearch(request.Args),
            "mod:list-installed"  => await HandleModListInstalled(request.Args),
            "mod:get-details"     => await HandleModGetDetails(request.Args),
            "mod:install"         => await HandleModInstall(request.Args),
            "mod:uninstall"       => await HandleModUninstall(request.Args),

            // ─── Game Instance Operations ───
            "game:list-instances" => await HandleListInstances(request.Args),
            "game:set-active"     => await HandleSetActiveInstance(request.Args),

            // ─── AI Operations ───
            "ai:chat"             => await HandleAiChat(request.Args),
            "ai:points-balance"   => await HandleAiPointsBalance(request.Args),

            // ─── Auth ───
            "auth:login"          => await HandleAuthLogin(request.Args),
            "auth:logout"         => await HandleAuthLogout(request.Args),
            "auth:get-user"       => await HandleAuthGetUser(request.Args),

            // ─── Dispatch ───
            "dispatch:pair"       => await HandleDispatchPair(request.Args),
            "dispatch:send-command" => await HandleDispatchSendCommand(request.Args),
            "dispatch:status"     => await HandleDispatchStatus(request.Args),

            // ─── App ───
            "app:get-version"     => HandleGetVersion(),
            "app:minimize"        => HandleMinimize(),
            "app:maximize"        => HandleMaximize(),
            "app:close"           => HandleClose(),

            _ => throw new InvalidOperationException($"Unknown IPC channel: {request.Channel}")
        };
    }

    // ═══════════════════════════════════════════════════════════
    //  MOD OPERATIONS — Wired to CKAN Core
    // ═══════════════════════════════════════════════════════════

    private Task<object?> HandleModSearch(JToken? args)
    {
        var query = args?["query"]?.ToString() ?? "";
        // TODO: Wire to CKAN Core registry search
        // var registry = _registryManager.registry;
        // var results = registry.Search(query);
        return Task.FromResult<object?>(new { mods = Array.Empty<object>(), query });
    }

    private Task<object?> HandleModListInstalled(JToken? args)
    {
        // TODO: Wire to CKAN Core
        // var installed = _registryManager.registry.InstalledModules;
        return Task.FromResult<object?>(new { mods = Array.Empty<object>() });
    }

    private Task<object?> HandleModGetDetails(JToken? args)
    {
        var identifier = args?["identifier"]?.ToString() ?? "";
        // TODO: Wire to CKAN Core
        // var mod = _registryManager.registry.GetModuleByIdentifier(identifier);
        return Task.FromResult<object?>(new { identifier, found = false });
    }

    private Task<object?> HandleModInstall(JToken? args)
    {
        var identifier = args?["identifier"]?.ToString() ?? "";
        // TODO: Wire to CKAN Core ModuleInstaller
        // ModuleInstaller.GetInstance(...).InstallList(...)
        return Task.FromResult<object?>(new { identifier, status = "queued" });
    }

    private Task<object?> HandleModUninstall(JToken? args)
    {
        var identifier = args?["identifier"]?.ToString() ?? "";
        // TODO: Wire to CKAN Core ModuleInstaller
        return Task.FromResult<object?>(new { identifier, status = "queued" });
    }

    // ═══════════════════════════════════════════════════════════
    //  GAME INSTANCE OPERATIONS
    // ═══════════════════════════════════════════════════════════

    private Task<object?> HandleListInstances(JToken? args)
    {
        // TODO: Wire to GameInstanceManager
        // var instances = _instanceManager.Instances;
        return Task.FromResult<object?>(new { instances = Array.Empty<object>() });
    }

    private Task<object?> HandleSetActiveInstance(JToken? args)
    {
        var name = args?["name"]?.ToString() ?? "";
        // TODO: Wire to GameInstanceManager.SetCurrentInstance(name)
        return Task.FromResult<object?>(new { name, active = true });
    }

    // ═══════════════════════════════════════════════════════════
    //  AI OPERATIONS — Silicon Flow integration
    // ═══════════════════════════════════════════════════════════

    private Task<object?> HandleAiChat(JToken? args)
    {
        var message = args?["message"]?.ToString() ?? "";
        // TODO: Wire to Silicon Flow API via Supabase Edge Function
        return Task.FromResult<object?>(new
        {
            reply = $"[AI placeholder] You said: {message}",
            points = 100
        });
    }

    private Task<object?> HandleAiPointsBalance(JToken? args)
    {
        // TODO: Fetch from Supabase
        return Task.FromResult<object?>(new { balance = 100, tier = "free" });
    }

    // ═══════════════════════════════════════════════════════════
    //  AUTH — Supabase Auth
    // ═══════════════════════════════════════════════════════════

    private Task<object?> HandleAuthLogin(JToken? args)
    {
        // TODO: Wire to Supabase Auth
        return Task.FromResult<object?>(new { loggedIn = false, message = "Auth not configured" });
    }

    private Task<object?> HandleAuthLogout(JToken? args)
    {
        return Task.FromResult<object?>(new { loggedOut = true });
    }

    private Task<object?> HandleAuthGetUser(JToken? args)
    {
        return Task.FromResult<object?>(null);
    }

    // ═══════════════════════════════════════════════════════════
    //  DISPATCH — Remote AI command execution
    // ═══════════════════════════════════════════════════════════

    private Task<object?> HandleDispatchPair(JToken? args)
    {
        // TODO: Generate 6-digit code, register with Supabase
        var code = new Random().Next(100000, 999999).ToString();
        return Task.FromResult<object?>(new { code, expires_in = 300 });
    }

    private Task<object?> HandleDispatchSendCommand(JToken? args)
    {
        var command = args?["command"]?.ToString() ?? "";
        return Task.FromResult<object?>(new { command, status = "received" });
    }

    private Task<object?> HandleDispatchStatus(JToken? args)
    {
        return Task.FromResult<object?>(new { paired = false, node_online = true });
    }

    // ═══════════════════════════════════════════════════════════
    //  APP OPERATIONS
    // ═══════════════════════════════════════════════════════════

    private object HandleGetVersion()
    {
        return new
        {
            version = "2.0.0-dev",
            build = "modern",
            runtime = System.Runtime.InteropServices.RuntimeInformation.FrameworkDescription
        };
    }

    private object? HandleMinimize()
    {
        System.Windows.Application.Current.Dispatcher.Invoke(() =>
        {
            System.Windows.Application.Current.MainWindow!.WindowState = System.Windows.WindowState.Minimized;
        });
        return null;
    }

    private object? HandleMaximize()
    {
        System.Windows.Application.Current.Dispatcher.Invoke(() =>
        {
            var win = System.Windows.Application.Current.MainWindow!;
            win.WindowState = win.WindowState == System.Windows.WindowState.Maximized
                ? System.Windows.WindowState.Normal
                : System.Windows.WindowState.Maximized;
        });
        return null;
    }

    private object? HandleClose()
    {
        System.Windows.Application.Current.Dispatcher.Invoke(() =>
        {
            System.Windows.Application.Current.Shutdown();
        });
        return null;
    }

    public void Dispose()
    {
        // Cleanup resources
    }
}
