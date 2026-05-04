using System.Text.RegularExpressions;
using CKAN.Configuration;
using CKAN.IO;

namespace CKAN.CLI;

/// <summary>
/// Parses AI action commands from response text and executes them
/// against CKAN Core APIs directly (no IPC bridge).
/// </summary>
public sealed class ActionExecutor
{
    private readonly GameInstanceManager _instanceManager;
    private readonly RegistryManager? _registryManager;
    private readonly IConfiguration _config;
    private readonly IUser _user;
    private readonly RepositoryDataManager _repoData;

    // Regex patterns matching the AI action command format
    private static readonly Regex InstallPattern   = new(@"\[INSTALL:([^\]]+)\]", RegexOptions.Compiled);
    private static readonly Regex UninstallPattern = new(@"\[UNINSTALL:([^\]]+)\]", RegexOptions.Compiled);
    private static readonly Regex SearchPattern    = new(@"\[SEARCH:([^\]]+)\]", RegexOptions.Compiled);
    private static readonly Regex RefreshPattern   = new(@"\[REFRESH_REPO\]", RegexOptions.Compiled);

    public ActionExecutor(
        GameInstanceManager instanceManager,
        RegistryManager? registryManager,
        IConfiguration config,
        IUser user,
        RepositoryDataManager repoData)
    {
        _instanceManager = instanceManager;
        _registryManager = registryManager;
        _config = config;
        _user = user;
        _repoData = repoData;
    }

    /// <summary>
    /// Parse all action commands from AI response and execute them.
    /// </summary>
    public async Task ExecuteActions(string aiResponse)
    {
        // Install
        foreach (Match m in InstallPattern.Matches(aiResponse))
        {
            await ExecuteInstall(m.Groups[1].Value.Trim());
        }

        // Uninstall
        foreach (Match m in UninstallPattern.Matches(aiResponse))
        {
            await ExecuteUninstall(m.Groups[1].Value.Trim());
        }

        // Search
        foreach (Match m in SearchPattern.Matches(aiResponse))
        {
            ExecuteSearch(m.Groups[1].Value.Trim());
        }

        // Refresh
        if (RefreshPattern.IsMatch(aiResponse))
        {
            await ExecuteRefresh();
        }
    }

    public async Task ExecuteInstall(string identifier)
    {
        var instance = _instanceManager.CurrentInstance;
        if (instance == null || _registryManager == null)
        {
            ConsoleRenderer.PrintError("No active game instance");
            return;
        }

        await Task.Run(() =>
        {
            try
            {
                var registry = _registryManager.registry;
                var gameVersion = instance.VersionCriteria();
                var stabilityTolerance = instance.StabilityToleranceConfig;

                var mod = registry.LatestAvailable(identifier, stabilityTolerance, gameVersion);
                if (mod == null)
                {
                    ConsoleRenderer.PrintError($"Module '{identifier}' not found or incompatible with your game version");
                    return;
                }

                var cache = _instanceManager.Cache;
                if (cache == null)
                {
                    ConsoleRenderer.PrintError("Download cache not configured");
                    return;
                }

                var installer = new ModuleInstaller(instance, cache, _config, _user);
                var options = RelationshipResolverOptions.DependsOnlyOpts(stabilityTolerance);
                HashSet<string>? possibleConfigOnlyDirs = null;

                ConsoleRenderer.PrintInfo($"Installing {mod.name} v{mod.version}...");

                installer.InstallList(
                    new[] { mod },
                    options,
                    _registryManager,
                    ref possibleConfigOnlyDirs,
                    userAgent: "CKAN-CLI/2.0",
                    ConfirmPrompt: false
                );

                ConsoleRenderer.PrintAction("Installed", $"{mod.name} v{mod.version}", true);
            }
            catch (TooManyModsProvideKraken tooMany)
            {
                ConsoleRenderer.PrintWarning($"Multiple mods provide '{tooMany.requested}':");
                foreach (var p in tooMany.modules)
                {
                    ConsoleRenderer.PrintInfo($"  - {p.name} ({p.identifier})");
                }
                ConsoleRenderer.PrintInfo("Please specify the exact identifier.");
            }
            catch (Exception ex)
            {
                var actual = ex is AggregateException agg ? agg.InnerException ?? ex : ex;
                if (actual is TooManyModsProvideKraken tooMany2)
                {
                    ConsoleRenderer.PrintWarning($"Multiple mods provide '{tooMany2.requested}':");
                    foreach (var p in tooMany2.modules)
                    {
                        ConsoleRenderer.PrintInfo($"  - {p.name} ({p.identifier})");
                    }
                    return;
                }

                var msg = actual switch
                {
                    ModuleNotFoundKraken mnf => $"Module '{mnf.identifier}' not available for your game version",
                    ModuleIsDLCKraken dlc => $"'{dlc.module.name}' is a DLC and cannot be installed via CKAN",
                    DependenciesNotSatisfiedKraken => $"Cannot install '{identifier}': dependencies not satisfied",
                    ModuleDownloadErrorsKraken => $"Download failed for '{identifier}'",
                    DownloadErrorsKraken => "Download failed — check your internet connection",
                    _ => $"Install failed: {actual.Message}"
                };
                ConsoleRenderer.PrintError(msg);
            }
        });
    }

