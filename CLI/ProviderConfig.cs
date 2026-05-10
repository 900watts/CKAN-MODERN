namespace CKAN.CLI;

/// <summary>
/// Supported AI provider types.
/// </summary>
public enum AiProviderType
{
    Ollama,
    OpenAI,
    Anthropic,
    Groq,
    OpenRouter
}

/// <summary>
/// Definition of an AI provider — endpoint, default model, and key configuration.
/// </summary>
public record AiProviderDef
{
    public required AiProviderType Type { get; init; }
    public required string Name { get; init; }
    public required string DefaultEndpoint { get; init; }
    public required string DefaultModel { get; init; }
    public string? EnvApiKey { get; init; }
    public string? HelpNote { get; init; }
    public string[] AvailableModels { get; init; } = [];

    /// <summary>
    /// The /api/chat endpoint uses the chat completions sub-path
    /// determined by the provider's API convention.
    /// </summary>
    public string ChatEndpoint => Type switch
    {
        AiProviderType.Ollama     => "/api/chat",
        AiProviderType.OpenAI     => "/v1/chat/completions",
        AiProviderType.Anthropic  => "/v1/messages",
        AiProviderType.Groq       => "/v1/chat/completions",
        AiProviderType.OpenRouter => "/v1/chat/completions",
        _ => "/v1/chat/completions"
    };
}

/// <summary>
/// Static registry of AI providers.
/// </summary>
public static class ProviderConfig
{
    public static readonly AiProviderDef[] Providers =
    [
        new()
        {
            Type = AiProviderType.Ollama,
            Name = "Ollama (local)",
            DefaultEndpoint = "http://localhost:11434",
            DefaultModel = "deepseek-coder-v2:latest",
            AvailableModels = [], // User must type their Ollama model name
            HelpNote = "Run locally — no API key needed"
        },
        new()
        {
            Type = AiProviderType.OpenAI,
            Name = "OpenAI",
            DefaultEndpoint = "https://api.openai.com",
            DefaultModel = "gpt-4o",
            EnvApiKey = "OPENAI_API_KEY",
            AvailableModels =
            [
                "gpt-4o",
                "gpt-4o-mini",
                "gpt-4-turbo",
                "o1-mini",
            ],
            HelpNote = "Requires API key from platform.openai.com"
        },
        new()
        {
            Type = AiProviderType.Anthropic,
            Name = "Anthropic (Claude)",
            DefaultEndpoint = "https://api.anthropic.com",
            DefaultModel = "claude-sonnet-4-20250514",
            EnvApiKey = "ANTHROPIC_API_KEY",
            AvailableModels =
            [
                "claude-sonnet-4-20250514",
                "claude-3-5-sonnet-latest",
                "claude-3-5-haiku-latest",
            ],
            HelpNote = "Requires API key from console.anthropic.com"
        },
        new()
        {
            Type = AiProviderType.Groq,
            Name = "Groq",
            DefaultEndpoint = "https://api.groq.com",
            DefaultModel = "llama3-70b-8192",
            EnvApiKey = "GROQ_API_KEY",
            AvailableModels =
            [
                "llama3-70b-8192",
                "llama3-8b-8192",
                "mixtral-8x7b-32768",
                "gemma2-9b-it",
            ],
            HelpNote = "Requires API key from console.groq.com"
        },
        new()
        {
            Type = AiProviderType.OpenRouter,
            Name = "OpenRouter",
            DefaultEndpoint = "https://openrouter.ai/api",
            DefaultModel = "openai/gpt-4o",
            EnvApiKey = "OPENROUTER_API_KEY",
            AvailableModels =
            [
                "openai/gpt-4o",
                "openai/gpt-4o-mini",
                "anthropic/claude-3.5-sonnet",
                "google/gemini-pro",
                "meta-llama/llama-3-70b-instruct",
            ],
            HelpNote = "Requires API key from openrouter.ai/keys"
        },
    ];

    public static AiProviderDef GetProvider(AiProviderType type)
        => Providers.First(p => p.Type == type);

    /// <summary>
    /// Read the API key from the environment variable defined for this provider.
    /// Returns null if no env var is configured or it's not set.
    /// </summary>
    public static string? ResolveApiKey(AiProviderDef provider)
        => provider.EnvApiKey != null ? Environment.GetEnvironmentVariable(provider.EnvApiKey) : null;
}
