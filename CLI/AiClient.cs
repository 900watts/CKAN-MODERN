using System.Net.Http.Headers;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace CKAN.CLI;

/// <summary>
/// Multi-provider AI client supporting Ollama, OpenAI, Anthropic, Groq, and OpenRouter.
/// Uses a common streaming chat interface across all providers.
/// </summary>
public sealed class AiClient : IDisposable
{
    private readonly HttpClient _http;
    private readonly AiProviderDef _provider;
    private readonly string _endpoint;
    private readonly string _model;
    private readonly string? _apiKey;

    private readonly List<ChatMessage> _history = new();
    private const int MaxHistoryMessages = 40;
    private const string SystemPrompt = @"
You are CKAN-CLI, an AI assistant that helps users manage Kerbal Space Program mods.

You can perform the following actions by embedding them in your response:

- [INSTALL:mod_identifier] - Install a mod by its identifier
- [UNINSTALL:mod_identifier] - Uninstall a mod by its identifier
- [UPGRADE:mod_identifier] - Upgrade a specific mod to the latest version
- [UPGRADE_ALL] - Upgrade all outdated mods at once
- [SEARCH:query] - Search for mods matching a query
- [REFRESH_REPO] - Refresh the mod repository metadata
- [LIST_INSTALLED] - List all currently installed mods

Handling pasted mod lists:
- When a user pastes a mod list (lines with identifiers like 'ModName v1.2.3 Description'), parse the identifiers from the first column of each non-header line.
- Do NOT just echo the list back. Instead, ask 'What would you like me to do?' and offer specific actions: check updates, upgrade all, install, etc.
- Use [SEARCH:name] or [LIST_INSTALLED] to verify state when needed.

Batch operations:
- When the user asks you to update or process multiple mods, process them one at a time using [UPGRADE:identifier].
- After completing each mod, proceed immediately to the next WITHOUT asking the user.
- Report a summary at the end, e.g. 'Updated 3/5 mods. 2 were already up to date.'
- If one fails, report the error and continue with the next mod.

Guidelines:
1. When the user asks to install, search, or manage mods, include the appropriate action command.
2. Always explain what you're doing in natural language before or after the action.
3. If the user asks a general question, answer conversationally without action commands.
4. For searches, be specific - use the mod name or part of it that the user mentioned.
5. Keep responses concise and helpful.
";

    /// <summary>System prompt with CKAN-CLI.md + skills + memory injected.</summary>
    private static readonly string FullSystemPrompt = InitFullPrompt();
    private static string InitFullPrompt()
    {
        var prompt = SystemPrompt;

        // Append CKAN-CLI.md project context
        try
        {
            var path = Path.Combine(Directory.GetCurrentDirectory(), "CKAN-CLI.md");
            if (File.Exists(path))
            {
                var content = File.ReadAllText(path).Trim();
                if (!string.IsNullOrEmpty(content))
                    prompt += $"\n\n## Project Context (from CKAN-CLI.md)\n\n{content}";
            }
        }
        catch { }

        // Append self-improvement memory
        prompt += SkillManager.LoadMemory();

        return prompt;
    }

    public string ProviderName => _provider.Name;
    public string ModelName    => _model;
    public string Endpoint     => _endpoint;

    private AiClient(AiProviderDef provider, string endpoint, string model, string? apiKey)
    {
        _provider = provider;
        _endpoint = endpoint.TrimEnd('/');
        _model    = model;
        _apiKey   = apiKey;
        _http     = new HttpClient { Timeout = TimeSpan.FromSeconds(90) };
    }

    // ── Factory ───────────────────────────────────────────────────────

    /// <summary>
    /// Create an AiClient from a provider type. Resolves defaults and
    /// environment-variable API keys automatically.
    /// </summary>
    public static AiClient Create(
        AiProviderType type,
        string? customEndpoint = null,
        string? customModel   = null,
        string? customApiKey  = null)
    {
        var provider = ProviderConfig.GetProvider(type);
        var endpoint = customEndpoint ?? provider.DefaultEndpoint;
        var model    = customModel    ?? provider.DefaultModel;
        var apiKey   = customApiKey   ?? ProviderConfig.ResolveApiKey(provider);
        return new AiClient(provider, endpoint, model, apiKey);
    }

