namespace CKAN.CLI;

/// <summary>
/// Simple IUser implementation for the CLI — prints progress to console.
/// </summary>
public class CliUser : IUser
{
    public bool Headless => true;

    public void RaiseMessage(string message, params object[] args)
    {
        if (args.Length > 0)
            ConsoleRenderer.PrintInfo(string.Format(message, args));
        else
            ConsoleRenderer.PrintInfo(message);
    }

    public void RaiseError(string message, params object[] args)
    {
        if (args.Length > 0)
            ConsoleRenderer.PrintError(string.Format(message, args));
        else
            ConsoleRenderer.PrintError(message);
    }

    public void RaiseProgress(string message, int percent)
    {
        // Only show major milestones to avoid spamming
        if (percent % 25 == 0 || percent >= 100)
        {
            ConsoleRenderer.PrintInfo($"{message} ({percent}%)");
        }
    }

    public void RaiseProgress(int percent, long bytesPerSecond, long bytesLeft)
    {
        // Quiet — download progress handled by the installer
    }

    public void RaiseProgress(ByteRateCounter rateCounter)
    {
        // Quiet — byte rate progress
    }

    public bool RaiseYesNoDialog(string question)
    {
        // Auto-confirm in headless mode
        return true;
    }

    public int RaiseSelectionDialog(string message, params object[] args)
    {
        // Auto-select first option
        return 0;
    }
}
