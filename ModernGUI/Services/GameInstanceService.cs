using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using CKAN.Games;
using CKAN.IO;
using log4net;
using Microsoft.Win32;

namespace CKAN.GUI.Services;

public interface IGameInstanceService
{
    Task<List<GameInstanceInfo>> ListInstancesAsync();
    Task<List<GameInstanceInfo>> ScanForGamesAsync();
    Task<GameInstanceInfo> AddInstanceAsync(object? args);
    Task RemoveInstanceAsync(object? args);
    Task SetActiveInstanceAsync(object? args);
}

public class GameInstanceInfo
{
    public string Name { get; set; } = "";
    public string Path { get; set; } = "";
    public string Game { get; set; } = "";  // "KSP" or "KSP2"
    public string? Version { get; set; }
    public bool Valid { get; set; }
    public bool IsActive { get; set; }
}

public class GameInstanceService : IGameInstanceService
{
    private static readonly ILog Log = LogManager.GetLogger(typeof(GameInstanceService));
    
    private readonly List<GameInstanceInfo> _instances = new();
    private GameInstanceInfo? _activeInstance;

    public Task<List<GameInstanceInfo>> ListInstancesAsync()
    {
        return Task.FromResult(_instances.Select(i => new GameInstanceInfo
        {
            Name = i.Name,
            Path = i.Path,
            Game = i.Game,
            Version = i.Version,
            Valid = i.Valid,
            IsActive = _activeInstance?.Name == i.Name
        }).ToList());
    }

    public Task<List<GameInstanceInfo>> ScanForGamesAsync()
    {
        Log.Info("Scanning for game instances...");
        
        var found = new List<GameInstanceInfo>();
        
        // 1. Scan Steam libraries
        var steamInstances = ScanSteamLibraries();
        found.AddRange(steamInstances);
        
        // 2. Check default install paths
        var defaultPaths = GetDefaultInstallPaths();
        foreach (var path in defaultPaths)
        {
            if (Directory.Exists(path))
            {
                var info = DetectGameAt(path);
                if (info != null && !found.Any(f => f.Path.Equals(info.Path, StringComparison.OrdinalIgnoreCase)))
                {
                    found.Add(info);
                }
            }
        }
        
        // 3. Add found instances to our list
        foreach (var instance in found)
        {
            if (!_instances.Any(i => i.Path.Equals(instance.Path, StringComparison.OrdinalIgnoreCase)))
            {
                instance.Name = GetUniqueName(instance.Name);
                _instances.Add(instance);
                Log.Info($"Found: {instance.Name} at {instance.Path}");
            }
        }
        
        // Auto-select first valid instance if none active
        if (_activeInstance == null && _instances.FirstOrDefault(i => i.Valid) is GameInstanceInfo first)
        {
            _activeInstance = first;
        }
        
        return Task.FromResult(found);
    }

    private List<GameInstanceInfo> ScanSteamLibraries()
    {
        var found = new List<GameInstanceInfo>();
        
        try
        {
            // Get Steam path from registry
            var steamPath = GetSteamPath();
            if (string.IsNullOrEmpty(steamPath) || !Directory.Exists(steamPath))
            {
                Log.Debug("Steam not found");
                return found;
            }
            
            Log.Info($"Scanning Steam at: {steamPath}");
            
            // Parse libraryfolders.vdf to find all Steam libraries
            var libraryPaths = GetSteamLibraryPaths(steamPath);
            
            foreach (var libPath in libraryPaths)
            {
                var commonPath = Path.Combine(libPath, "steamapps", "common");
                if (!Directory.Exists(commonPath)) continue;
                
                // Look for known games
                var kspPath = Path.Combine(commonPath, "Kerbal Space Program");
                if (Directory.Exists(kspPath))
                {
                    var info = DetectGameAt(kspPath);
                    if (info != null)
                    {
                        info.Name = "KSP (Steam)";
                        found.Add(info);
                    }
                }
                
                var ksp2Path = Path.Combine(commonPath, "Kerbal Space Program 2");
                if (Directory.Exists(ksp2Path))
                {
                    var info = DetectGameAt(ksp2Path);
                    if (info != null)
                    {
                        info.Name = "KSP 2 (Steam)";
                        found.Add(info);
                    }
                }
            }
        }
        catch (Exception ex)
        {
            Log.Warn("Error scanning Steam libraries", ex);
        }
        
        return found;
    }

