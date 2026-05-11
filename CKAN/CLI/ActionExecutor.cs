using System.Text.RegularExpressions;
using CKAN.Configuration;
using CKAN.IO;
using log4net;

namespace CKAN.Modern.CLI;

/// <summary>
/// Parses action commands from AI responses and executes them against CKAN Core.
/// Supports: INSTALL, UNINSTALL, SEARCH, REFRESH_REPO, LIST_INSTALLED
/// </summary>
public sealed class ActionExecutor : IDisposable
{
    private static readonly ILog log = LogManager.GetLogger(typeof(ActionExecutor));

    private readonly GameInstanceManager _instanceManager;
    private readonly IUser               _user;
    private readonly IConfiguration      _config;
    private readonly RepositoryDataManager _repoData;
    private RegistryManager? _registryManager;

    private static readonly Regex InstallCmd   = new(@"\[INSTALL\s*:\s*([^\]]+)\]", RegexOptions.IgnoreCase);
    private static readonly Regex UninstallCmd = new(@"\[UNINSTALL\s*:\s*([^\]]+)\]", RegexOptions.IgnoreCase);
    private static readonly Regex SearchCmd    = new(@"\[SEARCH\s*:\s*([^\]]+)\]",   RegexOptions.IgnoreCase);

    public GameInstance? CurrentInstance => _instanceManager.CurrentInstance;
    public Registry?     Registry        => _registryManager?.registry;

    public ActionExecutor(IUser user)
    {
        _user            = user;
        _config          = new JsonConfiguration();
        _repoData        = new RepositoryDataManager();
        _instanceManager = new GameInstanceManager(user, _config);

        InitializeInstance();
    }

    private void InitializeInstance()
    {
        try
        {
            var preferred = _instanceManager.GetPreferredInstance();
            if (preferred == null)
            {
                _instanceManager.FindAndRegisterDefaultInstances();
                preferred = _instanceManager.GetPreferredInstance();
            }

            if (preferred != null)
            {
                _registryManager?.Dispose();
                _registryManager = RegistryManager.Instance(preferred, _repoData);
                log.Info($"Loaded registry for instance: {preferred.Name}");
            }
        }
        catch (Exception ex)
        {
            log.Error("Failed to initialize game instance", ex);
        }
    }

    // ── Command extraction ────────────────────────────────────────────

    /// <summary>
    /// Extract all action commands from AI response text and execute them.
    /// Returns a list of summary strings describing what happened.
    /// </summary>
    public async Task<List<string>> ExecuteCommands(string aiResponse)
    {
        var summaries = new List<string>();

        // Order matters: install/uninstall before search/list since they change state
        foreach (Match m in InstallCmd.Matches(aiResponse))
        {
            var identifier = m.Groups[1].Value.Trim();
            var result = await InstallMod(identifier);
            summaries.Add(result);
        }

        foreach (Match m in UninstallCmd.Matches(aiResponse))
        {
            var identifier = m.Groups[1].Value.Trim();
            var result     = await UninstallMod(identifier);
            summaries.Add(result);
        }

        if (Regex.IsMatch(aiResponse, @"\[REFRESH_REPO\]", RegexOptions.IgnoreCase))
        {
            var result = await RefreshRepo();
            summaries.Add(result);
        }

        if (Regex.IsMatch(aiResponse, @"\[LIST_INSTALLED\]", RegexOptions.IgnoreCase))
        {
            var result = ListInstalled();
            summaries.Add(result);
        }

        foreach (Match m in SearchCmd.Matches(aiResponse))
        {
            var query  = m.Groups[1].Value.Trim();
            var result = SearchMods(query);
            summaries.Add(result);
        }

        return summaries;
    }

    // ── Actions ───────────────────────────────────────────────────────

    private Task<string> InstallMod(string identifier)
    {
        var instance = _instanceManager.CurrentInstance;
        if (instance == null || _registryManager == null)
            return Task.FromResult($"Cannot install '{identifier}': no active game instance.");

        return Task.Run(() =>
        {
            try
            {
                var registry          = _registryManager.registry;
                var gameVersion       = instance.VersionCriteria();
                var stabilityTolerance = instance.StabilityToleranceConfig;

                var mod = registry.LatestAvailable(identifier, stabilityTolerance, gameVersion);
                if (mod == null)
                    return $"Module '{identifier}' not found or incompatible with your game version.";

                var cache = _instanceManager.Cache;
                if (cache == null)
                    return "Download cache not configured.";

                var installer = new ModuleInstaller(instance, cache, _config, _user);
                var options   = RelationshipResolverOptions.DependsOnlyOpts(stabilityTolerance);

                HashSet<string>? possibleConfigOnlyDirs = null;

                installer.InstallList(
                    new[] { mod },
                    options,
                    _registryManager,
                    ref possibleConfigOnlyDirs,
                    userAgent: "CKAN-CLI/1.0",
                    ConfirmPrompt: false
                );

                return $"Installed {GreenText(mod.name)} {mod.version}";
            }
            catch (Exception ex)
            {
                log.Error($"Install failed for '{identifier}'", ex);
                return FriendlyInstallError(identifier, ex);
            }
        });
    }

    private Task<string> UninstallMod(string identifier)
    {
        var instance = _instanceManager.CurrentInstance;
        if (instance == null || _registryManager == null)
            return Task.FromResult($"Cannot uninstall '{identifier}': no active game instance.");

        return Task.Run(() =>
        {
            try
            {
                var installer = new ModuleInstaller(instance, _instanceManager.Cache!, _config, _user);
                HashSet<string>? possibleConfigOnlyDirs = null;

                installer.UninstallList(
                    new[] { identifier },
                    ref possibleConfigOnlyDirs,
                    _registryManager,
                    ConfirmPrompt: false
                );

                return $"Removed '{identifier}'";
            }
            catch (Exception ex)
            {
                log.Error($"Uninstall failed for '{identifier}'", ex);
                return $"Uninstall failed for '{identifier}': {ex.Message}";
            }
        });
    }

