using System.Globalization;
using System.Net;
using log4net;

namespace CKAN.Modern.IPC;

/// <summary>
/// Automatically detects whether the user is in China and accelerates
/// GitHub downloads by routing them through a proxy mirror.
/// Users can override this in Settings.
/// </summary>
public static class DownloadAccelerator
{
    private static readonly ILog log = LogManager.GetLogger(typeof(DownloadAccelerator));

    // GitHub proxy mirrors — tried in order, first working one wins
    private static readonly string[] CnProxies = new[]
    {
        "https://ghfast.top/",
        "https://gh-proxy.com/",
        "https://mirror.ghproxy.com/",
    };

    private static bool? _isCnUser;
    private static bool _enabled = true;          // can be toggled by user
    private static string? _activeProxy;           // the proxy that passed the health check
    private static bool _proxyTested;

    /// <summary>
    /// Whether download acceleration is enabled.
    /// </summary>
    public static bool Enabled
    {
        get => _enabled;
        set
        {
            _enabled = value;
            log.Info($"[Accel] Download acceleration {(value ? "enabled" : "disabled")}");
        }
    }

    /// <summary>
    /// Detect if the user is likely in China based on system locale/timezone.
    /// </summary>
    public static bool IsChinaUser
    {
        get
        {
            if (_isCnUser.HasValue) return _isCnUser.Value;

            // Check system culture
            var culture = CultureInfo.CurrentUICulture;
            bool cnCulture = culture.Name.StartsWith("zh-CN", StringComparison.OrdinalIgnoreCase)
                          || culture.Name.StartsWith("zh-Hans", StringComparison.OrdinalIgnoreCase);

            // Check timezone (UTC+8, common in China)
            var tz = TimeZoneInfo.Local;
            bool cnTimezone = tz.BaseUtcOffset == TimeSpan.FromHours(8)
                           && (tz.Id.Contains("China", StringComparison.OrdinalIgnoreCase)
                            || tz.Id.Contains("Shanghai", StringComparison.OrdinalIgnoreCase)
                            || tz.Id.Contains("Beijing", StringComparison.OrdinalIgnoreCase)
                            || tz.Id == "China Standard Time");

            _isCnUser = cnCulture || cnTimezone;
            log.Info($"[Accel] CN user detection: culture={culture.Name}, tz={tz.Id}, result={_isCnUser}");
            return _isCnUser.Value;
        }
    }

    /// <summary>
    /// Whether acceleration should be applied (CN user + enabled).
    /// </summary>
    public static bool ShouldAccelerate => Enabled && IsChinaUser;

    /// <summary>
    /// Rewrite a download URL to go through a CN proxy if applicable.
    /// Only rewrites GitHub URLs (github.com, raw.githubusercontent.com, objects.githubusercontent.com).
    /// Non-GitHub URLs pass through unchanged.
    /// </summary>
    public static Uri AccelerateUri(Uri original)
    {
        if (!ShouldAccelerate) return original;

        // Only proxy GitHub hosts
        var host = original.Host.ToLowerInvariant();
        if (host != "github.com"
            && host != "raw.githubusercontent.com"
            && host != "objects.githubusercontent.com"
            && !host.EndsWith(".github.com"))
        {
            return original;
        }

        // Use the active proxy or find one
        var proxy = GetActiveProxy();
        if (proxy == null) return original;

        // Rewrite: proxy + original full URL
        var accelerated = new Uri(proxy + original.AbsoluteUri);
        log.DebugFormat("[Accel] {0} -> {1}", original, accelerated);
        return accelerated;
    }

    /// <summary>
    /// Find a working proxy from the list, or return the cached one.
    /// </summary>
    private static string? GetActiveProxy()
    {
        if (_activeProxy != null) return _activeProxy;
        if (_proxyTested) return null; // already tested, none worked

        _proxyTested = true;

        foreach (var proxy in CnProxies)
        {
            try
            {
                // Quick health check — just see if the proxy responds
                var testUrl = proxy + "https://github.com/KSP-CKAN/CKAN-meta/raw/master/README.md";
                #pragma warning disable SYSLIB0014
                var req = (HttpWebRequest)WebRequest.Create(testUrl);
                #pragma warning restore SYSLIB0014
                req.Method = "HEAD";
                req.Timeout = 5000;
                req.AllowAutoRedirect = true;
                using var resp = (HttpWebResponse)req.GetResponse();
                if ((int)resp.StatusCode < 400)
                {
                    _activeProxy = proxy;
                    log.Info($"[Accel] Using proxy: {proxy}");
                    return proxy;
                }
            }
            catch (Exception ex)
            {
                log.Debug($"[Accel] Proxy {proxy} failed: {ex.Message}");
            }
        }

        log.Warn("[Accel] No working proxy found, downloads will use direct GitHub");
        return null;
    }

    /// <summary>
    /// Force re-detection (e.g. when user changes settings).
    /// </summary>
    public static void Reset()
    {
        _activeProxy = null;
        _proxyTested = false;
    }

    /// <summary>
    /// Get current status for the UI.
    /// </summary>
    public static object GetStatus()
    {
        return new
        {
            enabled = Enabled,
            isCnUser = IsChinaUser,
            shouldAccelerate = ShouldAccelerate,
            activeProxy = _activeProxy ?? "",
        };
    }
}