    private string? GetSteamPath()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(@"Software\Valve\Steam");
            return key?.GetValue("SteamPath") as string;
        }
        catch
        {
            return null;
        }
    }

    private List<string> GetSteamLibraryPaths(string steamPath)
    {
        var paths = new List<string> { steamPath };
        
        try
        {
            var libraryFoldersVdf = Path.Combine(steamPath, "config", "libraryfolders.vdf");
            if (File.Exists(libraryFoldersVdf))
            {
                // Simple parse - find "path" entries
                var content = File.ReadAllText(libraryFoldersVdf);
                var matches = System.Text.RegularExpressions.Regex.Matches(
                    content, "\"path\"\\s*\"([^\"]+)\"");
                
                foreach (System.Text.RegularExpressions.Match match in matches)
                {
                    var path = match.Groups[1].Value.Replace("\\\\", "\\");
                    if (Directory.Exists(path) && !paths.Contains(path))
                    {
                        paths.Add(path);
                    }
                }
            }
        }
        catch (Exception ex)
        {
            Log.Warn("Error parsing libraryfolders.vdf", ex);
        }
        
        return paths;
    }

    private List<string> GetDefaultInstallPaths()
    {
        var paths = new List<string>();
        
        // Common Windows install locations
        var programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
        
        // GOG
        paths.Add(Path.Combine(programFiles, "GOG Galaxy", "Games", "Kerbal Space Program"));
        paths.Add(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), 
            "GOG Galaxy", "Games", "Kerbal Space Program"));
        
        // Epic
        paths.Add(Path.Combine(programFiles, "Epic Games", "KerbalSpaceProgram"));
        
        return paths;
    }

    private GameInstanceInfo? DetectGameAt(string path)
    {
        try
        {
            var dir = new DirectoryInfo(path);
            
            // Check for KSP (look for KSP.exe or buildID files + GameData)
            if (File.Exists(Path.Combine(path, "KSP_x64.exe")) || 
                File.Exists(Path.Combine(path, "KSP.exe")) ||
                File.Exists(Path.Combine(path, "buildID.txt")) ||
                File.Exists(Path.Combine(path, "buildID64.txt")))
            {
                if (Directory.Exists(Path.Combine(path, "GameData")))
                {
                    var version = DetectKspVersion(path);
                    return new GameInstanceInfo
                    {
                        Name = "KSP",
                        Path = path,
                        Game = "KSP",
                        Version = version,
                        Valid = true
                    };
                }
            }
            
            // Check for KSP2
            if (File.Exists(Path.Combine(path, "KSP2_x64.exe")) ||
                File.Exists(Path.Combine(path, "KSP2.exe")))
            {
                if (Directory.Exists(Path.Combine(path, "GameData")))
                {
                    var version = DetectKspVersion(path);
                    return new GameInstanceInfo
                    {
                        Name = "KSP 2",
                        Path = path,
                        Game = "KSP2",
                        Version = version,
                        Valid = true
                    };
                }
            }
        }
        catch (Exception ex)
        {
            Log.Warn($"Error detecting game at {path}", ex);
        }
        
        return null;
    }

    private string? DetectKspVersion(string path)
    {
        // Try buildID files first (most accurate)
        var buildId64 = Path.Combine(path, "buildID64.txt");
        if (File.Exists(buildId64))
        {
            var content = File.ReadAllText(buildId64);
            var match = System.Text.RegularExpressions.Regex.Match(content, @"build id = (\d+)");
            if (match.Success)
            {
                if (int.TryParse(match.Groups[1].Value, out int buildNum))
                {
                    // Map build number to version (simplified - real implementation uses build maps)
                    return BuildToVersion(buildNum);
                }
            }
        }
        
        // Try readme.txt
        var readme = Path.Combine(path, "readme.txt");
        if (File.Exists(readme))
        {
            var content = File.ReadAllText(readme);
            var match = System.Text.RegularExpressions.Regex.Match(content, @"Version ([\d.]+)");
            if (match.Success)
            {
                return match.Groups[1].Value;
            }
        }
        
        return null;
    }

    private string BuildToVersion(int build)
    {
        // Simplified build-to-version mapping
        // In the real CKAN, this uses KspBuildIdVersionProvider
        return build switch
        {
            >= 1950 => "1.12.5",
            >= 1900 => "1.12.3",
            >= 1800 => "1.12.0",
            >= 1700 => "1.11.2",
            >= 1600 => "1.11.1",
            >= 1500 => "1.11.0",
            >= 1400 => "1.10.1",
            >= 1300 => "1.10.0",
            >= 1200 => "1.9.1",
            >= 1100 => "1.9.0",
            >= 1000 => "1.8.1",
            _ => "1.8.0"
        };
    }

    private string GetUniqueName(string baseName)
    {
        var name = baseName;
        var i = 1;
        while (_instances.Any(i => i.Name == name))
        {
            name = $"{baseName} ({++i})";
        }
        return name;
    }

    public Task<GameInstanceInfo> AddInstanceAsync(object? args)
    {
        // args would be { path: "..." } from the frontend
        dynamic? dynArgs = args;
        string? path = dynArgs?.path;
        
        if (string.IsNullOrEmpty(path))
        {
            throw new ArgumentException("Path is required");
        }
        
        var info = DetectGameAt(path);
        if (info == null)
        {
            throw new InvalidOperationException("Not a valid game installation");
        }
        
        info.Name = GetUniqueName(info.Name);
        _instances.Add(info);
        
        Log.Info($"Added instance: {info.Name} at {info.Path}");
        
        return Task.FromResult(info);
    }

    public Task RemoveInstanceAsync(object? args)
    {
        dynamic? dynArgs = args;
        string? name = dynArgs?.name;
        
        if (string.IsNullOrEmpty(name))
        {
            throw new ArgumentException("Name is required");
        }
        
        var instance = _instances.FirstOrDefault(i => i.Name == name);
        if (instance == null)
        {
            throw new InvalidOperationException($"Instance not found: {name}");
        }
        
        _instances.Remove(instance);
        
        if (_activeInstance?.Name == name)
        {
            _activeInstance = _instances.FirstOrDefault(i => i.Valid);
        }
        
        Log.Info($"Removed instance: {name}");
        
        return Task.CompletedTask;
    }

    public Task SetActiveInstanceAsync(object? args)
    {
        dynamic? dynArgs = args;
        string? name = dynArgs?.name;
        
        if (string.IsNullOrEmpty(name))
        {
            throw new ArgumentException("Name is required");
        }
        
        var instance = _instances.FirstOrDefault(i => i.Name == name);
        if (instance == null)
        {
            throw new InvalidOperationException($"Instance not found: {name}");
        }
        
        if (!instance.Valid)
        {
            throw new InvalidOperationException($"Instance is not valid: {name}");
        }
        
        _activeInstance = instance;
        
        Log.Info($"Set active instance: {name}");
        
        return Task.CompletedTask;
    }
}