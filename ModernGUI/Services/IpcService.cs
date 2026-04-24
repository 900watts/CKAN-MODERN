using log4net;
using Newtonsoft.Json.Linq;

using CKAN.Configuration;
using CKAN.Games.KerbalSpaceProgram;
using CKAN.IO;
using CKAN.Versioning;

namespace CKAN.Modern.IPC;

/// <summary>
/// Routes IPC channels to actual CKAN Core methods.
/// This is the glue between the React frontend and the C# backend.
/// </summary>
public sealed class IpcHandler : IDisposable
{
    private static readonly ILog log = LogManager.GetLogger(typeof(IpcHandler));

    private readonly IConfiguration _config;
    private readonly ModernUser _user;
    private readonly RepositoryDataManager _repoData;
    private GameInstanceManager? _instanceManager;
    private RegistryManager? _registryManager;

    /// <summary>
    /// Event fired when we want to push a message to the frontend.
    /// The IpcBridge subscribes to this to forward events.
    /// </summary>
    public event Action<string, object>? PushEvent;

    public IpcHandler()
    {
        _config = new JsonConfiguration();

        _user = new ModernUser(
            onProgress: (msg, pct) => PushEvent?.Invoke("progress", new { message = msg, percent = pct }),
            onMessage:  (msg) => PushEvent?.Invoke("log", new { message = msg }),
            onError:    (msg) => PushEvent?.Invoke("error", new { message = msg })
        );

        _repoData = new RepositoryDataManager();

        // Initialize the game instance manager
        try
        {
            _instanceManager = new GameInstanceManager(_user, _config);

            // Try to get the preferred (auto-start) instance
            var preferred = _instanceManager.GetPreferredInstance();
            if (preferred == null)
            {
                // Try auto-detecting game instances
                _instanceManager.FindAndRegisterDefaultInstances();
                preferred = _instanceManager.GetPreferredInstance();
            }

            if (preferred != null)
            {
                InitRegistryForInstance(preferred);
            }

            log.Info($"[IPC] Initialized with {_instanceManager.Instances.Count} game instance(s)");
        }
        catch (Exception ex)
        {
            log.Error("[IPC] Failed to initialize GameInstanceManager", ex);
        }
    }

    private void InitRegistryForInstance(GameInstance instance)
    {
        try
        {
            _registryManager?.Dispose();
            _registryManager = RegistryManager.Instance(instance, _repoData);
            log.Info($"[IPC] Registry loaded for instance: {instance.Name}");
        }
        catch (Exception ex)
        {
            log.Error($"[IPC] Failed to load registry for {instance.Name}", ex);
            _registryManager = null;
        }
    }

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
            "mod:scan-gamedata"   => await HandleScanGameData(request.Args),
            "mod:check-updates"   => await HandleCheckUpdates(request.Args),

            // ─── Game Instance Operations ───
            "game:list-instances" => await HandleListInstances(request.Args),
            "game:add-instance"   => await HandleAddInstance(request.Args),
            "game:remove-instance" => await HandleRemoveInstance(request.Args),
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
            "app:browse-folder"   => await HandleBrowseFolder(request.Args),

