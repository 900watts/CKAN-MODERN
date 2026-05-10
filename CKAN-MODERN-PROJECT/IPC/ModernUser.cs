namespace CKAN.Modern.IPC;

/// <summary>
/// IUser implementation for the Modern WebView2 frontend.
/// Forwards progress/message/error events via callbacks so the
/// IpcHandler can push them to the React UI.
/// </summary>
public sealed class ModernUser : CKAN.IUser
{
    private readonly Action<string, int>? _onProgress;
    private readonly Action<string>?      _onMessage;
    private readonly Action<string>?      _onError;

    public bool Headless => false;

    public ModernUser(
        Action<string, int>? onProgress = null,
        Action<string>?      onMessage  = null,
        Action<string>?      onError    = null)
    {
        _onProgress = onProgress;
        _onMessage  = onMessage;
        _onError    = onError;
    }

    public bool RaiseYesNoDialog(string question)
    {
        // In Modern GUI, confirmations are handled by the frontend
        return true;
    }

    public int RaiseSelectionDialog(string message, params object[] args)
    {
        return 0;
    }

    public void RaiseError(string message, params object[] args)
    {
        var formatted = args.Length > 0
            ? string.Format(message, args)
            : message;
        _onError?.Invoke(formatted);
    }

    public void RaiseProgress(string message, int percent)
    {
        _onProgress?.Invoke(message, percent);
    }

    public void RaiseProgress(ByteRateCounter rateCounter)
    {
        var mbps = rateCounter.BytesPerSecond / 1048576.0;
        _onProgress?.Invoke($"Downloading... {mbps:F1} MB/s", 50);
    }

    public void RaiseMessage(string message, params object[] args)
    {
        var formatted = args.Length > 0
            ? string.Format(message, args)
            : message;
        _onMessage?.Invoke(formatted);
    }
}
