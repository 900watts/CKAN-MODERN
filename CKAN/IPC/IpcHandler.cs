using System.Security.Cryptography;
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
    private readonly UpdateChecker _updateChecker;
    private GameInstanceManager? _instanceManager;
    private RegistryManager? _registryManager;
    private string? _customMirrorUrl;
    private readonly object _lock = new();

    /// <summary>
    /// Callback to toggle WebView2 visibility.
    /// WebView2's compositor HWND renders on top of native WPF dialogs,
    /// so we must hide it before showing folder dialogs and restore after.
    /// </summary>
    public Action<bool>? SetWebView2Visibility { get; set; }

    /// <summary>
    /// Event fired when we want to push a message to the frontend.
    /// The IpcBridge subscribes to this to forward events.
    /// </summary>
    public event Action<string, object>? PushEvent;

    /// <summary>
    /// Safely raises the PushEvent, catching any subscriber exceptions
    /// so they don't abort the calling operation.
    /// </summary>
    private void RaisePushEvent(string channel, object data)
    {
        try { PushEvent?.Invoke(channel, data); }
        catch (Exception ex) { log.Error($"[IPC] Error raising PushEvent for channel '{channel}'", ex); }
    }

    public IpcHandler()
    {
        _config = new JsonConfiguration();

        _user = new ModernUser(
            onProgress: (msg, pct) => RaisePushEvent("progress", new { message = msg, percent = pct }),
            onMessage:  (msg) => RaisePushEvent("log", new { message = msg }),
            onError:    (msg) => RaisePushEvent("error", new { message = msg })
        );

        _repoData = new RepositoryDataManager();
        _updateChecker = new UpdateChecker();

        // Initialize the game instance manager and auto-detect game instances
        try
        {
            _instanceManager = new GameInstanceManager(_user, _config);

            var preferred = _instanceManager.GetPreferredInstance();
            if (preferred == null)
            {
                // No instances registered yet — scan Steam/library paths
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

    /// <summary>
    /// Triggers a background repository refresh on startup.
    /// Called by IpcBridge after the bridge is fully wired up.
    /// </summary>
    public void AutoRefreshOnStartup()
    {
        if (_instanceManager == null || _registryManager == null)
        {
            log.Info("[IPC] Skipping auto-refresh: no active instance");
            return;
        }

        _ = Task.Run(async () =>
        {
            try
            {
                // Small delay to let the UI finish loading
                await Task.Delay(1500);
                log.Info("[IPC] Starting auto-refresh of repository...");
                await HandleRepoRefresh(null);
                log.Info("[IPC] Auto-refresh complete");

                // Check for updates after repo refresh
                var update = await _updateChecker.CheckForUpdateAsync();
                if (update != null)
                {
                    log.Info($"[IPC] Update available: {update.TagName}");
                    RaisePushEvent("update:available", new
                    {
                        tag = update.TagName,
                        name = update.ReleaseName,
                        notes = update.ReleaseNotes,
                        url = update.ReleaseUrl,
                        publishedAt = update.PublishedAt,
                        liteUrl = update.LiteDownloadUrl,
                        bundledUrl = update.BundledDownloadUrl,
                        liteSize = update.LiteSize,
                        bundledSize = update.BundledSize,
                    });
                }
            }
            catch (Exception ex)
            {
                log.Error("[IPC] Auto-refresh failed", ex);
            }
        });
    }

    private void InitRegistryForInstance(GameInstance instance)
    {
        lock (_lock)
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
            "game:scan"           => await HandleScanForGames(request.Args),
            "game:remove"         => await HandleRemoveInstance(request.Args),
            "game:add"            => await HandleAddInstance(request.Args),

            // ─── Downloads ───
            "download:list"       => HandleDownloadList(),
            "download:pause"      => HandleDownloadPause(request.Args),
            "download:resume"     => HandleDownloadResume(request.Args),
            "download:cancel"     => HandleDownloadCancel(request.Args),

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
            "app:check-update"    => await HandleCheckUpdate(),
            "app:apply-update"    => await HandleApplyUpdate(request.Args),
            "app:minimize"        => await HandleMinimize(),
            "app:maximize"        => await HandleMaximize(),
            "app:close"           => await HandleClose(),
            "app:browse-folder"   => await HandleBrowseFolder(request.Args),

            // ─── Repository ───
            "repo:refresh"        => await HandleRepoRefresh(request.Args),
            "repo:set-mirror"     => HandleSetMirror(request.Args),
            "repo:get-mirror"     => HandleGetMirror(),

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
            lock (_lock)
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

                    RaisePushEvent("install:start", new { identifier, name = mod.name });

                    installer.InstallList(
                        new[] { mod },
                        options,
                        _registryManager,
                        ref possibleConfigOnlyDirs,
                        userAgent: "CKAN-Modern/2.0",
                        ConfirmPrompt: false
                    );

                    RaisePushEvent("install:complete", new { identifier, name = mod.name, status = "success" });

                    return new { identifier, status = "installed", name = mod.name };
                }
                catch (TooManyModsProvideKraken tooMany)
                {
                    log.Info($"[IPC] Multiple providers for {tooMany.requested}, asking user to choose");
                    var providers = tooMany.modules.Select(m => new
                    {
                        identifier = m.identifier,
                        name = m.name,
                        @abstract = m.@abstract,
                    }).ToArray();
                    return (object)new
                    {
                        identifier,
                        status = "needs_provider_choice",
                        requested = tooMany.requested,
                        requester = tooMany.requester.name,
                        providers
                    };
                }
                catch (Exception ex)
                {
                    // Check for TooManyModsProvideKraken wrapped in AggregateException
                    var actual = ex is AggregateException agg ? agg.InnerException ?? ex : ex;
                    if (actual is TooManyModsProvideKraken tooMany2)
                    {
                        log.Info($"[IPC] Multiple providers for {tooMany2.requested} (wrapped), asking user to choose");
                        var providers2 = tooMany2.modules.Select(m => new
                        {
                            identifier = m.identifier,
                            name = m.name,
                            @abstract = m.@abstract,
                        }).ToArray();
                        return (object)new
                        {
                            identifier,
                            status = "needs_provider_choice",
                            requested = tooMany2.requested,
                            requester = tooMany2.requester.name,
                            providers = providers2
                        };
                    }

                    log.Error($"[IPC] Install failed for {identifier}", ex);
                    // Wrap raw Core exceptions (which may be localized) with a clear English message
                    var friendlyError = ex switch
                    {
                        ModuleNotFoundKraken mnf => $"Module '{mnf.identifier}' is not available for your game version. Check compatibility.",
                        ModuleIsDLCKraken dlc => $"'{dlc.module.name}' is a DLC and cannot be installed via CKAN.",
                        InconsistentKraken ik => $"Registry inconsistency: {ik.ShortDescription}",
                        DependenciesNotSatisfiedKraken => $"Cannot install '{identifier}': some dependencies could not be satisfied.",
                        ModuleDownloadErrorsKraken => $"Download failed for '{identifier}'. Check your internet connection and try again.",
                        DownloadErrorsKraken => $"Download failed. Check your internet connection and try again.",
                        _ => $"Install failed for '{identifier}': {ex.Message}"
                    };
                    RaisePushEvent("install:error", new { identifier, error = friendlyError });
                    return (object)new { identifier, status = "error", error = friendlyError };
                }
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
            lock (_lock)
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

                    RaisePushEvent("uninstall:start", new { identifier });

                    installer.UninstallList(
                        new[] { identifier },
                        ref possibleConfigOnlyDirs,
                        _registryManager,
                        ConfirmPrompt: false
                    );

                    RaisePushEvent("uninstall:complete", new { identifier, status = "success" });

                    return new { identifier, status = "removed" };
                }
                catch (Exception ex)
                {
                    log.Error($"[IPC] Uninstall failed for {identifier}", ex);
                    var friendlyError = ex switch
                    {
                        ModNotInstalledKraken => $"'{identifier}' is not installed.",
                        _ => $"Uninstall failed for '{identifier}': {ex.Message}"
                    };
                    RaisePushEvent("uninstall:error", new { identifier, error = friendlyError });
                    return (object)new { identifier, status = "error", error = friendlyError };
                }
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
            return Task.FromResult<object?>(new { success = false, instances = Array.Empty<object>(), error = "Instance manager not initialized" });
        }

        var instances = BuildInstanceListResponse();
        return Task.FromResult<object?>(new { success = true, instances });
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
            GameInstance? instance;
            lock (_lock)
            {
                if (_instanceManager.HasInstance(name))
                {
                    return Task.FromResult<object?>(new { success = false, error = $"An instance named '{name}' already exists. Please choose a different name." });
                }

                instance = _instanceManager.AddInstance(path, name, _user);
                if (instance != null)
                {
                    _instanceManager.SetCurrentInstance(name);
                    InitRegistryForInstance(instance);
                }
            }

            if (instance != null)
            {
                // Auto-refresh repository in the background so mods are installable
                _ = Task.Run(() =>
                {
                    try
                    {
                        RaisePushEvent("repo:refresh-start", new { });
                        var registry = _registryManager!.registry;
                        var repos = registry.Repositories.Values.OrderBy(r => r.priority).ToArray();
                        if (repos.Length == 0)
                        {
                            var defaultRepo = new Repository("default", new Uri("https://github.com/KSP-CKAN/CKAN-meta/archive/master.tar.gz"));
                            registry.RepositoriesAdd(defaultRepo);
                            repos = new[] { defaultRepo };
                            _registryManager.Save();
                        }
                        var downloader = new NetAsyncDownloader(_user, () => null, "CKAN-Modern/2.0");
                        _repoData.Update(repos, instance.Game, skipETags: false, downloader: downloader, user: _user, userAgent: "CKAN-Modern/2.0");
                        InitRegistryForInstance(instance);
                        var modCount = _registryManager?.registry?.CompatibleModules(instance.StabilityToleranceConfig, instance.VersionCriteria())?.Count() ?? 0;
                        RaisePushEvent("repo:refresh-complete", new { modCount });
                    }
                    catch (Exception ex)
                    {
                        log.Error("[IPC] Auto-refresh after instance add failed", ex);
                        RaisePushEvent("repo:refresh-error", new { error = ex.Message });
                    }
                });

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
            lock (_lock)
            {
                var wasActive = _instanceManager.CurrentInstance?.Name == name;
                _instanceManager.RemoveInstance(name);

                // If we removed the active instance, clear registry
                if (wasActive)
                {
                    _registryManager?.Dispose();
                    _registryManager = null;
                    // Try to switch to another instance if one exists
                    var remaining = _instanceManager.Instances;
                    if (remaining.Count > 0)
                    {
                        var next = remaining.Values.First();
                        _instanceManager.SetCurrentInstance(next.Name);
                        InitRegistryForInstance(next);
                        var registry = _registryManager?.registry;
                        var installedCount = registry?.InstalledModules?.Count() ?? 0;
                        var modCount = registry != null
                            ? registry.CompatibleModules(next.StabilityToleranceConfig, next.VersionCriteria())?.Count() ?? 0
                            : 0;
                        RaisePushEvent("instance:switched", new { name = next.Name, installedCount, modCount });
                    }
                    else
                    {
                        // No instances left — reset everything
                        RaisePushEvent("instance:switched", new { name = "", installedCount = 0, modCount = 0 });
                    }
                }
            }

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
            lock (_lock)
            {
                _instanceManager.SetCurrentInstance(name);
                var instance = _instanceManager.CurrentInstance;
                if (instance != null)
                {
                    InitRegistryForInstance(instance);
                }

                var registry = _registryManager?.registry;
                var installedCount = registry?.InstalledModules?.Count() ?? 0;
                var modCount = 0;
                if (instance != null && registry != null)
                {
                    modCount = registry.CompatibleModules(
                        instance.StabilityToleranceConfig,
                        instance.VersionCriteria())?.Count() ?? 0;
                }

                RaisePushEvent("instance:switched", new { name, installedCount, modCount });
                return Task.FromResult<object?>(new { name, active = true, installedCount, modCount });
            }
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
        var code = RandomNumberGenerator.GetInt32(100000, 1000000).ToString();
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

    private async Task<object?> HandleCheckUpdate()
    {
        var info = await _updateChecker.CheckForUpdateAsync();
        if (info == null)
        {
            return new { available = false };
        }

        return new
        {
            available = true,
            tag = info.TagName,
            name = info.ReleaseName,
            notes = info.ReleaseNotes,
            url = info.ReleaseUrl,
            publishedAt = info.PublishedAt,
            liteUrl = info.LiteDownloadUrl,
            bundledUrl = info.BundledDownloadUrl,
            liteSize = info.LiteSize,
            bundledSize = info.BundledSize,
        };
    }

    private async Task<object?> HandleApplyUpdate(JToken? args)
    {
        var downloadUrl = args?["downloadUrl"]?.ToString();
        if (string.IsNullOrEmpty(downloadUrl))
        {
            return new { success = false, error = "No download URL provided" };
        }

        var success = await _updateChecker.DownloadAndApplyAsync(
            downloadUrl,
            onProgress: (msg, pct) =>
            {
                RaisePushEvent("update:progress", new { message = msg, percent = pct });
            }
        );

        if (!success)
            return new { success = false, error = "Download or apply failed. Check logs for details." };

        return new { success = true };
    }

    private async Task<object?> HandleMinimize()
    {
        var app = System.Windows.Application.Current;
        if (app == null) return null;
        await app.Dispatcher.InvokeAsync(() =>
        {
            app.MainWindow!.WindowState = System.Windows.WindowState.Minimized;
        });
        return null;
    }

    private async Task<object?> HandleMaximize()
    {
        var app = System.Windows.Application.Current;
        if (app == null) return null;
        await app.Dispatcher.InvokeAsync(() =>
        {
            var win = app.MainWindow!;
            win.WindowState = win.WindowState == System.Windows.WindowState.Maximized
                ? System.Windows.WindowState.Normal
                : System.Windows.WindowState.Maximized;
        });
        return null;
    }

    private async Task<object?> HandleClose()
    {
        var app = System.Windows.Application.Current;
        if (app == null) return null;
        await app.Dispatcher.InvokeAsync(() =>
        {
            app.Shutdown();
        });
        return null;
    }

    private async Task<object?> HandleBrowseFolder(JToken? args)
    {
        var title = args?["title"]?.ToString() ?? "Select Game Folder";

        var app = System.Windows.Application.Current;
        if (app == null)
        {
            log.Error("[IPC] BrowseFolder: Application.Current is null");
            return new { selected = false, path = (string?)null, error = "WPF application is not running" };
        }

        string? selectedPath = null;
        var owner = app.MainWindow;

        // WebView2's compositor HWND renders on top of native WPF dialogs.
        // Hide it before showing the folder dialog so the user can actually see it.
        SetWebView2Visibility?.Invoke(false);

        try
        {
            await app.Dispatcher.InvokeAsync(() =>
            {
                try
                {
                    var dialog = new Microsoft.Win32.OpenFolderDialog
                    {
                        Title = title,
                        Multiselect = false,
                    };

                    bool? result = owner != null
                        ? dialog.ShowDialog(owner)
                        : dialog.ShowDialog();

                    if (result == true)
                    {
                        selectedPath = dialog.FolderName;
                    }
                }
                catch (Exception ex)
                {
                    log.Error("[IPC] BrowseFolder failed", ex);
                }
            });
        }
        finally
        {
            // Always restore WebView2 visibility, even if the dialog threw
            SetWebView2Visibility?.Invoke(true);
        }

        if (!string.IsNullOrEmpty(selectedPath))
        {
            log.Info($"[IPC] Folder selected: {selectedPath}");
            return new { selected = true, path = selectedPath };
        }
        return new { selected = false, path = (string?)null };
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
            recommends = mod.recommends?.Select(r => new { name = r.ToString() }).ToList(),
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

    // ═══════════════════════════════════════════════════════════
    //  REPOSITORY REFRESH — Downloads latest mod metadata
    // ═══════════════════════════════════════════════════════════

    private async Task<object?> HandleRepoRefresh(JToken? args)
    {
        var instance = _instanceManager?.CurrentInstance;

        if (instance == null || _registryManager == null)
        {
            return new { success = false, error = "No active game instance" };
        }

        var refreshTask = Task.Run(() =>
        {
            lock (_lock)
            {
                try
                {
                    RaisePushEvent("repo:refresh-start", new { });

                    var registry = _registryManager.registry;
                    var repos = registry.Repositories.Values
                        .OrderBy(r => r.priority)
                        .ToArray();

                    if (repos.Length == 0)
                    {
                        // Use custom mirror URL if set, otherwise default to GitHub
                        var repoUrl = !string.IsNullOrWhiteSpace(_customMirrorUrl)
                            ? _customMirrorUrl
                            : "https://github.com/KSP-CKAN/CKAN-meta/archive/master.tar.gz";
                        var defaultRepo = new Repository("default", new Uri(repoUrl));
                        registry.RepositoriesAdd(defaultRepo);
                        repos = new[] { defaultRepo };
                        _registryManager.Save();
                    }

                    var downloader = new NetAsyncDownloader(_user, () => null, "CKAN-Modern/2.0");

                    var result = _repoData.Update(
                        repos,
                        instance.Game,
                        skipETags: false,
                        downloader: downloader,
                        user: _user,
                        userAgent: "CKAN-Modern/2.0"
                    );

                    // Reload registry with fresh data
                    InitRegistryForInstance(instance);

                    var modCount = _registryManager?.registry?.CompatibleModules(
                        instance.StabilityToleranceConfig,
                        instance.VersionCriteria())?.Count() ?? 0;

                    RaisePushEvent("repo:refresh-complete", new { modCount });

                    return (object)new
                    {
                        success = true,
                        result = result.ToString(),
                        modCount
                    };
                }
                catch (Exception ex)
                {
                    log.Error("[IPC] Repository refresh failed", ex);
                    RaisePushEvent("repo:refresh-error", new { error = ex.Message });
                    return (object)new { success = false, error = $"Repository refresh failed: {ex.Message}" };
                }
            }
        });

        // 3-minute timeout to prevent infinite hangs
        var timeoutTask = Task.Delay(TimeSpan.FromMinutes(3));
        var completed = await Task.WhenAny(refreshTask, timeoutTask);
        if (completed == timeoutTask)
        {
            RaisePushEvent("repo:refresh-error", new { error = "Timed out after 3 minutes" });
            return new { success = false, error = "Repository refresh timed out after 3 minutes. Try using a Gitee mirror in Settings if you are in China." };
        }
        return await refreshTask;
    }

    private object? HandleSetMirror(JToken? args)
    {
        var url = args?["url"]?.Value<string>();
        if (string.IsNullOrWhiteSpace(url))
        {
            return new { success = false, error = "Missing url parameter" };
        }
        _customMirrorUrl = url;
        log.InfoFormat("[IPC] Mirror URL set to: {0}", url);
        return new { success = true, url };
    }

    private object? HandleGetMirror()
    {
        return new { success = true, url = _customMirrorUrl ?? "" };
    }

    // ═══════════════════════════════════════════════════════════
    //  DOWNLOADS — Stub handlers (download UI is handled via events)
    // ═══════════════════════════════════════════════════════════

    private object HandleDownloadList()
    {
        return new { downloads = Array.Empty<object>() };
    }

    private object HandleDownloadPause(JToken? args)
    {
        var id = args?["id"]?.ToString() ?? "";
        RaisePushEvent("download:paused", new { id });
        return new { id, status = "paused" };
    }

    private object HandleDownloadResume(JToken? args)
    {
        var id = args?["id"]?.ToString() ?? "";
        RaisePushEvent("download:resumed", new { id });
        return new { id, status = "resumed" };
    }

    private object HandleDownloadCancel(JToken? args)
    {
        var id = args?["id"]?.ToString() ?? "";
        RaisePushEvent("download:cancelled", new { id });
        return new { id, status = "cancelled" };
    }

    /// <summary>
    /// Scan the system for KSP installations (Steam, etc.)
    /// Adds newly found instances without throwing if instances already exist.
    /// </summary>
    private Task<object?> HandleScanForGames(JToken? args)
    {
        if (_instanceManager == null)
        {
            return Task.FromResult<object?>(new { success = false, instances = Array.Empty<object>(), error = "Instance manager not initialized" });
        }

        try
        {
            // Use FindDefaultInstances() instead of FindAndRegisterDefaultInstances()
            // because the latter throws GameManagerKraken when instances already exist.
            // FindDefaultInstances() discovers games from Steam, Mac paths, etc.
            var foundInstances = _instanceManager.FindDefaultInstances();

            // Collect paths already registered to avoid duplicates
            var existingPaths = new HashSet<string>(
                _instanceManager.Instances.Values.Select(i => NormalizePath(i.GameDir)),
                StringComparer.OrdinalIgnoreCase
            );

            int newCount = 0;
            lock (_lock)
            {
                foreach (var inst in foundInstances)
                {
                    var normPath = NormalizePath(inst.GameDir);
                    if (!existingPaths.Contains(normPath))
                    {
                        _instanceManager.AddInstance(inst);
                        existingPaths.Add(normPath);
                        newCount++;
                        log.Info($"[IPC] Auto-detected new instance: {inst.Name} at {inst.GameDir}");
                    }
                }

                if (_instanceManager.CurrentInstance == null && _instanceManager.Instances.Count > 0)
                {
                    TrySelectFirstValidInstance();
                }
            }

            var instances = BuildInstanceListResponse();
            return Task.FromResult<object?>(new { success = true, instances, newCount });
        }
        catch (Exception ex)
        {
            log.Error("[IPC] Game scan failed", ex);
            return Task.FromResult<object?>(new { success = false, instances = Array.Empty<object>(), error = ex.Message });
        }
    }

    /// <summary>
    /// Normalize a path for comparison (trailing slash removal, etc.)
    /// </summary>
    private static string NormalizePath(string path)
    {
        var full = System.IO.Path.IsPathRooted(path)
            ? path
            : System.IO.Path.GetFullPath(path);
        return full.TrimEnd(
            System.IO.Path.DirectorySeparatorChar,
            System.IO.Path.AltDirectorySeparatorChar
        );
    }

    private object[] BuildInstanceListResponse()
    {
        if (_instanceManager == null) return Array.Empty<object>();
        var currentName = _instanceManager.CurrentInstance?.Name;
        return _instanceManager.Instances.Select(kvp => new
        {
            name = kvp.Key,
            path = kvp.Value.GameDir,
            valid = kvp.Value.Valid,
            version = kvp.Value.Version()?.ToString() ?? "unknown",
            game = kvp.Value.Game.ShortName,
            active = kvp.Key == currentName
        }).ToArray();
    }

    private GameInstance? TrySelectFirstValidInstance()
    {
        lock (_lock)
        {
            var inst = _instanceManager!.Instances.Values.FirstOrDefault(i => i.Valid);
            if (inst != null)
            {
                _instanceManager.SetCurrentInstance(inst);
                InitRegistryForInstance(inst);
            }
            return inst;
        }
    }

    public void Dispose()
    {
        lock (_lock)
        {
            _registryManager?.Dispose();
        }
        _updateChecker.Dispose();
        RegistryManager.DisposeAll();
    }
}
