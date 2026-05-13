using System.Text.RegularExpressions;

namespace CKAN.CLI;

/// <summary>
/// Loads and manages skill files (.skill.md) from .ckan-cli/skills/ directory.
/// Skills are Markdown files with YAML frontmatter that provide specialized
/// knowledge to the AI. Also manages self-improvement memory.
/// </summary>
public static class SkillManager
{
    private static readonly string SkillsDir = Path.Combine(
        Environment.CurrentDirectory, ".ckan-cli", "skills");

    private static readonly string MemoryDir = Path.Combine(
        Environment.CurrentDirectory, ".ckan-cli", "memory");

    // Cache to avoid re-reading skill files from disk on every chat message
    private static SkillDef[]? _cachedSkills;
    private static DateTime _lastSkillsCacheTime = DateTime.MinValue;
    private static readonly TimeSpan SkillsCacheDuration = TimeSpan.FromSeconds(60);

    /// <summary>Get list of available skills with their metadata (cached).</summary>
    public static SkillDef[] ListSkills()
    {
        try
        {
            if (_cachedSkills != null && (DateTime.UtcNow - _lastSkillsCacheTime) < SkillsCacheDuration)
                return _cachedSkills;

            if (!Directory.Exists(SkillsDir)) return _cachedSkills = [];
            _cachedSkills = Directory.GetFiles(SkillsDir, "*.skill.md")
                .Select(ParseSkillFile)
                .Where(s => s != null)
                .Select(s => s!)
                .ToArray();
            _lastSkillsCacheTime = DateTime.UtcNow;
            return _cachedSkills;
        }
        catch { return []; }
    }

    /// <summary>Invalidate the skills cache so the next load re-reads from disk.</summary>
    public static void InvalidateSkillsCache()
    {
        _cachedSkills = null;
        _lastSkillsCacheTime = DateTime.MinValue;
    }

    /// <summary>Load a skill by name (matches filename or frontmatter name).</summary>
    public static string? LoadSkill(string name)
    {
        var skills = ListSkills();
        var match = skills.FirstOrDefault(s =>
            s.Name.Equals(name, StringComparison.OrdinalIgnoreCase) ||
            s.FileName.Equals(name, StringComparison.OrdinalIgnoreCase));
        return match?.Content;
    }

    /// <summary>Auto-detect relevant skills based on user message keywords.</summary>
    public static string LoadRelevantSkills(string userMessage)
    {
        var skills = ListSkills();
        var relevant = new List<string>();
        var msg = userMessage.ToLowerInvariant();

        foreach (var skill in skills)
        {
            if (skill.Triggers.Any(t => msg.Contains(t.ToLowerInvariant())))
            {
                relevant.Add(skill.Content);
            }
        }

        return relevant.Count > 0
            ? $"\n\n## Loaded Skills\n\n{string.Join("\n\n---\n\n", relevant)}"
            : "";
    }

    // ── Self-Improvement Memory ───────────────────────────────────

    /// <summary>Load past learnings from self-improvement memory.</summary>
    public static string LoadMemory()
    {
        try
        {
            if (!Directory.Exists(MemoryDir)) return "";
            var files = Directory.GetFiles(MemoryDir, "*.md")
                .OrderByDescending(f => f)
                .Take(3) // last 3 memory files
                .ToArray();

            if (files.Length == 0) return "";

            var content = string.Join("\n\n", files.Select(f =>
            {
                var text = File.ReadAllText(f).Trim();
                return !string.IsNullOrEmpty(text) ? text : null;
            }).Where(t => t != null));

            return !string.IsNullOrEmpty(content)
                ? $"\n\n## Self-Improvement Memory\n\n{content}"
                : "";
        }
        catch { return ""; }
    }

    /// <summary>Save a self-improvement note (error, correction, learning).</summary>
    public static void SaveMemory(string entry)
    {
        try
        {
            if (!Directory.Exists(MemoryDir))
                Directory.CreateDirectory(MemoryDir);

            var date = DateTime.Now.ToString("yyyy-MM-dd-HHmmss");
            var path = Path.Combine(MemoryDir, $"{date}.md");
            File.WriteAllText(path, $"# Learning: {DateTime.Now:yyyy-MM-dd HH:mm}\n\n{entry.Trim()}\n");
        }
        catch { /* best effort */ }
    }

    // ── Parse skill files ─────────────────────────────────────────

    private static SkillDef? ParseSkillFile(string path)
    {
        try
        {
            var text = File.ReadAllText(path);
            var fileName = Path.GetFileNameWithoutExtension(Path.GetFileNameWithoutExtension(path)); // strip .skill.md

            // Parse YAML frontmatter (between --- markers)
            var name = fileName;
            var description = "";
            var triggers = Array.Empty<string>();

            var match = Regex.Match(text, @"^---\s*\n(.*?)\n---", RegexOptions.Singleline);
            if (match.Success)
            {
                var fm = match.Groups[1].Value;
                name = ExtractField(fm, "name") ?? name;
                description = ExtractField(fm, "description") ?? "";
                var triggerStr = ExtractField(fm, "triggers");
                if (triggerStr != null)
                {
                    triggers = triggerStr.Trim('[', ']')
                        .Split(',')
                        .Select(t => t.Trim().Trim('"', '\''))
                        .Where(t => !string.IsNullOrEmpty(t))
                        .ToArray();
                }

                // Content is everything after the frontmatter
                text = text[(match.Index + match.Length)..].Trim();
            }

            return new SkillDef(fileName, name, description, triggers, text);
        }
        catch { return null; }
    }

    private static string? ExtractField(string frontmatter, string field)
    {
        var m = Regex.Match(frontmatter, $@"^{field}\s*:\s*(.+)$", RegexOptions.Multiline);
        return m.Success ? m.Groups[1].Value.Trim() : null;
    }
}

public record SkillDef(
    string FileName,
    string Name,
    string Description,
    string[] Triggers,
    string Content
);
