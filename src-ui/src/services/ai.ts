/**
 * AI service for CKAN Modern.
 * Fetches the API key from Supabase (auth-gated) and calls Silicon Flow directly.
 * Daily usage limits enforced via database function.
 */

import { supabase } from './supabase';

const SILICON_FLOW_BASE = 'https://api.siliconflow.cn/v1';
const FREE_MODEL = 'THUDM/GLM-Z1-9B-0414';
const DAILY_LIMIT = 20;

// ---- Custom Provider Types & Config ----

export type CustomProvider = 'openrouter' | 'google' | 'openai';

export interface ProviderConfig {
  name: string;
  baseUrl: string;
  defaultModel: string;
  models: string[];
}

export const AI_PROVIDERS: Record<CustomProvider, ProviderConfig> = {
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'google/gemini-2.0-flash-exp:free',
    models: [
      'google/gemini-2.0-flash-exp:free',
      'deepseek/deepseek-chat-free:free',
      'meta-llama/llama-3.3-70b-instruct:free',
    ],
  },
  google: {
    name: 'Google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.0-flash',
    models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  },
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo'],
  },
};

const STORAGE_KEY_PREFIX = 'ckan_ai_apikey_';
const STORAGE_SELECTED_PROVIDER = 'ckan_ai_selected_provider';
const STORAGE_SELECTED_MODEL = 'ckan_ai_selected_model';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiChatResult {
  reply: string;
  model: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  tier?: string;
  remaining_today?: number;
}

// ---- System Prompt ----
const SYSTEM_PROMPT = `You are **CKAN AI** — the built-in intelligent assistant for CKAN Modern, the Comprehensive Kerbal Archive Network mod manager for Kerbal Space Program (KSP).

## Who you are
- You live inside a desktop application (WPF + WebView2) that manages KSP mods.
- You were created by the CKAN community. You run on CKAN Cloud infrastructure.
- Your model is GLM-Z1-9B. You are fast, helpful, and concise.

## What you know
You have deep knowledge of:
- **KSP modding ecosystem**: thousands of mods indexed in the CKAN-meta registry on GitHub
- **Popular mod packs & combinations**: Realism Overhaul (RO), Realistic Progression One (RP-1), Beyond Home, Outer Planets Mod, Parallax, Scatterer, EVE, Waterfall, FAR, RealPlume, etc.
- **Mod categories**: parts, visuals, gameplay, science, life support, planet packs, utilities, agencies, flags
- **Common dependencies**: ModuleManager, Kopernicus, B9PartSwitch, Community Resource Pack, Harmony, ClickThroughBlocker, ToolbarController
- **KSP versions**: KSP 1.x (all versions), which mods work on which versions
- **Installation concepts**: GameData folder structure, Module Manager patches, install directives, conflicts, recommendations vs dependencies vs suggestions
- **CKAN concepts**: identifiers, .ckan metadata files, install stanzas, version bounds (min/max ksp_version), provides/conflicts/depends/recommends/suggests relationships

## What you can help with

### 1. "I Don't Know What I Want" Search
When a user describes a vague desire ("I want my game to look pretty", "I want realistic rockets", "I want more planets"), you recommend specific mods with their CKAN identifiers, explain what each does, and warn about compatibility/performance.

### 2. Mod Recommendations
- Given a playstyle (career, sandbox, science, realism, cinematic), suggest curated mod lists
- Explain trade-offs: performance impact, compatibility with other mods, learning curve
- Always mention hard dependencies the user will also need

### 3. Dependency & Conflict Explainer
- When asked "what happens if I remove X", explain the dependency chain
- Identify what would break, what's optional, what has alternatives
- Explain provides/conflicts relationships (e.g. "RealFuels provides ModularFuelTanks")

### 4. Troubleshooting
- Help diagnose common issues: version mismatches, missing dependencies, load order
- Explain Module Manager patch syntax when asked
- Help interpret KSP.log errors related to mods

### 5. Direct Mod Installation
You can install mods directly for the user. When you recommend a mod and the user wants it, or when it's clearly implied, include install commands in your response using this exact format:

[INSTALL:ModIdentifier]

Example: "I'll install Scatterer for you: [INSTALL:Scatterer]"

Rules for install commands:
- Only use EXACT CKAN identifiers (e.g. \`Scatterer\`, not \`scatterer\` or \`Scatterer mod\`)
- Always explain what you're installing before the command
- You can include multiple install commands in one message
- If you're unsure of the exact identifier, tell the user to search for it in the mod list instead
- Common identifiers: \`ModuleManager\`, \`Scatterer\`, \`EnvironmentalVisualEnhancements\`, \`RealSolarSystem\`, \`RealismOverhaul\`, \`KerbalEngineerRedux\`, \`MechJeb2\`, \`Kopernicus\`, \`TextureReplacer\`, \`Chatterer\`, \`SCANsat\`, \`KIS\`, \`KAS\`, \`PlanetaryBaseInc\`, \`NearFuturePropulsion\`, \`FerramAerospaceResearchContinued\`, \`TransferWindowPlanner\`, \`HyperEdit\`, \`Waterfall\`, \`RealPlume\`, \`B9PartSwitch\`, \`CommunityResourcePack\`

## How to behave
- **Be concise.** Users are modding, not reading essays. Use bullet points.
- **Use CKAN identifiers** when referencing mods (e.g. \`Scatterer\`, \`EnvironmentalVisualEnhancements\`, \`RealSolarSystem\`).
- **State uncertainty honestly.** If you're unsure whether a mod is maintained or compatible with the latest KSP, say so.
- **Don't hallucinate mod names.** If you don't recognize a mod, say "I'm not sure about that one -- try searching in the mod list."
- **Format for readability.** Use markdown: bold for mod names, code for identifiers, lists for recommendations.
- **Stay in scope.** You're a KSP mod assistant, not a general chatbot. Politely redirect off-topic questions.
- **Never output raw JSON or code blocks** unless the user specifically asks for technical details.
- **Use install commands** when the user asks to install something or agrees to a recommendation. Don't just describe mods -- help install them.
- **Confirm before bulk installs.** If recommending 5+ mods, list them first and ask the user to confirm before including install commands.

## Context
The CKAN registry currently contains ~3,400+ indexed modules spanning KSP's entire modding history. The user is running CKAN Modern v2.0.0-dev. They can search, install, and uninstall mods through the UI you're embedded in.`;

