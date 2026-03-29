using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using log4net;

namespace CKAN.GUI.Services;

public interface IDownloadService
{
    Task<List<DownloadInfo>> ListDownloadsAsync();
    Task PauseDownloadAsync(object? args);
    Task ResumeDownloadAsync(object? args);
    Task CancelDownloadAsync(object? args);
    event EventHandler<DownloadProgressEventArgs>? ProgressChanged;
    event EventHandler<DownloadCompletedEventArgs>? DownloadCompleted;
}

public class DownloadInfo
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Version { get; set; } = "";
    public long Size { get; set; }
    public long Downloaded { get; set; }
    public string Status { get; set; } = "pending"; // pending, downloading, paused, completed, failed
    public long Speed { get; set; }
    public string? Error { get; set; }
    public string Url { get; set; } = "";
    public string Destination { get; set; } = "";
}

public class DownloadProgressEventArgs : EventArgs
{
    public string Id { get; set; } = "";
    public long Downloaded { get; set; }
    public long Speed { get; set; }
}

public class DownloadCompletedEventArgs : EventArgs
{
    public string Id { get; set; } = "";
    public bool Success { get; set; }
    public string? Error { get; set; }
}

public class DownloadService : IDownloadService
{
    private static readonly ILog Log = LogManager.GetLogger(typeof(DownloadService));
    private readonly ConcurrentDictionary<string, DownloadTask> _activeDownloads = new();
    private readonly IHttpClientFactory _httpClientFactory;

    public event EventHandler<DownloadProgressEventArgs>? ProgressChanged;
    public event EventHandler<DownloadCompletedEventArgs>? DownloadCompleted;

    public DownloadService(IHttpClientFactory httpClientFactory)
    {
        _httpClientFactory = httpClientFactory;
    }

    public Task<List<DownloadInfo>> ListDownloadsAsync()
    {
        var downloads = _activeDownloads.Values
            .Select(t => t.Info)
            .ToList();
        
        return Task.FromResult(downloads);
    }

    public Task StartDownloadAsync(DownloadInfo info)
    {
        var cts = new CancellationTokenSource();
        var task = new DownloadTask
        {
            Info = info,
            CancellationTokenSource = cts,
            Task = Task.Run(async () => await DownloadFileAsync(info, cts.Token))
        };
        
        _activeDownloads[info.Id] = task;
        
        info.Status = "downloading";
        Log.Info($"Started download: {info.Name}");
        
        return Task.CompletedTask;
    }

    private async Task DownloadFileAsync(DownloadInfo info, CancellationToken ct)
    {
        try
        {
            var client = _httpClientFactory.CreateClient();
            
            using var response = await client.GetAsync(info.Url, HttpCompletionOption.ResponseHeadersRead, ct);
            response.EnsureSuccessStatusCode();
            
            info.Size = response.Content.Headers.ContentLength ?? 0;
            
            var tempPath = Path.Combine(Path.GetTempPath(), $"ckan_{info.Id}");
            
            await using var contentStream = await response.Content.ReadAsStreamAsync(ct);
            await using var fileStream = new FileStream(tempPath, FileMode.Create, FileAccess.Write, FileShare.None, 8192, true);
            
            var buffer = new byte[8192];
            var totalRead = 0L;
            var lastUpdate = DateTime.Now;
            var bytesThisSecond = 0L;
            
            while (true)
            {
                ct.ThrowIfCancellationRequested();
                
                var bytesRead = await contentStream.ReadAsync(buffer, ct);
                if (bytesRead == 0) break;
                
                await fileStream.WriteAsync(buffer.AsMemory(0, bytesRead), ct);
                
                totalRead += bytesRead;
                bytesThisSecond += bytesRead;
                info.Downloaded = totalRead;
                
                // Calculate speed every second
                var now = DateTime.Now;
                if ((now - lastUpdate).TotalMilliseconds >= 1000)
                {
                    info.Speed = bytesThisSecond;
                    bytesThisSecond = 0;
                    lastUpdate = now;
                    
                    ProgressChanged?.Invoke(this, new DownloadProgressEventArgs
                    {
                        Id = info.Id,
                        Downloaded = totalRead,
                        Speed = info.Speed
                    });
                }
            }
            
            // Move to final destination
            var destDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "CKAN", "downloads");
            
            Directory.CreateDirectory(destDir);
            var destPath = Path.Combine(destDir, $"{info.Name}_{info.Version}.ckan");
            
            if (File.Exists(destPath)) File.Delete(destPath);
            File.Move(tempPath, destPath);
            
            info.Destination = destPath;
            info.Status = "completed";
            
            DownloadCompleted?.Invoke(this, new DownloadCompletedEventArgs
            {
                Id = info.Id,
                Success = true
            });
            
            Log.Info($"Download completed: {info.Name}");
        }
        catch (OperationCanceledException)
        {
            info.Status = "cancelled";
            Log.Info($"Download cancelled: {info.Name}");
        }
        catch (Exception ex)
        {
            info.Status = "failed";
            info.Error = ex.Message;
            
            DownloadCompleted?.Invoke(this, new DownloadCompletedEventArgs
            {
                Id = info.Id,
                Success = false,
                Error = ex.Message
            });
            
            Log.Error($"Download failed: {info.Name}", ex);
        }
    }

    public Task PauseDownloadAsync(object? args)
    {
        dynamic? dynArgs = args;
        string? id = dynArgs?.id;
        
        if (string.IsNullOrEmpty(id) || !_activeDownloads.TryGetValue(id!, out var task))
        {
            throw new InvalidOperationException("Download not found");
        }
        
        task.CancellationTokenSource.Cancel();
        task.Info.Status = "paused";
        
        Log.Info($"Paused download: {task.Info.Name}");
        
        return Task.CompletedTask;
    }

    public Task ResumeDownloadAsync(object? args)
    {
        // Implementation for resume would need to handle partial downloads
        return Task.CompletedTask;
    }

    public Task CancelDownloadAsync(object? args)
    {
        dynamic? dynArgs = args;
        string? id = dynArgs?.id;
        
        if (string.IsNullOrEmpty(id) || !_activeDownloads.TryGetValue(id!, out var task))
        {
            throw new InvalidOperationException("Download not found");
        }
        
        task.CancellationTokenSource.Cancel();
        _activeDownloads.TryRemove(id!, out _);
        
        Log.Info($"Cancelled download: {task.Info.Name}");
        
        return Task.CompletedTask;
    }

    private class DownloadTask
    {
        public DownloadInfo Info { get; set; } = null!;
        public CancellationTokenSource CancellationTokenSource { get; set; } = null!;
        public Task? Task { get; set; }
    }
}

public class HttpClientFactory : IHttpClientFactory
{
    public HttpClient CreateClient(string name = "")
    {
        return new HttpClient();
    }
}