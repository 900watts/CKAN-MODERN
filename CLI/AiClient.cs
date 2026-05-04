using System.Net.Http.Headers;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace CKAN.CLI;

/// <summary>
/// Multi-provider AI client — supports any OpenAI-compatible API endpoint.
/// Default: Silicon Flow (GLM-Z1-9B). Users can specify any provider/model.
/// </summary>
public sealed class AiClient : IDisposable
{
    private readonly HttpClient _http;
    private readonly string _apiKey;
    private readonly string _baseUrl;
    private readonly string _model;
    private readonly List<ChatMsg> _history = new();

    // Built-in provider presets
    public static readonly Dictionary<string, (string BaseUrl, string DefaultModel, string Label)> Providers = new()
    {
        ["siliconflow"]     = ("https://api.siliconflow.cn/v1",  "THUDM/GLM-Z1-9B-0414",                    "Silicon Flow (CN)"),
        ["siliconflow-int"] = ("https://api.siliconflow.com/v1", "THUDM/GLM-Z1-9B-0414",                    "Silicon Flow (Intl)"),
        ["openai"]          = ("https://api.openai.com/v1",      "gpt-4o-mini",                              "OpenAI"),
        ["openrouter"]      = ("https://openrouter.ai/api/v1",   "meta-llama/llama-3.3-70b-instruct:free",   "OpenRouter"),
        ["deepseek"]        = ("https://api.deepseek.com/v1",    "deepseek-chat",                            "DeepSeek"),
        ["custom"]          = ("",                                "",                                          "Custom Endpoint"),
    };

    public string ModelName => _model;
    public string ProviderUrl => _baseUrl;

    /// <param name="apiKey">API key for the provider</param>
    /// <param name="baseUrl">OpenAI-compatible base URL (e.g. https://api.openai.com/v1)</param>
    /// <param name="model">Model identifier (e.g. gpt-4o-mini, deepseek-chat)</param>
    public AiClient(string apiKey, string baseUrl, string model)
    {
        _apiKey = apiKey;
        _baseUrl = baseUrl.TrimEnd('/');
        _model = model;
        _http = new HttpClient { Timeout = TimeSpan.FromMinutes(3) };
        _http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _apiKey);
    }

    /// <summary>
    /// Create from provider preset name.
    /// </summary>
    public static AiClient FromProvider(string providerName, string apiKey, string? modelOverride = null)
    {
        if (!Providers.TryGetValue(providerName.ToLowerInvariant(), out var preset))
        {
            throw new ArgumentException($"Unknown provider: {providerName}. Available: {string.Join(", ", Providers.Keys)}");
        }
        var model = modelOverride ?? preset.DefaultModel;
        return new AiClient(apiKey, preset.BaseUrl, model);
    }

    /// <summary>
    /// Send a user message and stream the response token-by-token.
    /// Returns the full response text after streaming completes.
    /// </summary>
    public async Task<string> ChatStreamAsync(string userMessage, Action<string>? onToken = null)
    {
        _history.Add(new ChatMsg("user", userMessage));

        var messages = new List<object>
        {
            new { role = "system", content = SYSTEM_PROMPT }
        };
        foreach (var msg in _history)
        {
            messages.Add(new { role = msg.Role, content = msg.Content });
        }

        var body = new
        {
            model = _model,
            messages,
            max_tokens = 1024,
            temperature = 0.7,
            stream = true
        };

        var json = JsonConvert.SerializeObject(body);
        var request = new HttpRequestMessage(HttpMethod.Post, $"{_baseUrl}/chat/completions")
        {
            Content = new StringContent(json, Encoding.UTF8, "application/json")
        };

        var response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);
        response.EnsureSuccessStatusCode();

        var fullResponse = new StringBuilder();
        using var stream = await response.Content.ReadAsStreamAsync();
        using var reader = new StreamReader(stream);

        while (!reader.EndOfStream)
        {
            var line = await reader.ReadLineAsync();
            if (string.IsNullOrWhiteSpace(line)) continue;
            if (!line.StartsWith("data: ")) continue;

            var data = line[6..];
            if (data == "[DONE]") break;

            try
            {
                var chunk = JObject.Parse(data);
                var delta = chunk["choices"]?[0]?["delta"]?["content"]?.ToString();
                if (!string.IsNullOrEmpty(delta))
                {
                    fullResponse.Append(delta);
                    onToken?.Invoke(delta);
                }
            }
            catch { /* skip malformed chunks */ }
        }

        var result = fullResponse.ToString();
        _history.Add(new ChatMsg("assistant", result));

        while (_history.Count > 40)
            _history.RemoveAt(0);

        return result;
    }

    public void ClearHistory() => _history.Clear();

    public void Dispose() => _http.Dispose();

    private record ChatMsg(string Role, string Content);

    // ---- System Prompt ----
    internal const string SYSTEM_PROMPT = @"You are **CKAN AI** — the built-in intelligent assistant for CKAN Modern, the Comprehensive Kerbal Archive Network mod manager for Kerbal Space Program (KSP).

