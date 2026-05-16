using System.Net.Http;
using System.Net.Http.Headers;
using System.IO;
using System.Reflection;
using log4net;
using Newtonsoft.Json.Linq;

namespace CKAN.Modern.IPC;

/// <summary>
/// Checks GitHub Releases for newer versions and downloads updates.
/// Uses the GitHub API (no auth required for public repos).
/// </summary>
public sealed class UpdateChecker : IDisposable
{
    private static readonly ILog log = LogManager.GetLogger(typeof(UpdateChecker));
    private readonly HttpClient _http;

    private const string GITHUB_OWNER = "900watts";
    private const string GITHUB_REPO  = "CKAN-MODERN";
    private const string CURRENT_BUILD = "build-23";  // tag of the current release
    private const string API_URL = $"https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/releases/latest";

    public UpdateChecker()
    {
        _http = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
        _http.DefaultRequestHeaders.UserAgent.Add(
            new ProductInfoHeaderValue("CKAN-Modern", "2.0"));
        _http.DefaultRequestHeaders.Accept.Add(
            new MediaTypeWithQualityHeaderValue("application/vnd.github+json"));
    }

    /// <summary>
    /// Check if a newer release exists on GitHub.
    /// Returns update info or null if already up-to-date.
    /// </summary>
    public async Task<UpdateInfo?> CheckForUpdateAsync()
    {
        try
        {
            log.Info("[UpdateChecker] Checking for updates...");
            var response = await _http.GetStringAsync(API_URL);
            var release = JObject.Parse(response);

            var tagName   = release["tag_name"]?.ToString() ?? "";
            var name      = release["name"]?.ToString() ?? tagName;
            var body      = release["body"]?.ToString() ?? "";
            var htmlUrl   = release["html_url"]?.ToString() ?? "";
            var published = release["published_at"]?.ToString() ?? "";

            // Compare build numbers — only offer update if remote is NEWER
            if (!IsNewerBuild(tagName, CURRENT_BUILD))
            {
                log.Info($"[UpdateChecker] Already up to date (current: {CURRENT_BUILD}, remote: {tagName})");
                return null;
            }

            // Find download assets
            var assets = release["assets"] as JArray ?? new JArray();
            string? liteUrl = null;
            string? bundledUrl = null;
            long liteSize = 0, bundledSize = 0;

            foreach (var asset in assets)
            {
                var assetName = asset["name"]?.ToString() ?? "";
                var downloadUrl = asset["browser_download_url"]?.ToString() ?? "";
                var size = asset["size"]?.Value<long>() ?? 0;

                if (assetName.Equals("CKAN-M.exe", StringComparison.OrdinalIgnoreCase))
                {
                    liteUrl = downloadUrl;
                    liteSize = size;
                }
                else if (assetName.Equals("CKAN-M-bundled.exe", StringComparison.OrdinalIgnoreCase))
                {
                    bundledUrl = downloadUrl;
                    bundledSize = size;
                }
            }

            log.Info($"[UpdateChecker] Update available: {tagName} ({name})");

            return new UpdateInfo
            {
                TagName       = tagName,
                ReleaseName   = name,
                ReleaseNotes  = body,
                ReleaseUrl    = htmlUrl,
                PublishedAt   = published,
                LiteDownloadUrl    = liteUrl,
                BundledDownloadUrl = bundledUrl,
                LiteSize      = liteSize,
                BundledSize   = bundledSize,
            };
        }
        catch (Exception ex)
        {
            log.Error("[UpdateChecker] Failed to check for updates", ex);
            return null;
        }
    }

    /// <summary>
    /// Download the update exe to a temp file, then launch the
    /// replacement script and exit the current process.
    /// </summary>
    public async Task<bool> DownloadAndApplyAsync(
        string downloadUrl,
        Action<string, int>? onProgress = null)
    {
        try
        {
            var currentExe = Environment.ProcessPath;
            if (string.IsNullOrEmpty(currentExe))
            {
                log.Error("[UpdateChecker] Cannot determine current exe path");
                return false;
            }

            var tempPath = currentExe + ".update";

            onProgress?.Invoke("Downloading update...", 0);

            using var response = await _http.GetAsync(downloadUrl, HttpCompletionOption.ResponseHeadersRead);
            response.EnsureSuccessStatusCode();

            var totalBytes = response.Content.Headers.ContentLength ?? -1;
            using var contentStream = await response.Content.ReadAsStreamAsync();
            using var fileStream = new FileStream(tempPath, FileMode.Create, FileAccess.Write, FileShare.None);

            var buffer = new byte[81920];
            long totalRead = 0;
            int bytesRead;

            while ((bytesRead = await contentStream.ReadAsync(buffer)) > 0)
            {
                await fileStream.WriteAsync(buffer.AsMemory(0, bytesRead));
                totalRead += bytesRead;

                if (totalBytes > 0)
                {
                    var pct = (int)(totalRead * 100 / totalBytes);
                    onProgress?.Invoke($"Downloading... {totalRead / 1048576}MB / {totalBytes / 1048576}MB", pct);
                }
            }

            onProgress?.Invoke("Download complete. Restarting...", 100);

            // Write a tiny batch script that waits for the old process to exit,
            // replaces the exe, and restarts it
            var batchPath = Path.Combine(Path.GetTempPath(), "ckan_update.bat");
            var batchContent = $"""
                @echo off
                timeout /t 2 /nobreak >nul
                move /y "{tempPath}" "{currentExe}" >nul
                start "" "{currentExe}"
                del "%~f0"
                """;

            File.WriteAllText(batchPath, batchContent);

            // Launch the updater script and exit this process
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
            {
                FileName = batchPath,
                CreateNoWindow = true,
                UseShellExecute = false,
                WindowStyle = System.Diagnostics.ProcessWindowStyle.Hidden,
            });

            // Shutdown the app
            System.Windows.Application.Current.Dispatcher.Invoke(() =>
            {
                System.Windows.Application.Current.Shutdown();
            });

            return true;
        }
        catch (Exception ex)
        {
            log.Error("[UpdateChecker] Failed to download/apply update", ex);
            return false;
        }
    }

    /// <summary>
    /// Compare build tags like "build-21" and "build-23".
    /// Returns true only if remoteTag has a higher build number than currentTag.
    /// </summary>
    private static bool IsNewerBuild(string remoteTag, string currentTag)
    {
        if (string.Equals(remoteTag, currentTag, StringComparison.OrdinalIgnoreCase))
            return false;

        static int ExtractBuildNumber(string tag)
        {
            var idx = tag.LastIndexOf('-');
            if (idx >= 0 && int.TryParse(tag.AsSpan(idx + 1), out var num))
                return num;
            return -1;
        }

        var remoteNum = ExtractBuildNumber(remoteTag);
        var currentNum = ExtractBuildNumber(currentTag);

        if (remoteNum >= 0 && currentNum >= 0)
            return remoteNum > currentNum;

        // Fallback: different tags where we can't parse numbers — treat as update
        return true;
    }

    public void Dispose() => _http.Dispose();
}

public class UpdateInfo
{
    public string TagName { get; set; } = "";
    public string ReleaseName { get; set; } = "";
    public string ReleaseNotes { get; set; } = "";
    public string ReleaseUrl { get; set; } = "";
    public string PublishedAt { get; set; } = "";
    public string? LiteDownloadUrl { get; set; }
    public string? BundledDownloadUrl { get; set; }
    public long LiteSize { get; set; }
    public long BundledSize { get; set; }
}