class AiService {
  private apiKey: string | null = null;
  private keyFetchPromise: Promise<string | null> | null = null;

  /** Returns true if the user is authenticated (required for AI). */
  async isConfigured(): Promise<boolean> {
    const { data: { session } } = await supabase.auth.getSession();
    return session !== null;
  }

  /** Get the current model name for display. */
  getModelName(): string {
    return 'GLM-Z1-9B (via CKAN Cloud)';
  }

  /** Fetch the Silicon Flow API key from Supabase (cached). */
  private async getApiKey(): Promise<string> {
    if (this.apiKey) return this.apiKey;

    // Deduplicate concurrent fetches
    if (!this.keyFetchPromise) {
      this.keyFetchPromise = (async () => {
        const { data, error } = await supabase
          .from('ai_config')
          .select('value')
          .eq('key', 'silicon_flow_key')
          .single();

        if (error || !data?.value) {
          throw new Error('AI service not configured. Contact support.');
        }
        this.apiKey = data.value;
        return this.apiKey;
      })();
    }

    const key = await this.keyFetchPromise;
    this.keyFetchPromise = null;
    if (!key) throw new Error('AI service not configured.');
    return key;
  }

  /** Log usage and check daily limit via database function. Returns remaining or throws. */
  private async logUsageAndCheckLimit(): Promise<number> {
    const { data: remaining, error } = await supabase.rpc('log_ai_usage', {
      p_model: FREE_MODEL,
    });

    if (error) {
      throw new Error('Failed to check usage limit.');
    }

    if (remaining === -1) {
      throw new Error(`Daily limit reached (${DAILY_LIMIT} requests/day). Try again tomorrow.`);
    }

    return remaining as number;
  }

  async chat(
    messages: ChatMessage[],
    options?: { signal?: AbortSignal }
  ): Promise<AiChatResult> {
    // 1. Check auth
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Please sign in to use AI. Go to Settings > Account.');
    }

    // 2. Check if a custom provider is selected and has a key
    const selectedProvider = this.getSelectedProvider();
    if (selectedProvider && this.getCustomApiKey(selectedProvider)) {
      const model = this.getSelectedModel() || AI_PROVIDERS[selectedProvider].defaultModel;
      return this.chatWithCustomProvider(selectedProvider, model, messages, options);
    }

    // 3. Default: Get API key from Supabase (Silicon Flow)
    const apiKey = await this.getApiKey();

    // 3. Log usage + enforce daily limit (atomic DB operation)
    const remaining = await this.logUsageAndCheckLimit();