            _ => throw new InvalidOperationException($"Unknown IPC channel: {request.Channel}")
        };
    }

    // ═══════════════════════════════════════════════════════════
    //  MOD OPERATIONS — Wired to CKAN Core
    // ═══════════════════════════════════════════════════════════

    private Task<object?> HandleModSearch(JToken? args)
    {
        var query = args?["query"]?.ToString() ?? "";
        var instance = _instanceManager?.CurrentInstance;

        if (instance == null || _registryManager == null)
        {
            return Task.FromResult<object?>(new { mods = Array.Empty<object>(), query, error = "No active game instance" });
        }

        var registry = _registryManager.registry;
        var gameVersion = instance.VersionCriteria();
        var stabilityTolerance = instance.StabilityToleranceConfig;

        // Get all compatible mods
        var compatible = registry.CompatibleModules(stabilityTolerance, gameVersion).ToList();

        // Filter by search query
        if (!string.IsNullOrWhiteSpace(query))
        {
            var q = query.ToLowerInvariant();
            compatible = compatible.Where(m =>
                m.name.Contains(q, StringComparison.OrdinalIgnoreCase) ||
                m.identifier.Contains(q, StringComparison.OrdinalIgnoreCase) ||
                (m.@abstract?.Contains(q, StringComparison.OrdinalIgnoreCase) ?? false) ||
                (m.description?.Contains(q, StringComparison.OrdinalIgnoreCase) ?? false)
            ).ToList();
        }

        var mods = compatible.Take(200).Select(m => ModToDto(m, registry)).ToArray();

        return Task.FromResult<object?>(new { mods, query, total = compatible.Count });
    }

    private Task<object?> HandleModListInstalled(JToken? args)
    {
        if (_registryManager == null)
        {
            return Task.FromResult<object?>(new { mods = Array.Empty<object>() });
        }

        var registry = _registryManager.registry;
        var mods = registry.InstalledModules
            .Select(im => ModToDto(im.Module, registry, im.AutoInstalled))
            .ToArray();

        return Task.FromResult<object?>(new { mods });
    }

    private Task<object?> HandleModGetDetails(JToken? args)
    {
        var identifier = args?["identifier"]?.ToString() ?? "";

        if (_registryManager == null || string.IsNullOrEmpty(identifier))
        {
            return Task.FromResult<object?>(new { identifier, found = false });
        }

        var registry = _registryManager.registry;
        var instance = _instanceManager?.CurrentInstance;
        var gameVersion = instance?.VersionCriteria();
        var stabilityTolerance = instance?.StabilityToleranceConfig
            ?? new StabilityToleranceConfig("");

        var mod = gameVersion != null
            ? registry.LatestAvailable(identifier, stabilityTolerance, gameVersion)
            : null;

        // Fallback: try to find any version
        if (mod == null)
        {
            mod = registry.AvailableByIdentifier(identifier).FirstOrDefault();
        }

        // Also check if it's installed
        if (mod == null)
        {
            mod = registry.GetInstalledVersion(identifier);
        }

        if (mod == null)
        {
            return Task.FromResult<object?>(new { identifier, found = false });
        }

        var installed = registry.InstalledModule(identifier);
        return Task.FromResult<object?>(new
        {
            found = true,
            mod = ModToDto(mod, registry, installed?.AutoInstalled ?? false),
            installed = installed != null,
            files = installed?.Files?.ToArray() ?? Array.Empty<string>()
        });
    }

    private async Task<object?> HandleModInstall(JToken? args)
    {
        var identifier = args?["identifier"]?.ToString() ?? "";
        var instance = _instanceManager?.CurrentInstance;

        if (instance == null || _registryManager == null || string.IsNullOrEmpty(identifier))
        {
            return new { identifier, status = "error", error = "No active game instance" };
        }

        return await Task.Run(() =>
        {
            try
            {
                var registry = _registryManager.registry;
                var gameVersion = instance.VersionCriteria();
                var stabilityTolerance = instance.StabilityToleranceConfig;

                var mod = registry.LatestAvailable(identifier, stabilityTolerance, gameVersion);
                if (mod == null)
                {
                    return (object)new { identifier, status = "error", error = $"Module {identifier} not found or incompatible" };
                }

                var cache = _instanceManager!.Cache;
                if (cache == null)
                {
                    return new { identifier, status = "error", error = "Download cache not configured" };
                }

                var installer = new ModuleInstaller(instance, cache, _config, _user);
                var options = RelationshipResolverOptions.DependsOnlyOpts(stabilityTolerance);

                HashSet<string>? possibleConfigOnlyDirs = null;

                PushEvent?.Invoke("install:start", new { identifier, name = mod.name });

                installer.InstallList(
                    new[] { mod },
                    options,
                    _registryManager,
                    ref possibleConfigOnlyDirs,
                    userAgent: "CKAN-Modern/2.0",
                    ConfirmPrompt: false
                );

                PushEvent?.Invoke("install:complete", new { identifier, name = mod.name, status = "success" });

                return new { identifier, status = "installed", name = mod.name };
            }
            catch (Exception ex)
            {
                log.Error($"[IPC] Install failed for {identifier}", ex);
                PushEvent?.Invoke("install:error", new { identifier, error = ex.Message });
                return (object)new { identifier, status = "error", error = ex.Message };
            }
        });
    }

    private async Task<object?> HandleModUninstall(JToken? args)
    {
        var identifier = args?["identifier"]?.ToString() ?? "";
        var instance = _instanceManager?.CurrentInstance;

        if (instance == null || _registryManager == null || string.IsNullOrEmpty(identifier))
        {
            return new { identifier, status = "error", error = "No active game instance" };
        }

        return await Task.Run(() =>
        {
            try
            {
                var cache = _instanceManager!.Cache;
                if (cache == null)
                {
                    return (object)new { identifier, status = "error", error = "Download cache not configured" };
                }

                var installer = new ModuleInstaller(instance, cache, _config, _user);
                HashSet<string>? possibleConfigOnlyDirs = null;

                PushEvent?.Invoke("uninstall:start", new { identifier });

                installer.UninstallList(
                    new[] { identifier },
                    ref possibleConfigOnlyDirs,
                    _registryManager,
                    ConfirmPrompt: false
                );

                PushEvent?.Invoke("uninstall:complete", new { identifier, status = "success" });

                return new { identifier, status = "removed" };
            }
            catch (Exception ex)
            {
                log.Error($"[IPC] Uninstall failed for {identifier}", ex);
                PushEvent?.Invoke("uninstall:error", new { identifier, error = ex.Message });
                return (object)new { identifier, status = "error", error = ex.Message };
            }
        });
    }

    // ═══════════════════════════════════════════════════════════
    //  MOD UPDATE CHECKING — Compare installed vs latest available
    // ═══════════════════════════════════════════════════════════

    private Task<object?> HandleCheckUpdates(JToken? args)
    {
        var instance = _instanceManager?.CurrentInstance;
        if (instance == null || _registryManager == null)
        {
            return Task.FromResult<object?>(new { updates = Array.Empty<object>(), error = "No active game instance" });
        }

        var registry = _registryManager.registry;
        var gameVersion = instance.VersionCriteria();
        var stabilityTolerance = instance.StabilityToleranceConfig;
        var updates = new List<object>();

        foreach (var installed in registry.InstalledModules)
        {
            try
            {
                var latest = registry.LatestAvailable(installed.Module.identifier, stabilityTolerance, gameVersion);
                if (latest != null && latest.version != null && installed.Module.version != null
                    && latest.version.IsGreaterThan(installed.Module.version))
                {
                    updates.Add(new
                    {
                        identifier = installed.Module.identifier,
                        name = installed.Module.name,
                        installed_version = installed.Module.version.ToString(),
                        latest_version = latest.version.ToString(),
                        download_size = latest.download_size,
                        auto_installed = installed.AutoInstalled,
                    });
                }
            }
            catch
            {
                // Skip mods that fail version comparison
            }
        }

        return Task.FromResult<object?>(new { updates = updates.ToArray(), count = updates.Count });
    }

    // ═══════════════════════════════════════════════════════════
    //  GAME DATA SCANNING — Detect manually installed mods
    // ═══════════════════════════════════════════════════════════

    /// <summary>
    /// Scan the GameData folder to detect mods not managed by CKAN.
    /// CKAN installs mods by extracting them into GameData/ according to
    /// install stanzas in the .ckan metadata file. Manually installed mods
    /// are folders in GameData/ that aren't tracked by the CKAN registry.
    /// </summary>
    private Task<object?> HandleScanGameData(JToken? args)
    {
        var instance = _instanceManager?.CurrentInstance;

        if (instance == null || _registryManager == null)
        {
            return Task.FromResult<object?>(new { mods = Array.Empty<object>(), scanned = false, error = "No active game instance" });
        }

        try
        {
            var registry = _registryManager.registry;
            var gameDataPath = System.IO.Path.Combine(instance.GameDir, "GameData");

            if (!System.IO.Directory.Exists(gameDataPath))
            {
                return Task.FromResult<object?>(new { mods = Array.Empty<object>(), scanned = true });
            }

            // Get all CKAN-managed file paths (normalized)
            var managedFiles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var installed in registry.InstalledModules)
            {
                foreach (var file in installed.Files)
                {
                    managedFiles.Add(file.Replace('/', System.IO.Path.DirectorySeparatorChar));
                }
            }

            // Scan top-level directories in GameData
            var unmanagedMods = new List<object>();
            var skipDirs = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "Squad", "SquadExpansion", // Stock KSP directories
            };

            foreach (var dir in System.IO.Directory.GetDirectories(gameDataPath))
            {
                var dirName = System.IO.Path.GetFileName(dir);
                if (skipDirs.Contains(dirName)) continue;

                // Check if this folder is managed by CKAN
                var relativePath = $"GameData{System.IO.Path.DirectorySeparatorChar}{dirName}";
                var isManaged = managedFiles.Any(f =>
                    f.StartsWith(relativePath, StringComparison.OrdinalIgnoreCase));

                if (!isManaged)
                {
                    // Count files and get size
                    var files = System.IO.Directory.GetFiles(dir, "*", System.IO.SearchOption.AllDirectories);
                    var totalSize = files.Sum(f => new System.IO.FileInfo(f).Length);

                    unmanagedMods.Add(new
                    {
                        folder = dirName,
                        path = dir,
                        file_count = files.Length,
                        size = totalSize,
                        managed = false,
                    });
                }
            }

            // Also return CKAN-managed mods for comparison
            var ckanMods = registry.InstalledModules.Select(im => new
            {
                identifier = im.Module.identifier,
                name = im.Module.name,
                version = im.Module.version?.ToString(),
                managed = true,
                auto_installed = im.AutoInstalled,
            }).ToArray();

            return Task.FromResult<object?>(new
            {
                unmanaged = unmanagedMods.ToArray(),
                managed = ckanMods,
                game_data_path = gameDataPath,
                scanned = true,
            });
        }
        catch (Exception ex)
        {
            log.Error("[IPC] GameData scan failed", ex);
            return Task.FromResult<object?>(new { mods = Array.Empty<object>(), scanned = false, error = ex.Message });
        }
    }

    // ═══════════════════════════════════════════════════════════

    private Task<object?> HandleListInstances(JToken? args)
    {
        if (_instanceManager == null)
        {
            return Task.FromResult<object?>(new { instances = Array.Empty<object>() });
        }

        var currentName = _instanceManager.CurrentInstance?.Name;
        var instances = _instanceManager.Instances.Select(kvp => new
        {
            name = kvp.Key,
            path = kvp.Value.GameDir,
            valid = kvp.Value.Valid,
            version = kvp.Value.Version()?.ToString() ?? "unknown",
            game = kvp.Value.Game.ShortName,
            active = kvp.Key == currentName
        }).ToArray();

        return Task.FromResult<object?>(new { instances });
    }

    private Task<object?> HandleAddInstance(JToken? args)
    {
        var name = args?["name"]?.ToString() ?? "";
        var path = args?["path"]?.ToString() ?? "";

        if (_instanceManager == null)
        {
            return Task.FromResult<object?>(new { success = false, error = "Instance manager not initialized" });
        }

        if (string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(path))
        {
            return Task.FromResult<object?>(new { success = false, error = "Name and path are required" });
        }

        try
        {
            var instance = _instanceManager.AddInstance(path, name, _user);
            if (instance != null)
            {
                _instanceManager.SetCurrentInstance(name);
                InitRegistryForInstance(instance);
                return Task.FromResult<object?>(new { success = true, name, path });
            }
            return Task.FromResult<object?>(new { success = false, error = "Could not create instance — invalid game directory" });
        }
        catch (Exception ex)
        {
            return Task.FromResult<object?>(new { success = false, error = ex.Message });
        }
    }

    private Task<object?> HandleRemoveInstance(JToken? args)
    {
        var name = args?["name"]?.ToString() ?? "";

        if (_instanceManager == null || string.IsNullOrWhiteSpace(name))
        {
            return Task.FromResult<object?>(new { success = false, error = "Invalid instance name" });
        }

        try
        {
            _instanceManager.RemoveInstance(name);
            return Task.FromResult<object?>(new { success = true, name });
        }
        catch (Exception ex)
        {
            return Task.FromResult<object?>(new { success = false, error = ex.Message });
        }
    }

    private Task<object?> HandleSetActiveInstance(JToken? args)
    {
        var name = args?["name"]?.ToString() ?? "";

        if (_instanceManager == null || string.IsNullOrWhiteSpace(name))
        {
            return Task.FromResult<object?>(new { active = false, error = "Invalid instance name" });
        }

        try
        {
            _instanceManager.SetCurrentInstance(name);
            var instance = _instanceManager.CurrentInstance;
            if (instance != null)
            {
                InitRegistryForInstance(instance);
            }
            return Task.FromResult<object?>(new { name, active = true });
        }
        catch (Exception ex)
        {
            return Task.FromResult<object?>(new { name, active = false, error = ex.Message });
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  AI OPERATIONS — Handled in frontend (Silicon Flow)
    // ═══════════════════════════════════════════════════════════

    private Task<object?> HandleAiChat(JToken? args)
    {
        // AI chat is handled entirely in the React frontend via Silicon Flow API.
        // This channel is reserved for future server-side AI features.
        var message = args?["message"]?.ToString() ?? "";
        return Task.FromResult<object?>(new
        {
            reply = "AI chat is handled in the frontend. This IPC channel is reserved for future use.",
            points = 100
        });
    }

    private Task<object?> HandleAiPointsBalance(JToken? args)
    {
        return Task.FromResult<object?>(new { balance = 100, tier = "free" });
    }

    // ═══════════════════════════════════════════════════════════
    //  AUTH — Handled in frontend (Supabase JS SDK)
    // ═══════════════════════════════════════════════════════════

    private Task<object?> HandleAuthLogin(JToken? args)
    {
        return Task.FromResult<object?>(new { loggedIn = false, message = "Auth handled in frontend via Supabase JS" });
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
    //  DISPATCH — Remote AI command execution (future)
    // ═══════════════════════════════════════════════════════════

    private Task<object?> HandleDispatchPair(JToken? args)
    {
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
            runtime = System.Runtime.InteropServices.RuntimeInformation.FrameworkDescription,
            instances = _instanceManager?.Instances.Count ?? 0,
            activeInstance = _instanceManager?.CurrentInstance?.Name
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

    private Task<object?> HandleBrowseFolder(JToken? args)
    {
        var title = args?["title"]?.ToString() ?? "Select Game Folder";
        string? selectedPath = null;

        // Must run on the UI thread since it opens a dialog
        System.Windows.Application.Current.Dispatcher.Invoke(() =>
        {
            var dialog = new Microsoft.Win32.OpenFolderDialog
            {
                Title = title,
                Multiselect = false,
            };

            if (dialog.ShowDialog() == true)
            {
                selectedPath = dialog.FolderName;
            }
        });

        if (selectedPath != null)
        {
            return Task.FromResult<object?>(new { selected = true, path = selectedPath });
        }
        return Task.FromResult<object?>(new { selected = false, path = (string?)null });
    }

    // ═══════════════════════════════════════════════════════════
    //  HELPERS
    // ═══════════════════════════════════════════════════════════

    /// <summary>
    /// Convert a CkanModule to a DTO suitable for JSON serialization to the frontend.
    /// </summary>
    private static object ModToDto(CkanModule mod, Registry registry, bool autoInstalled = false)
    {
        var installed = registry.InstalledModule(mod.identifier);
        return new
        {
            identifier = mod.identifier,
            name = mod.name,
            @abstract = mod.@abstract,
            description = mod.description,
            version = mod.version?.ToString(),
            author = mod.author ?? new List<string>(),
            license = mod.license?.Select(l => l.ToString()).ToList() ?? new List<string>(),
            download_size = mod.download_size,
            install_size = mod.install_size,
            ksp_version = mod.ksp_version?.ToString(),
            ksp_version_min = mod.ksp_version_min?.ToString(),
            ksp_version_max = mod.ksp_version_max?.ToString(),
            release_date = mod.release_date?.ToString("yyyy-MM-dd"),
            tags = mod.Tags?.ToList() ?? new List<string>(),
            depends = mod.depends?.Select(d => new { name = d.ToString() }).ToList(),
            conflicts = mod.conflicts?.Select(c => new { name = c.ToString() }).ToList(),
            resources = mod.resources != null ? new
            {
                homepage = mod.resources.homepage?.ToString(),
                repository = mod.resources.repository?.ToString(),
                spacedock = mod.resources.spacedock?.ToString(),
                bugtracker = mod.resources.bugtracker?.ToString(),
            } : null,
            installed = installed != null,
            auto_installed = autoInstalled || (installed?.AutoInstalled ?? false),
        };
    }

    public void Dispose()
    {
        _registryManager?.Dispose();
        RegistryManager.DisposeAll();
    }
}
