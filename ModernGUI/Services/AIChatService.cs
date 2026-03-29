using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading.Tasks;
using log4net;

namespace CKAN.GUI.Services;

public interface IAIService
{
    Task<AIChatResponse> ChatAsync(object? args);
    Task<PointsBalance> GetPointsBalanceAsync();
}

public class AIChatResponse
{
    public string Reply { get; set; } = "";
    public int? PointsUsed { get; set; }
}

public class PointsBalance
{
    public int Balance { get; set; }
    public string Tier { get; set; } = "free";
}

public class AIChatService : IAIService
{
    private static readonly ILog Log = LogManager.GetLogger(typeof(AIChatService));
    
    // Silcon Flow API - free tier models
    private const string BaseUrl = "https://api.siliconsflow.com/v1";
    private const string ChatModel = "Qwen/Qwen2.5-7B-Instruct";
    
    // In production, this would come from secure config
    private string? _apiKey;
    private int _pointsBalance = 100; // Mock starting balance
    
    private readonly IHttpClientFactory _httpClientFactory;
    
    public AIChatService(IHttpClientFactory httpClientFactory)
    {
        _httpClientFactory = httpClientFactory;
    }

    public async Task<AIChatResponse> ChatAsync(object? args)
    {
        dynamic? dynArgs = args;
        string? message = dynArgs?.message;
        var history = dynArgs?.history as IEnumerable<dynamic> ?? Array.Empty<dynamic>();
        
        if (string.IsNullOrEmpty(message))
        {
            throw new ArgumentException("Message is required");
        }
        
        try
        {
            // Build conversation for the AI
            var messages = new List<Dictionary<string, string>>();
            
            // System prompt
            messages.Add(new Dictionary<string, string>
            {
                { "role", "system" },
                { "content", @"You are the CKAN AI Assistant, a helpful assistant for the Comprehensive Kerbal Archive Network (CKAN) mod manager for Kerbal Space Program.

You help users:
- Find and recommend mods
- Install and manage mods
- Explain mod dependencies
- Answer questions about KSP modding

Be concise, friendly, and helpful. Use markdown for formatting when useful." }
            });
            
            // Add history
            foreach (var msg in history)
            {
                messages.Add(new Dictionary<string, string>
                {
                    { "role", msg.role?.ToString() ?? "user" },
                    { "content", msg.content?.ToString() ?? "" }
                });
            }
            
            // Add current message
            messages.Add(new Dictionary<string, string>
            {
                { "role", "user" },
                { "content", message }
            });
            
            // Call Silicon Flow API
            var client = _httpClientFactory.CreateClient();
            client.DefaultRequestHeaders.Add("Authorization", $"Bearer {_apiKey ?? ""}");
            
            var request = new
            {
                model = ChatModel,
                messages = messages,
                temperature = 0.7,
                max_tokens = 1024
            };
            
            var response = await client.PostAsJsonAsync($"{BaseUrl}/chat/completions", request);
            
            if (response.IsSuccessStatusCode)
            {
                var result = await response.Content.ReadFromJsonAsync<JsonElement>();
                var reply = result.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString() ?? "";
                
                // Deduct points based on message complexity
                var pointsUsed = message.Length > 100 ? 5 : 0;
                _pointsBalance = Math.Max(0, _pointsBalance - pointsUsed);
                
                Log.Debug($"AI chat: used {pointsUsed} points");
                
                return new AIChatResponse
                {
                    Reply = reply,
                    PointsUsed = pointsUsed
                };
            }
            else
            {
                var error = await response.Content.ReadAsStringAsync();
                Log.Warn($"AI API error: {error}");
                
                // Fallback response
                return new AIChatResponse
                {
                    Reply = GetFallbackResponse(message)
                };
            }
        }
        catch (Exception ex)
        {
            Log.Error("AI chat error", ex);
            
            return new AIChatResponse
            {
                Reply = GetFallbackResponse(message)
            };
        }
    }

    private string GetFallbackResponse(string message)
    {
        var msg = message.ToLower();
        
        if (msg.Contains("recommend") || msg.Contains("suggest") || msg.Contains("want"))
        {
            return "I'd love to help you find some mods! Could you tell me more about what kind of gameplay you're looking for? For example:\n\n- Building realistic rockets?\n- Exploring the solar system?\n- Career mode improvements?\n- Quality of life changes?";
        }
        
        if (msg.Contains("install"))
        {
            return "To install a mod, you can either:\n1. Search for it in the Available tab and click Install\n2. Paste a list of mod identifiers and I'll install them all for you\n\nWhat would you like to install?";
        }
        
        if (msg.Contains("help"))
        {
            return "I'm here to help with:\n\n🔍 **Finding mods** - Tell me what you're looking for\n📦 **Installing mods** - Just give me the names\n📖 **Understanding mods** - I can explain what mods do\n⚠️ **Dependencies** - I can tell you what a mod needs\n\nWhat would you like to do?";
        }
        
        return "I understand you're asking about \"" + message + "\". Is there something specific about KSP mods I can help you with?";
    }

    public Task<PointsBalance> GetPointsBalanceAsync()
    {
        return Task.FromResult(new PointsBalance
        {
            Balance = _pointsBalance,
            Tier = _pointsBalance > 0 ? "free" : "paid"
        });
    }
}