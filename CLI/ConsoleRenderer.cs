using System.Text;
using System.Text.RegularExpressions;

namespace CKAN.CLI;

/// <summary>
/// ANSI terminal rendering utilities — colors, spinner, menus, tables.
/// Uses \r-based overwriting for robust cross-terminal rendering.
/// </summary>
public static class ConsoleRenderer
{
    private const string Reset  = "\x1b[0m";
    private const string Bold   = "\x1b[1m";

    private const string FgCyan     = "\x1b[36m";
    private const string FgGreen    = "\x1b[32m";
    private const string FgRed      = "\x1b[31m";
    private const string FgDimGray  = "\x1b[38;5;245m";

    private static bool _color;
    private static bool _unicode;
    private static string[] _spinnerFrames = ["-", "\\", "|", "/"];

    public static void InitConsole()
    {
        Console.OutputEncoding = Encoding.UTF8;
        Console.InputEncoding  = Encoding.UTF8;
        _color = !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("TERM"))
                 || Environment.OSVersion.Platform == PlatformID.Win32NT;
        try
        {
            Console.Out.Write('\u2713');
            _unicode = true;
            _spinnerFrames = ["\u280b", "\u2819", "\u2839", "\u2838", "\u283c",
                              "\u2834", "\u2826", "\u2827", "\u2807", "\u280f"];
            Console.Out.Write('\r' + new string(' ', WindowWidth) + '\r');
        }
        catch { _unicode = false; }
    }

    public static string Cyan(string text)    => _color ? $"{FgCyan}{text}{Reset}" : text;
    public static string Green(string text)   => _color ? $"{FgGreen}{text}{Reset}" : text;
    public static string Red(string text)     => _color ? $"{FgRed}{text}{Reset}" : text;
    public static string DimGray(string text) => _color ? $"{FgDimGray}{text}{Reset}" : text;
    public static string BoldText(string text) => _color ? $"{Bold}{text}{Reset}" : text;

    private static string Chk  => _unicode ? "\u2713" : "OK";
    private static string Cros => _unicode ? "\u2717" : "ERR";
    private static string Info => _unicode ? "\u2139" : "i";
    private static string Bul  => _unicode ? "\u2022" : "-";

    // ── Spinner ───────────────────────────────────────────────────────

    public static async Task<T> WithSpinner<T>(string message, Func<CancellationTokenSource, Task<T>> work)
    {
        var cts     = new CancellationTokenSource();
        var spinner = SpinnerLoop(message, cts.Token);
        try { return await work(cts); }
        finally
        {
            cts.Cancel();
            try { await spinner; } catch (OperationCanceledException) { }
            // Don't ClearLine() here — TokenWriter already cleared it on first write.
            // If no token was written, the error/info message will have been written by onToken.
        }
    }

    private static async Task SpinnerLoop(string message, CancellationToken ct)
    {
        int i = 0;
        while (!ct.IsCancellationRequested)
        {
            var frame = _spinnerFrames[i % _spinnerFrames.Length];
            Console.Write($"\r{Cyan(frame)} {DimGray(message)}");
            i++;
            try { await Task.Delay(100, ct); } catch (OperationCanceledException) { break; }
        }
    }

    public static void ClearLine()
    {
        var width = WindowWidth;
        Console.Write("\r" + new string(' ', width) + "\r");
    }

    // ── Welcome screen ───────────────────────────────────────────

    public static void PrintWelcome(
        string gameVersion,
        int installedCount,
        int registryModCount,
        string? instanceName,
        string providerName = "",
        string modelName = "")
    {
        var w = Math.Min(WindowWidth, 90);
        var sep = new string('\u2500', w);

        Console.WriteLine();
        Console.WriteLine($"  {Cyan("  ██████╗██╗  ██╗ █████╗ ████╗  ████╗     ████╗ ████╗")}");
        Console.WriteLine($"  {Cyan(" ██╔════╝██║ ██╔╝██╔══██╗██╔██╗ ██╔██╗    ██╔██╗██╔██╗")}");
        Console.WriteLine($"  {Cyan(" ██║     █████╔╝ ███████║██║╚██╗██║╚██╗   ██║╚████║╚██╗")}");
        Console.WriteLine($"  {Cyan(" ██║     ██╔═██╗ ██╔══██║██║ ╚████║ ╚██╗  ██║ ╚███║ ╚██╗")}");
        Console.WriteLine($"  {Cyan(" ╚██████╗██║  ██╗██║  ██║██║  ╚██║  ╚██╗ ██║  ╚█║  ╚██╗")}");
        Console.WriteLine($"  {Cyan("  ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝   ╚═╝   ╚═╝ ╚═╝   ╚═╝   ╚═╝")}");
        Console.WriteLine($"  {BoldText(Cyan("CKAN-Modern  v2.0.0"))}");
        Console.WriteLine($"  {DimGray(sep)}");
        Console.WriteLine($"  {Cyan("\u25b8")} {DimGray("Instance:")}  {instanceName ?? "\u2014"}    {DimGray("Game:")} {gameVersion}");
        Console.WriteLine($"  {Cyan("\u25b8")} {DimGray("Mods:")}    {installedCount} installed, {registryModCount} in registry");
        Console.WriteLine($"  {Cyan("\u25b8")} {DimGray("AI:")}     {providerName} {Bul} {modelName}");
        Console.WriteLine($"  {DimGray(sep)}");
        Console.WriteLine($"  {DimGray("  Type /help for commands or ask me anything about mods.")}");
        Console.WriteLine();
    }

    private static int WindowWidth
    {
        get { try { return Console.WindowWidth > 0 ? Console.WindowWidth : 80; } catch { return 80; } }
    }

    // ── Token streaming ───────────────────────────────────────────────

    public sealed class TokenWriter : IDisposable
    {
        private readonly StringBuilder _buffer = new();
        private CancellationTokenSource? _spinnerCts;
        private bool _started;

        public void SetSpinnerCts(CancellationTokenSource cts) => _spinnerCts = cts;

        public void Write(string token)
        {
            if (!_started)
            {
                _spinnerCts?.Cancel();
                ClearLine();
                _started = true;
            }
            Console.Write(token);
            _buffer.Append(token);
        }

        public string GetContent() => _buffer.ToString();

        public void Dispose()
        {
            if (_started) Console.WriteLine();
        }
    }

    // ── Summary lines ─────────────────────────────────────────────────

    public static void PrintSuccess(string message)
        => Console.WriteLine($"  {Green(Chk)} {message}");

    public static void PrintError(string message)
        => Console.WriteLine($"  {Red(Cros)} {message}");

    public static void PrintInfo(string message)
        => Console.WriteLine($"  {DimGray(Info)} {DimGray(message)}");

    // ── Table ─────────────────────────────────────────────────────────

    public static void PrintTable(string[] headers, List<string[]> rows)
    {
        if (rows.Count == 0) { PrintInfo("No results."); return; }

        var colWidths = headers.Select((h, i) =>
            Math.Max(h.Length, rows.Max(r => r.Length > i ? (r[i]?.Length ?? 0) : 0)) + 2
        ).ToArray();

        string t = _unicode ? "\u250c" : "+", m = _unicode ? "\u252c" : "+",
               rn = _unicode ? "\u2510" : "+", l = _unicode ? "\u251c" : "+",
               mm = _unicode ? "\u253c" : "+", r = _unicode ? "\u2524" : "+",
               b = _unicode ? "\u2514" : "+", bm = _unicode ? "\u2534" : "+",
               br2 = _unicode ? "\u2518" : "+", hz = _unicode ? "\u2500" : "-",
               vt = _unicode ? "\u2502" : "|";

        var w = (int[] cs) => string.Join($"{hz}{m}{hz}", cs.Select(c => new string(hz[0], c)));
        Console.WriteLine($"  {DimGray(t)}{hz}{w(colWidths)}{hz}{rn}");
        Console.Write($"  {DimGray(vt)} ");
        for (int i = 0; i < headers.Length; i++)
            Console.Write($"{BoldText(headers[i].PadRight(colWidths[i]))}{DimGray(vt)}");
        Console.WriteLine();
        Console.WriteLine($"  {DimGray(l)}{hz}{w(colWidths)}{hz}{r}");
        foreach (var row in rows)
        {
            Console.Write($"  {DimGray(vt)} ");
            for (int i = 0; i < row.Length; i++)
                Console.Write($"{row[i].PadRight(colWidths[i])}{DimGray(vt)}");
            Console.WriteLine();
        }
        Console.WriteLine($"  {DimGray(b)}{hz}{w(colWidths)}{hz}{br2}");
        Console.WriteLine($"  {DimGray($"({rows.Count} rows)")}");
    }

    // ── REPL prompt ───────────────────────────────────────────────────

    public static void PrintPrompt()
    {
        Console.Write($"\n{Cyan(">")} ");
    }

    // ── Interactive menu ─────────────────────────────────────────

    /// <summary>
    /// Interactive menu — ▸ moves on original item lines via SetCursorPosition.
    /// Console.Clear() ensures buffer is fresh; positions are always in bounds.
    /// </summary>
    public static int InteractiveMenu(
        string title,
        string[] items,
        out string? customResult,
        int defaultIndex = 0,
        bool allowCustom = false)
    {
        customResult = null;
        var allItems = allowCustom
            ? items.Append($"{Cyan("Custom...")}  {DimGray("type your own")}").ToArray()
            : items;
        int selected = Math.Clamp(defaultIndex, 0, allItems.Length - 1);

        Console.Clear();
        if (!string.IsNullOrEmpty(title))
            Console.WriteLine($"  {BoldText(Cyan(title))}");

        // Print items with initial ▸ on first item
        for (int i = 0; i < allItems.Length; i++)
            Console.WriteLine(ItemLine(i, i == selected, allItems[i]));

        // Print helper (last line, cursor stays here)
        Console.Write(HelperText(selected, allItems, items, allowCustom).PadRight(WindowWidth));

        // item positions: line 0 = title (if any), line 1 = first item (or 0 if no title)
        int firstItemLine = string.IsNullOrEmpty(title) ? 0 : 1;
        int helperLine = firstItemLine + allItems.Length;

        while (true)
        {
            var key = Console.ReadKey(true);
            int prev = selected;

            bool moved = true;
            switch (key.Key)
            {
                case ConsoleKey.UpArrow:    if (selected > 0) selected--; else moved = false; break;
                case ConsoleKey.DownArrow:  if (selected < allItems.Length - 1) selected++; else moved = false; break;
                case ConsoleKey.Enter:
                    Console.WriteLine();
                    if (allowCustom && selected >= items.Length)
                        { Console.Write($"  {Cyan("Enter custom name")}: "); customResult = Console.ReadLine()?.Trim(); return int.MaxValue; }
                    return selected;
                case ConsoleKey.Escape:
                    Console.WriteLine();
                    return -1;
                default:
                    moved = false;
                    if (key.KeyChar == 'c' && allowCustom)
                        { Console.WriteLine(); Console.Write($"  {Cyan("Enter custom name")}: "); customResult = Console.ReadLine()?.Trim(); return int.MaxValue; }
                    if (key.KeyChar >= '1' && key.KeyChar <= '9' && key.KeyChar - '0' <= allItems.Length)
                    {
                        Console.WriteLine();
                        int n = key.KeyChar - '0';
                        if (allowCustom && n - 1 >= items.Length)
                            { Console.Write($"  {Cyan("Enter custom name")}: "); customResult = Console.ReadLine()?.Trim(); return int.MaxValue; }
                        selected = n - 1;
                        moved = true;
                        prev = selected; // will be != selected after the updates below
                    }
                    break;
            }

            if (!moved || selected == prev) continue;

            // Remove ▸ from old item, add ▸ to new item
            try
            {
                Console.SetCursorPosition(0, firstItemLine + prev);
                Console.Write(ItemLine(prev, false, allItems[prev]).PadRight(WindowWidth));

                Console.SetCursorPosition(0, firstItemLine + selected);
                Console.Write(ItemLine(selected, true, allItems[selected]).PadRight(WindowWidth));

                Console.SetCursorPosition(0, helperLine);
                Console.Write(HelperText(selected, allItems, items, allowCustom).PadRight(WindowWidth));
            }
            catch { /* buffer edge case — skip update */ }
        }
    }

    private static string HelperText(int selected, string[] allItems, string[] items, bool allowCustom)
    {
        var name = allItems[selected];
        var maxLen = Math.Max(20, WindowWidth - 50);
        if (name.Length > maxLen) name = name[..(maxLen - 3)] + "...";
        var selTxt = selected < items.Length ? $"[{selected + 1}] {name}" : "[custom]";
        var txt = $"  {Cyan("\u25b8")} {selTxt}  {DimGray("| \u2191\u2193:move Enter:select Esc:cancel")}";
        if (allowCustom) txt += $"  {Cyan("c")}{DimGray(":custom")}";
        return txt;
    }

    public static int InteractiveMenu(string title, string[] items, int defaultIndex = 0)
        => InteractiveMenu(title, items, out _, defaultIndex, false);

    private static string ItemLine(int index, bool selected, string text)
    {
        var prefix = selected ? Cyan("\u25b8") : " ";
        return $"  {prefix} {DimGray($"{(index + 1).ToString().PadRight(2)}")} {text}";
    }

    // ── Prompt input ─────────────────────────────────────────────────

    public static string PromptInput(string label, string? defaultValue = null)
    {
        var defaultSuffix = defaultValue != null ? $" {DimGray($"[{defaultValue}]")}" : "";
        Console.Write($"  {Cyan(label)}:{defaultSuffix} ");
        var input = Console.ReadLine()?.Trim();
        return !string.IsNullOrEmpty(input) ? input : (defaultValue ?? "");
    }

    public static bool PromptConfirm(string message, bool defaultYes = true)
    {
        var hint = defaultYes ? "Y/n" : "y/N";
        Console.Write($"  {Cyan("?")} {message} {DimGray($"({hint})")} ");
        var input = Console.ReadLine()?.Trim().ToLowerInvariant() ?? "";
        if (string.IsNullOrEmpty(input)) return defaultYes;
        return input is "y" or "yes";
    }

    /// <summary>Strip Markdown formatting from AI output for clean terminal display.</summary>
    public static string StripMarkdown(string text)
    {
        // **bold** → bold
        text = Regex.Replace(text, @"\*\*(.+?)\*\*", "$1");
        // *italic* → italic (but not inside words)
        text = Regex.Replace(text, @"\*([^*]+?)\*", "$1");
        // `code` → code
        text = Regex.Replace(text, @"`([^`]+?)`", "$1");
        // __underline__ → underline
        text = Regex.Replace(text, @"__(.+?)__", "$1");
        // ~~strikethrough~~ → strikethrough
        text = Regex.Replace(text, @"~~(.+?)~~", "$1");
        // Remove loose # at start of lines (headings)
        text = Regex.Replace(text, @"^#{1,6}\s+", "", RegexOptions.Multiline);
        // Remove > blockquotes
        text = Regex.Replace(text, @"^>\s?", "", RegexOptions.Multiline);
        // Remove --- horizontal rules
        text = Regex.Replace(text, @"^---+$", "", RegexOptions.Multiline);
        // Collapse multiple blank lines
        text = Regex.Replace(text, @"\n{3,}", "\n\n");
        return text.Trim();
    }
}
