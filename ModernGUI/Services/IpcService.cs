using System;
using System.Threading.Tasks;
using Autofac;
using log4net;

namespace CKAN.GUI.Services;

public interface IIpcService
{
    Task<object?> HandleAsync(string channel, object? args);
}

public class IpcService : IIpcService
{
    private static readonly ILog Log = LogManager.GetLogger(typeof(IpcService));

    private readonly IGameInstanceService _gameInstanceService;
    private readonly IDownloadService _downloadService;
    private readonly IModService _modService;
    private readonly IAIService _aiService;

    public IpcService(
        IGameInstanceService gameInstanceService,
        IDownloadService downloadService,
        IModService modService,
        IAIService aiService)
    {
        _gameInstanceService = gameInstanceService;
        _downloadService = downloadService;
        _modService = modService;
        _aiService = aiService;
    }

    public async Task<object?> HandleAsync(string channel, object? args)
    {
        Log.Debug($"IPC: {channel}");
        
        return channel switch
        {
            // Game Instance Management
            "game:list-instances" => await _gameInstanceService.ListInstancesAsync(),
            "game:scan" => await _gameInstanceService.ScanForGamesAsync(),
            "game:add" => await _gameInstanceService.AddInstanceAsync(args),
            "game:remove" => await _gameInstanceService.RemoveInstanceAsync(args),
            "game:set-active" => await _gameInstanceService.SetActiveInstanceAsync(args),
            
            // Downloads
            "download:list" => await _downloadService.ListDownloadsAsync(),
            "download:pause" => await _downloadService.PauseDownloadAsync(args),
            "download:resume" => await _downloadService.ResumeDownloadAsync(args),
            "download:cancel" => await _downloadService.CancelDownloadAsync(args),
            
            // Mods
            "mod:search" => await _modService.SearchModsAsync(args),
            "mod:list-installed" => await _modService.ListInstalledAsync(),
            "mod:install" => await _modService.InstallModAsync(args),
            "mod:uninstall" => await _modService.UninstallModAsync(args),
            "mod:get-details" => await _modService.GetModDetailsAsync(args),
            
            // AI
            "ai:chat" => await _aiService.ChatAsync(args),
            "ai:points-balance" => await _aiService.GetPointsBalanceAsync(),
            
            // App
            "app:get-version" => new { version = "2.0.0", build = "modern" },
            
            _ => throw new NotSupportedException($"Unknown channel: {channel}")
        };
    }
}

public class ServiceModule : Module
{
    protected override void Load(ContainerBuilder builder)
    {
        builder.RegisterType<GameInstanceService>().As<IGameInstanceService>().SingleInstance();
        builder.RegisterType<DownloadService>().As<IDownloadService>().SingleInstance();
        builder.RegisterType<ModService>().As<IModService>().SingleInstance();
        builder.RegisterType<AIChatService>().As<IAIService>().SingleInstance();
        builder.RegisterType<IpcService>().As<IIpcService>().SingleInstance();
    }
}