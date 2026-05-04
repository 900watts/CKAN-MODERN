using System.Diagnostics.CodeAnalysis;

namespace CKAN.Modern.IPC;

/// <summary>
/// IUser implementation for CKAN Modern.
/// Routes messages and progress to the IPC bridge for frontend display.
/// Dialogs auto-confirm (headless behavior) since the React UI handles user interaction.
/// </summary>
public class ModernUser : IUser
{
    private readonly Action<string, int>? _onProgress;
    private readonly Action<string>? _onMessage;
    private readonly Action<string>? _onError;

    public ModernUser(
        Action<string, int>? onProgress = null,
        Action<string>? onMessage = null,
        Action<string>? onError = null)
    {
        _onProgress = onProgress;
        _onMessage = onMessage;
        _onError = onError;
    }

    public bool Headless => true;

    public bool RaiseYesNoDialog(string question)
    {
        _onMessage?.Invoke($"[Dialog] {question} -> auto-confirmed");
        return true;
    }

    public int RaiseSelectionDialog(string message, params object[] args)
    {
        // Auto-select first option (index 0)
        _onMessage?.Invoke($"[Selection] {message} -> auto-selected first option");
        return 0;
    }

    public void RaiseError(
        [StringSyntax(StringSyntaxAttribute.CompositeFormat)] string message,
        params object[] args)
    {
        var formatted = string.Format(message, args);
        _onError?.Invoke(formatted);
    }

    public void RaiseProgress(string message, int percent)
    {
        _onProgress?.Invoke(message, percent);
    }

    public void RaiseProgress(ByteRateCounter rateCounter)
    {
        int pct = rateCounter.Size > 0
            ? (int)(100.0 * (rateCounter.Size - rateCounter.BytesLeft) / rateCounter.Size)
            : 0;
        _onProgress?.Invoke("Downloading...", pct);
    }

    public void RaiseMessage(
        [StringSyntax(StringSyntaxAttribute.CompositeFormat)] string message,
        params object[] args)
    {
        var formatted = string.Format(message, args);
        _onMessage?.Invoke(formatted);
    }
}
