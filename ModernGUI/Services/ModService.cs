using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using log4net;

namespace CKAN.GUI.Services;

public interface IModService
{
    Task<List<ModInfo>> SearchModsAsync(object? args);
    Task<List<ModInfo>> ListInstalledAsync();
    Task InstallModAsync(object? args);
    Task UninstallModAsync(object? args);
    Task<ModDetails> GetModDetailsAsync(object? args);
}

public class ModInfo
{
    public string Identifier { get; set; } = "";
    public string Name { get; set; } = "";
    public string Version { get; set; } = "";
    public string? Description { get; set; }
    public string? Author { get; set; }
    public long? Size { get; set; }
    public bool IsInstalled { get; set; }
    public bool HasUpdate { get; set; }
    public List<string> Tags { get; set; } = new();
    public List<string> Dependencies { get; set; } = new();
}

public class ModDetails
{
    public string Identifier { get; set; } = "";
    public string Name { get; set; } = "";
    public string Version { get; set; } = "";
    public string? Abstract { get; set; }
    public string? Description { get; set; }
    public string? Author { get; set; }
    public string? License { get; set; }
    public string? Website { get; set; }
    public long? Size { get; set; }
    public List<string> Tags { get; set; } = new();
    public List<ModInfo> Dependencies { get; set; } = new();
    public List<ModInfo> Recommended { get; set; } = new();
    public List<ModInfo> Suggested { get; set; } = new();
    public List<string> Conflicts { get; set; } = new();
}

public class ModService : IModService
{
    private static readonly ILog Log = LogManager.GetLogger(typeof(ModService));
    
    // In a real implementation, this would query the CKAN registry/Netkan
    private readonly List<ModInfo> _mockMods = new()
    {
        new ModInfo { Identifier = "realfuels", Name = "Real Fuels", Version = "1.4.1", Description = "Realistic fuel tanks", Author = "RealFuels Team", IsInstalled = false },
        new ModInfo { Identifier = "realismoverhaul", Name = "Realism Overhaul", Version = "1.11.0", Description = "Scale KSP to reality", Author = "Realism Overhaul Team", IsInstalled = false },
        new ModInfo { Identifier = "kSPInterstellar", Name = "KSP Interstellar", Version = "1.3.1", Description = "Nuclear and exotic propulsion", Author = "Nuclear" },
        new ModInfo { Identifier = "mechjeb2", Name = "MechJeb2", Version = "2.14.0", Description = "Flight assistance", Author = "MechJeb Team", IsInstalled = true },
        new ModInfo { Identifier = "engineeringtoolskit", Name = "Engineering Tools Kit", Version = "1.4.6", Description = "In-game calculations", Author = "Micha", IsInstalled = false },
        new ModInfo { Identifier = "kAS", Name = "kOS", Version = "1.4.0", Description = "Scriptable Autopilot", Author = "kOS Team", IsInstalled = false },
        new ModInfo { Identifier = "TAC", Name = "TAC Life Support", Version = "1.1.2", Description = "Life support systems", Author = "TAC", IsInstalled = false },
        new ModInfo { Identifier = " remotetech2", Name = "RemoteTech", Version = "1.9.1", Description = "Comm network", Author = "RemoteTech Team", IsInstalled = false },
    };

    public Task<List<ModInfo>> SearchModsAsync(object? args)
    {
        dynamic? dynArgs = args;
        string? query = dynArgs?.query;
        
        if (string.IsNullOrEmpty(query))
        {
            return Task.FromResult(_mockMods.Take(20).ToList());
        }
        
        var results = _mockMods
            .Where(m => m.Name.Contains(query, StringComparison.OrdinalIgnoreCase) ||
                       m.Identifier.Contains(query, StringComparison.OrdinalIgnoreCase) ||
                       (m.Description?.Contains(query, StringComparison.OrdinalIgnoreCase) ?? false))
            .ToList();
        
        Log.Debug($"Search '{query}' returned {results.Count} results");
        
        return Task.FromResult(results);
    }

    public Task<List<ModInfo>> ListInstalledAsync()
    {
        var installed = _mockMods.Where(m => m.IsInstalled).ToList();
        return Task.FromResult(installed);
    }

    public Task InstallModAsync(object? args)
    {
        // In real implementation, this would:
        // 1. Resolve dependencies using RelationshipResolver
        // 2. Download files using NetModuleCache
        // 3. Install using ModuleInstaller
        
        dynamic? dynArgs = args;
        string? identifier = dynArgs?.identifier;
        
        if (string.IsNullOrEmpty(identifier))
        {
            throw new ArgumentException("Identifier required");
        }
        
        var mod = _mockMods.FirstOrDefault(m => m.Identifier == identifier);
        if (mod != null)
        {
            mod.IsInstalled = true;
            Log.Info($"Installed mod: {identifier}");
        }
        
        return Task.CompletedTask;
    }

    public Task UninstallModAsync(object? args)
    {
        dynamic? dynArgs = args;
        string? identifier = dynArgs?.identifier;
        
        if (string.IsNullOrEmpty(identifier))
        {
            throw new ArgumentException("Identifier required");
        }
        
        var mod = _mockMods.FirstOrDefault(m => m.Identifier == identifier);
        if (mod != null)
        {
            mod.IsInstalled = false;
            Log.Info($"Uninstalled mod: {identifier}");
        }
        
        return Task.CompletedTask;
    }

    public Task<ModDetails> GetModDetailsAsync(object? args)
    {
        dynamic? dynArgs = args;
        string? identifier = dynArgs?.identifier;
        
        if (string.IsNullOrEmpty(identifier))
        {
            throw new ArgumentException("Identifier required");
        }
        
        var mod = _mockMods.FirstOrDefault(m => m.Identifier == identifier);
        
        if (mod == null)
        {
            throw new InvalidOperationException($"Mod not found: {identifier}");
        }
        
        var details = new ModDetails
        {
            Identifier = mod.Identifier,
            Name = mod.Name,
            Version = mod.Version,
            Abstract = mod.Description,
            Description = mod.Description,
            Author = mod.Author,
            License = "MIT",
            Size = mod.Size,
        };
        
        return Task.FromResult(details);
    }
}