    private string SearchMods(string query)
    {
        var instance = _instanceManager.CurrentInstance;
        if (instance == null || _registryManager == null)
            return "No active game instance.";

        var registry    = _registryManager.registry;
        var gameVersion = instance.VersionCriteria();
        var stability   = instance.StabilityToleranceConfig;

        var compatible = registry.CompatibleModules(stability, gameVersion).ToList();

        if (!string.IsNullOrWhiteSpace(query))
        {
            var q = query.ToLowerInvariant();
            compatible = compatible.Where(m =>
                m.name.Contains(q, StringComparison.OrdinalIgnoreCase) ||
                m.identifier.Contains(q, StringComparison.OrdinalIgnoreCase) ||
                (m.@abstract?.Contains(q, StringComparison.OrdinalIgnoreCase) ?? false)
            ).ToList();
        }

        if (compatible.Count == 0)
            return $"No mods found matching '{query}'.";

        var lines   = new List<string> { $"Found {compatible.Count} mod(s) matching '{query}':" };
        var results = compatible.Take(20).Select(m =>
        {
            var installed = registry.InstalledModule(m.identifier) != null ? " [installed]" : "";
            return $"  {m.identifier,-40} {m.version,-14} {m.name}{installed}";
        });

        lines.AddRange(results);
        if (compatible.Count > 20)
            lines.Add($"  ... and {compatible.Count - 20} more.");

        return string.Join("\n", lines);
    }

    private string ListInstalled()
    {
        if (_registryManager == null)
            return "No active game instance.";

        var registry    = _registryManager.registry;
        var installed   = registry.InstalledModules.ToArray();

        if (installed.Length == 0)
            return "No mods installed.";

        var lines = new List<string> { $"Installed mods ({installed.Length}):" };
        foreach (var im in installed.OrderBy(m => m.Module.name))
        {
            var auto = im.AutoInstalled ? " (auto)" : "";
            lines.Add($"  {im.Module.identifier,-40} {im.Module.version,-14} {im.Module.name}{auto}");
        }

        return string.Join("\n", lines);
    }

    private async Task<string> RefreshRepo()
    {
        var instance = _instanceManager.CurrentInstance;
        if (instance == null || _registryManager == null)
            return "No active game instance.";

        return await Task.Run(() =>
        {
            try
            {
                var registry = _registryManager.registry;
                var repos = registry.Repositories.Values.OrderBy(r => r.priority).ToArray();

                if (repos.Length == 0)
                {
                    var defaultRepo = new Repository("default",
                        new Uri("https://github.com/KSP-CKAN/CKAN-meta/archive/master.tar.gz"));
                    registry.RepositoriesAdd(defaultRepo);
                    repos = new[] { defaultRepo };
                    _registryManager.Save();
                }

                var downloader = new NetAsyncDownloader(_user, () => null, "CKAN-CLI/1.0");
                _repoData.Update(repos, instance.Game, skipETags: false,
                                 downloader: downloader, user: _user, userAgent: "CKAN-CLI/1.0");

                // Reload registry with fresh data
                _registryManager.Dispose();
                _registryManager = RegistryManager.Instance(instance, _repoData);

                var modCount = _registryManager?.registry?.CompatibleModules(
                    instance.StabilityToleranceConfig, instance.VersionCriteria())?.Count() ?? 0;

                return $"Repository refreshed. {modCount} compatible mods available.";
            }
            catch (Exception ex)
            {
                log.Error("Repository refresh failed", ex);
                return $"Repository refresh failed: {ex.Message}";
            }
        });
    }

    // ── Info queries ──────────────────────────────────────────────────

    public (string gameVersion, int installedCount, int registryCount, string? instanceName) GetInstanceInfo()
    {
        var instance = _instanceManager.CurrentInstance;
        if (instance == null)
            return ("—", 0, 0, null);

        var gameVersion   = instance.Version()?.ToString() ?? "—";
        var installedCount = _registryManager?.registry?.InstalledModules?.Count() ?? 0;
        var registryCount  = 0;

        if (instance != null && _registryManager?.registry != null)
        {
            registryCount = _registryManager.registry.CompatibleModules(
                instance.StabilityToleranceConfig, instance.VersionCriteria())?.Count() ?? 0;
        }

        return (gameVersion, installedCount, registryCount, instance.Name ?? "—");
    }

    // ── Helpers ───────────────────────────────────────────────────────

    private static string GreenText(string text) => text; // Color applied by renderer

    private static string FriendlyInstallError(string identifier, Exception ex)
    {
        return ex switch
        {
            ModuleNotFoundKraken   => $"Module '{identifier}' is not available for your game version.",
            ModuleIsDLCKraken dlc  => $"'{dlc.module.name}' is a DLC and cannot be installed via CKAN.",
            InconsistentKraken ik  => $"Registry inconsistency: {ik.ShortDescription}",
            DependenciesNotSatisfiedKraken => $"Cannot install '{identifier}': dependencies not satisfied.",
            _ => $"Install failed for '{identifier}': {ex.Message}"
        };
    }

    public void Dispose()
    {
        _registryManager?.Dispose();
        RegistryManager.DisposeAll();
        _instanceManager.Dispose();
    }
}