    public async Task ExecuteUninstall(string identifier)
    {
        var instance = _instanceManager.CurrentInstance;
        if (instance == null || _registryManager == null)
        {
            ConsoleRenderer.PrintError("No active game instance");
            return;
        }

        await Task.Run(() =>
        {
            try
            {
                var cache = _instanceManager.Cache;
                if (cache == null)
                {
                    ConsoleRenderer.PrintError("Download cache not configured");
                    return;
                }

                var installer = new ModuleInstaller(instance, cache, _config, _user);
                HashSet<string>? possibleConfigOnlyDirs = null;

                ConsoleRenderer.PrintInfo($"Uninstalling {identifier}...");

                installer.UninstallList(
                    new[] { identifier },
                    ref possibleConfigOnlyDirs,
                    _registryManager,
                    ConfirmPrompt: false
                );

                ConsoleRenderer.PrintAction("Removed", identifier, true);
            }
            catch (ModNotInstalledKraken)
            {
                ConsoleRenderer.PrintError($"'{identifier}' is not installed");
            }
            catch (Exception ex)
            {
                ConsoleRenderer.PrintError($"Uninstall failed: {ex.Message}");
            }
        });
    }

    public void ExecuteSearch(string query)
    {
        var instance = _instanceManager.CurrentInstance;
        if (instance == null || _registryManager == null)
        {
            ConsoleRenderer.PrintError("No active game instance");
            return;
        }

        var registry = _registryManager.registry;
        var gameVersion = instance.VersionCriteria();
        var stabilityTolerance = instance.StabilityToleranceConfig;

        var queryLower = query.ToLowerInvariant();
        var results = registry.CompatibleModules(stabilityTolerance, gameVersion)
            .Where(m =>
                m.identifier.Contains(queryLower, StringComparison.OrdinalIgnoreCase) ||
                m.name.Contains(queryLower, StringComparison.OrdinalIgnoreCase) ||
                (m.@abstract ?? "").Contains(queryLower, StringComparison.OrdinalIgnoreCase) ||
                (m.description ?? "").Contains(queryLower, StringComparison.OrdinalIgnoreCase))
            .Take(15)
            .Select(m => (m.identifier, m.name, m.@abstract ?? "", m.version.ToString()))
            .ToList();

        if (results.Count == 0)
        {
            ConsoleRenderer.PrintInfo($"No mods found matching '{query}'");
        }
        else
        {
            ConsoleRenderer.PrintSearchResults(results);
        }
    }

    public async Task ExecuteRefresh()
    {
        var instance = _instanceManager.CurrentInstance;
        if (instance == null || _registryManager == null)
        {
            ConsoleRenderer.PrintError("No active game instance");
            return;
        }

        ConsoleRenderer.PrintInfo("Refreshing repository metadata...");

        await Task.Run(() =>
        {
            try
            {
                var registry = _registryManager.registry;
                var downloader = new NetAsyncDownloader(_user, () => null, "CKAN-CLI/2.0");
                _repoData.Update(
                    registry.Repositories.Values.ToList(),
                    instance.Game,
                    skipETags: false,
                    downloader: downloader,
                    user: _user,
                    userAgent: "CKAN-CLI/2.0"
                );
                ConsoleRenderer.PrintSuccess("Repository refreshed");
            }
            catch (Exception ex)
            {
                ConsoleRenderer.PrintError($"Refresh failed: {ex.Message}");
            }
        });
    }

    public void ListInstalled()
    {
        if (_registryManager == null)
        {
            ConsoleRenderer.PrintError("No active game instance");
            return;
        }

        var mods = _registryManager.registry.InstalledModules
            .Select(im => (im.Module.identifier, im.Module.name, im.Module.version.ToString(), im.AutoInstalled))
            .OrderBy(m => m.name)
            .ToList();

        if (mods.Count == 0)
        {
            ConsoleRenderer.PrintInfo("No mods installed");
        }
        else
        {
            ConsoleRenderer.PrintInfo($"{mods.Count} mods installed:");
            ConsoleRenderer.PrintInstalledMods(mods);
        }
    }
}