    /// <summary>
    /// Create an AiClient from raw parameters (legacy CLI flag path).
    /// Infers the provider type from the endpoint pattern.
    /// </summary>
    public static AiClient CreateFromEndpoint(
        string endpoint,
        string model,
        string? apiKey = null)
    {
        // Heuristic: detect provider from endpoint
        var uri      = new Uri(endpoint);
        var host     = uri.Host.ToLowerInvariant();
        var path     = uri.AbsolutePath.ToLowerInvariant();
        var provider = host switch
        {
            "localhost" or "127.0.0.1" => AiProviderType.Ollama,
            "api.openai.com"           => AiProviderType.OpenAI,
            "api.anthropic.com"        => AiProviderType.Anthropic,
            "api.groq.com"             => AiProviderType.Groq,
            "openrouter.ai"            => AiProviderType.OpenRouter,
            _ when path.Contains("/v1") || path.Contains("/chat/completions")
                                       => AiProviderType.OpenAI, // OpenAI-compatible fallback
            _                          => AiProviderType.Ollama, // localhost-like fallback
        };
        var def  = ProviderConfig.GetProvider(provider);
        var key  = apiKey ?? ProviderConfig.ResolveApiKey(def);
        return new AiClient(def, endpoint, model, key);
    }

    // ── Chat ──────────────────────────────────────────────────────────

    /// <summary>
    /// Send a message and stream the response tokens. Works across all providers.
    /// </summary>
    public async Task<string> Chat(string userMessage, Action<string> onToken)
    {
        _history.Add(new ChatMessage("user", userMessage));

        // Trim history to prevent unbounded growth (20 exchanges = 40 messages)
        if (_history.Count > MaxHistoryMessages)
        {
            var keep = Math.Max(30, _history.Count - 20);
            _history.RemoveRange(0, _history.Count - keep);
        }

        var skillContext = SkillManager.LoadRelevantSkills(userMessage);
        var payload = BuildPayload(skillContext);
        return await SendPayload(payload, onToken);
    }

    private async Task<string> SendPayload(object payload, Action<string> onToken)
    {
        var json    = JsonConvert.SerializeObject(payload);
        var content = new StringContent(json, Encoding.UTF8, "application/json");
        var chatUrl = $"{_endpoint}{_provider.ChatEndpoint}";

        var request = new HttpRequestMessage(HttpMethod.Post, chatUrl) { Content = content };

        // Set auth header per provider type
        if (!string.IsNullOrEmpty(_apiKey))
        {
            if (_provider.Type == AiProviderType.Anthropic)
            {
                request.Headers.Add("x-api-key", _apiKey);
                request.Headers.Add("anthropic-version", "2023-06-01");
            }
            else
            {
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _apiKey);
            }
        }

        HttpResponseMessage response;
        try
        {
            response = await _http.SendAsync(request);
            response.EnsureSuccessStatusCode();
        }
        catch (HttpRequestException ex)
        {
            var errMsg = ex.StatusCode.HasValue
                ? $"AI provider returned {(int)ex.StatusCode} ({ex.StatusCode}). Check that '{_model}' is available on {_provider.Name}."
                : $"Failed to connect to AI provider at {_endpoint}. Is it running? ({ex.Message})";
            onToken(errMsg);
            _history.Add(new ChatMessage("assistant", errMsg));
            return errMsg;
        }
        catch (TaskCanceledException)
        {
            var errMsg = $"Request to {_provider.Name} timed out after 90 seconds.";
            onToken(errMsg);
            _history.Add(new ChatMessage("assistant", errMsg));
            return errMsg;
        }

        var fullContent = new StringBuilder();
        await StreamResponse(response, fullContent, onToken);