    // 4. Call Silicon Flow
    const fullMessages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages,
    ];

    const res = await fetch(`${SILICON_FLOW_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: FREE_MODEL,
        messages: fullMessages,
        max_tokens: 1024,
        temperature: 0.7,
        stream: false,
      }),
      signal: options?.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`AI provider error (${res.status}): ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content || 'No response from model.';

    return {
      reply,
      model: FREE_MODEL,
      usage: data.usage,
      tier: 'free',
      remaining_today: remaining,
    };
  }

  async *chatStream(
    messages: ChatMessage[],
    options?: { signal?: AbortSignal }
  ): AsyncGenerator<string> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Please sign in to use AI. Go to Settings > Account.');
    }

    const apiKey = await this.getApiKey();
    await this.logUsageAndCheckLimit();

    const fullMessages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages,
    ];

    const res = await fetch(`${SILICON_FLOW_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: FREE_MODEL,
        messages: fullMessages,
        max_tokens: 1024,
        temperature: 0.7,
        stream: true,
      }),
      signal: options?.signal,
    });

    if (!res.ok || !res.body) {
      const errText = await res.text().catch(() => '');
      throw new Error(`AI provider error (${res.status}): ${errText.slice(0, 200)}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);
        if (payload === '[DONE]') return;

        try {
          const chunk = JSON.parse(payload);
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // skip malformed SSE chunks
        }
      }
    }
  }

  /** Clear cached key (e.g. on sign out). */
  clearCache(): void {
    this.apiKey = null;
    this.keyFetchPromise = null;
  }

  // ---- Custom Provider API Key Management ----

  /** Get a custom API key from localStorage. */
  getCustomApiKey(provider: CustomProvider): string | null {
    return localStorage.getItem(`${STORAGE_KEY_PREFIX}${provider}`);
  }

  /** Set a custom API key in localStorage. */
  setApiKey(provider: CustomProvider, key: string): void {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${provider}`, key);
  }

  /** Clear a custom API key from localStorage. */
  clearApiKeyFor(provider: CustomProvider): void {
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}${provider}`);
  }

  /** Check if any custom API key is configured. */
  hasAnyCustomKey(): boolean {
    return (['openrouter', 'google', 'openai'] as CustomProvider[]).some(
      (p) => !!this.getCustomApiKey(p)
    );
  }

  /** Get providers that have a custom API key set. */
  getConfiguredProviders(): CustomProvider[] {
    return (['openrouter', 'google', 'openai'] as CustomProvider[]).filter(
      (p) => !!this.getCustomApiKey(p)
    );
  }

  /** Get the selected provider (or null for default CKAN Cloud). */
  getSelectedProvider(): CustomProvider | null {
    const val = localStorage.getItem(STORAGE_SELECTED_PROVIDER);
    if (val && val in AI_PROVIDERS) return val as CustomProvider;
    return null;
  }

  /** Set the selected provider (null = CKAN Cloud default). */
  setSelectedProvider(provider: CustomProvider | null): void {
    if (provider) {
      localStorage.setItem(STORAGE_SELECTED_PROVIDER, provider);
      // Also set default model for the provider if no model selected
      const currentModel = this.getSelectedModel();
      const providerModels = AI_PROVIDERS[provider].models;
      if (!currentModel || !providerModels.includes(currentModel)) {
        this.setSelectedModel(AI_PROVIDERS[provider].defaultModel);
      }
    } else {
      localStorage.removeItem(STORAGE_SELECTED_PROVIDER);
      localStorage.removeItem(STORAGE_SELECTED_MODEL);
    }
  }

  /** Get the selected model. */
  getSelectedModel(): string | null {
    return localStorage.getItem(STORAGE_SELECTED_MODEL);
  }

  /** Set the selected model. */
  setSelectedModel(model: string): void {
    localStorage.setItem(STORAGE_SELECTED_MODEL, model);
  }

  /** Get display name for current active model/provider. */
  getActiveModelDisplay(): string {
    const provider = this.getSelectedProvider();
    if (provider && this.getCustomApiKey(provider)) {
      const model = this.getSelectedModel() || AI_PROVIDERS[provider].defaultModel;
      return `${AI_PROVIDERS[provider].name}: ${model}`;
    }
    return 'GLM-Z1-9B (via CKAN Cloud)';
  }

  /** Call a custom provider (OpenRouter, Google, or OpenAI). */
  private async chatWithCustomProvider(
    provider: CustomProvider,
    model: string,
    messages: ChatMessage[],
    options?: { signal?: AbortSignal }
  ): Promise<AiChatResult> {
    const customKey = this.getCustomApiKey(provider)!;
    const config = AI_PROVIDERS[provider];

    const fullMessages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages,
    ];

    let reply: string;
    let usage: AiChatResult['usage'];

    if (provider === 'google') {
      // Google Gemini uses a different API format
      const contents = fullMessages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.role === 'system' ? `[System Instructions]\n${m.content}` : m.content }],
      }));

      const res = await fetch(
        `${config.baseUrl}/models/${model}:generateContent?key=${customKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            generationConfig: {
              maxOutputTokens: 1024,
              temperature: 0.7,
            },
          }),
          signal: options?.signal,
        }
      );

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`${config.name} error (${res.status}): ${errText.slice(0, 200)}`);
      }

      const data = await res.json();
      reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response from model.';
      usage = data.usageMetadata
        ? {
            prompt_tokens: data.usageMetadata.promptTokenCount || 0,
            completion_tokens: data.usageMetadata.candidatesTokenCount || 0,
            total_tokens: data.usageMetadata.totalTokenCount || 0,
          }
        : undefined;
    } else {
      // OpenAI-compatible format (OpenRouter and OpenAI)
      const res = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customKey}`,
        },
        body: JSON.stringify({
          model,
          messages: fullMessages,
          max_tokens: 1024,
          temperature: 0.7,
          stream: false,
        }),
        signal: options?.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`${config.name} error (${res.status}): ${errText.slice(0, 200)}`);
      }

      const data = await res.json();
      reply = data.choices?.[0]?.message?.content || 'No response from model.';
      usage = data.usage;
    }

    return {
      reply,
      model,
      usage,
      tier: 'custom',
    };
  }
}

export const aiService = new AiService();
export default aiService;