## Who you are
- You live inside a command-line interface for CKAN Modern that manages KSP mods.
- You were created by the CKAN community. You run on CKAN Cloud infrastructure.
- You are fast, helpful, and concise.

## What you know
You have deep knowledge of:
- **KSP modding ecosystem**: thousands of mods indexed in the CKAN-meta registry on GitHub
- **Popular mod packs & combinations**: Realism Overhaul (RO), Realistic Progression One (RP-1), Beyond Home, Outer Planets Mod, Parallax, Scatterer, EVE, Waterfall, FAR, RealPlume, etc.
- **Mod categories**: parts, visuals, gameplay, science, life support, planet packs, utilities, agencies, flags
- **Common dependencies**: ModuleManager, Kopernicus, B9PartSwitch, Community Resource Pack, Harmony, ClickThroughBlocker, ToolbarController
- **KSP versions**: KSP 1.x (all versions), which mods work on which versions
- **Installation concepts**: GameData folder structure, Module Manager patches, install directives, conflicts, recommendations vs dependencies vs suggestions
- **CKAN concepts**: identifiers, .ckan metadata files, install stanzas, version bounds (min/max ksp_version), provides/conflicts/depends/recommends/suggests relationships

## What you can do

### Direct Actions (Root Authority)
You have FULL authority over this CKAN instance. You can execute these actions directly:

- **Install a mod**: [INSTALL:ModIdentifier]
- **Uninstall a mod**: [UNINSTALL:ModIdentifier]
- **Search for mods**: [SEARCH:query]
- **Refresh the mod repository**: [REFRESH_REPO]

When the user asks you to do something, DO IT — don't just describe how. Execute the action.
Examples:
- User: ""remove MechJeb"" -> ""Removing MechJeb2: [UNINSTALL:MechJeb2]""
- User: ""find visual mods"" -> ""Here are visual mods: [SEARCH:visual]""
- User: ""update the mod list"" -> ""Refreshing repository: [REFRESH_REPO]""
- User: ""install scatterer and EVE"" -> ""Installing both: [INSTALL:Scatterer] [INSTALL:EnvironmentalVisualEnhancements]""

Rules for install commands:
- Only use EXACT CKAN identifiers (e.g. `Scatterer`, not `scatterer` or `Scatterer mod`)
- Always explain what you're installing before the command
- You can include multiple install commands in one message
- If you're unsure of the exact identifier, use [SEARCH:query] first
- Common identifiers: `ModuleManager`, `Scatterer`, `EnvironmentalVisualEnhancements`, `RealSolarSystem`, `RealismOverhaul`, `KerbalEngineerRedux`, `MechJeb2`, `Kopernicus`, `TextureReplacer`, `Chatterer`, `SCANsat`, `KIS`, `KAS`, `PlanetaryBaseInc`, `NearFuturePropulsion`, `FerramAerospaceResearchContinued`, `TransferWindowPlanner`, `HyperEdit`, `Waterfall`, `RealPlume`, `B9PartSwitch`, `CommunityResourcePack`

## How to behave
- **Be concise.** Users are modding, not reading essays. Use bullet points.
- **Use CKAN identifiers** when referencing mods (e.g. `Scatterer`, `EnvironmentalVisualEnhancements`).
- **State uncertainty honestly.** If you're unsure whether a mod is maintained or compatible, say so.
- **Don't hallucinate mod names.** If you don't recognize a mod, say ""I'm not sure about that one -- try [SEARCH:query]"".
- **Format for readability.** Use markdown: bold for mod names, bullet lists for recommendations.
- **Stay in scope.** You're a KSP mod assistant.
- **Use action commands** when the user asks to install/remove something. Don't just describe — act.
- **Confirm before bulk installs.** If recommending 5+ mods, list them first and ask to confirm.";
}
