namespace CKAN.CLI;

/// <summary>
/// Terminal output formatting with ANSI colors and simple markdown rendering.
/// </summary>
public static class ConsoleRenderer
{
    // ANSI color codes
    private const string Reset   = "\x1b[0m";
    private const string Bold    = "\x1b[1m";
    private const string Dim     = "\x1b[2m";
    private const string Cyan    = "\x1b[36m";
    private const string Green   = "\x1b[32m";
    private const string Red     = "\x1b[31m";
    private const string Yellow  = "\x1b[33m";
    private const string Magenta = "\x1b[35m";
    private const string White   = "\x1b[37m";
    private const string BgDark  = "\x1b[48;5;236m";

    public static void PrintBanner(string instanceName, string gameVersion, int installedCount, int registryCount)
    {
        Console.WriteLine();
        Console.WriteLine($"{Cyan}{Bold}  CKAN AI CLI{Reset} {Dim}v2.0.0{Reset}");
        Console.WriteLine($"{Dim}  ──────────────────────────{Reset}");
        if (!string.IsNullOrEmpty(instanceName))
        {
            Console.WriteLine($"  Instance:  {Bold}{instanceName}{Reset} {Dim}({gameVersion}){Reset}");
            Console.WriteLine($"  Installed: {Green}{installedCount}{Reset} mods");
            Console.WriteLine($"  Registry:  {Cyan}{registryCount}{Reset} mods");
        }
        else
        {
            Console.WriteLine($"  {Yellow}No game instance detected{Reset}");
            Console.WriteLine($"  Use {Bold}/instance add <path>{Reset} to add one");
        }
        Console.WriteLine();
    }

    public static void PrintPrompt()
    {
        Console.Write($"{Cyan}{Bold}>{Reset} ");
    }

    public static void PrintAiResponse(string text)
    {
        // Strip action commands from display and render markdown-lite
        var lines = text.Split('\n');
        foreach (var line in lines)
        {
            var rendered = RenderMarkdownLine(line);
            Console.WriteLine($"  {rendered}");
        }
        Console.WriteLine();
    }

    public static void PrintAction(string action, string target, bool success)
    {
        var icon = success ? $"{Green}+{Reset}" : $"{Red}x{Reset}";
        var color = success ? Green : Red;
        Console.WriteLine($"  {icon} {Bold}{action}{Reset} {color}{target}{Reset}");
    }

    public static void PrintSuccess(string message)
    {
        Console.WriteLine($"  {Green}+{Reset} {message}");
    }

    public static void PrintError(string message)
    {
        Console.WriteLine($"  {Red}x{Reset} {message}");
    }

    public static void PrintWarning(string message)
    {
        Console.WriteLine($"  {Yellow}!{Reset} {message}");
    }

    public static void PrintInfo(string message)
    {
        Console.WriteLine($"  {Dim}{message}{Reset}");
    }

    public static void PrintSearchResults(IEnumerable<(string id, string name, string desc, string version)> results)
    {
        Console.WriteLine();
        foreach (var (id, name, desc, version) in results)
        {
            Console.WriteLine($"  {Bold}{name}{Reset} {Dim}({id} v{version}){Reset}");
            if (!string.IsNullOrWhiteSpace(desc))
            {
                var shortDesc = desc.Length > 80 ? desc[..77] + "..." : desc;
                Console.WriteLine($"    {Dim}{shortDesc}{Reset}");
            }
        }
        Console.WriteLine();
    }

    public static void PrintInstalledMods(IEnumerable<(string id, string name, string version, bool autoInstalled)> mods)
    {
        Console.WriteLine();
        foreach (var (id, name, version, auto) in mods)
        {
            var autoTag = auto ? $" {Dim}(auto){Reset}" : "";
            Console.WriteLine($"  {Green}*{Reset} {Bold}{name}{Reset} {Dim}v{version}{Reset}{autoTag}");
        }
        Console.WriteLine();
    }

    public static void PrintStreaming(string token)
    {
        Console.Write(token);
    }

    public static void EndStreaming()
    {
        Console.WriteLine();
        Console.WriteLine();
    }

    private static string RenderMarkdownLine(string line)
    {
        // Bold: **text** → ANSI bold
        line = System.Text.RegularExpressions.Regex.Replace(
            line, @"\*\*(.+?)\*\*", $"{Bold}$1{Reset}");

        // Inline code: `text` → dim
        line = System.Text.RegularExpressions.Regex.Replace(
            line, @"`(.+?)`", $"{Cyan}$1{Reset}");

        // Bullet points
        if (line.TrimStart().StartsWith("- ") || line.TrimStart().StartsWith("* "))
        {
            var indent = line.Length - line.TrimStart().Length;
            line = new string(' ', indent) + $"{Cyan}*{Reset} " + line.TrimStart()[2..];
        }

        // Headers
        if (line.TrimStart().StartsWith("### "))
            line = $"{Bold}{line.TrimStart()[4..]}{Reset}";
        else if (line.TrimStart().StartsWith("## "))
            line = $"{Bold}{Cyan}{line.TrimStart()[3..]}{Reset}";

        // Strip action tags from display
        line = System.Text.RegularExpressions.Regex.Replace(line, @"\[(INSTALL|UNINSTALL|SEARCH|REFRESH_REPO)(:[^\]]+)?\]", "");

        return line;
    }
}