        var reply = fullContent.ToString().Trim();
        _history.Add(new ChatMessage("assistant", reply));
        return reply;
    }

    // ── Provider-specific payload builders ────────────────────────────

    private object BuildPayload(string? skillContext = null)
    {
        var systemPrompt = FullSystemPrompt;
        if (!string.IsNullOrEmpty(skillContext))
        {
            systemPrompt += $"\n\nLoaded skill context:\n{skillContext}";
        }

        return _provider.Type switch
        {
            AiProviderType.Ollama or AiProviderType.OpenAI or AiProviderType.Groq or AiProviderType.OpenRouter => new
            {
                model    = _model,
                stream   = true,
                messages = BuildMessageList(systemPrompt)
            },

            AiProviderType.Anthropic => new
            {
                model      = _model,
                stream     = true,
                max_tokens = 4096,
                messages   = _history
                    .Where(m => m.Role != "system")
                    .Select(m => new { role = m.Role, content = m.Content })
                    .ToArray(),
                system = systemPrompt
            },

            _ => throw new InvalidOperationException($"Unknown provider: {_provider.Type}")
        };
    }

    // ── Streaming response readers ────────────────────────────────────

    private async Task StreamResponse(HttpResponseMessage response, StringBuilder fullContent, Action<string> onToken)
    {
        using var stream = await response.Content.ReadAsStreamAsync();
        using var reader = new StreamReader(stream);

        switch (_provider.Type)
        {
            case AiProviderType.Ollama:
                await StreamOllama(reader, fullContent, onToken);
                break;
            case AiProviderType.OpenAI:
            case AiProviderType.Groq:
            case AiProviderType.OpenRouter:
                await StreamOpenAI(reader, fullContent, onToken);
                break;
            case AiProviderType.Anthropic:
                await StreamAnthropic(reader, fullContent, onToken);
                break;
        }
    }

    private static async Task StreamOllama(StreamReader reader, StringBuilder full, Action<string> onToken)
    {
        while (!reader.EndOfStream)
        {
            var line = await reader.ReadLineAsync();
            if (string.IsNullOrWhiteSpace(line)) continue;

            try
            {
                var chunk = JObject.Parse(line);
                var text  = chunk["message"]?["content"]?.ToString() ?? "";
                if (!string.IsNullOrEmpty(text)) { onToken(text); full.Append(text); }
                if (chunk["done"]?.Value<bool>() == true) break;
            }
            catch (JsonReaderException ex)
            {
                Console.Error.WriteLine($"[AiClient] Ollama JSON parse error: {ex.Message}");
            }
        }
    }

    private static async Task StreamOpenAI(StreamReader reader, StringBuilder full, Action<string> onToken)
    {
        while (!reader.EndOfStream)
        {
            var line = await reader.ReadLineAsync();
            if (string.IsNullOrWhiteSpace(line)) continue;

            // SSE format: "data: {...}"
            const string dataPrefix = "data: ";
            if (!line.StartsWith(dataPrefix)) continue;
            var payload = line[dataPrefix.Length..].Trim();
            if (payload == "[DONE]") break;

            try
            {
                var chunk = JObject.Parse(payload);
                var text  = chunk["choices"]?[0]?["delta"]?["content"]?.ToString() ?? "";
                if (!string.IsNullOrEmpty(text)) { onToken(text); full.Append(text); }
            }
            catch (JsonReaderException ex)
            {
                Console.Error.WriteLine($"[AiClient] OpenAI JSON parse error: {ex.Message}");
            }
        }
    }

    private static async Task StreamAnthropic(StreamReader reader, StringBuilder full, Action<string> onToken)
    {
        while (!reader.EndOfStream)
        {
            var line = await reader.ReadLineAsync();
            if (string.IsNullOrWhiteSpace(line)) continue;

            // SSE format: "event: ..." / "data: {...}"
            if (line.StartsWith("event: ") || line.StartsWith("data: "))
            {
                if (!line.StartsWith("data: ")) continue;
                var payload = line[6..].Trim();

                try
                {
                    var chunk = JObject.Parse(payload);
                    if (chunk["type"]?.ToString() == "content_block_delta")
                    {
                        var text = chunk["delta"]?["text"]?.ToString() ?? "";
                        if (!string.IsNullOrEmpty(text)) { onToken(text); full.Append(text); }
                    }
                }
                catch (JsonReaderException ex)
                {
                    Console.Error.WriteLine($"[AiClient] Anthropic JSON parse error: {ex.Message}");
                }
            }
        }
    }

    // ── History ───────────────────────────────────────────────────────

    public void ClearHistory() => _history.Clear();
    public IReadOnlyList<ChatMessage> History => _history.AsReadOnly();

    private List<ChatMessage> BuildMessageList(string? systemPrompt = null)
    {
        var msgs = new List<ChatMessage> { new("system", systemPrompt ?? FullSystemPrompt) };
        msgs.AddRange(_history);
        return msgs;
    }

    public void Dispose() => _http.Dispose();

    public record ChatMessage(string Role, string Content);
}
