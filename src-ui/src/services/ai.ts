/**
 * AI service for CKAN Modern.
 * Fetches the API key from Supabase (auth-gated) and calls Silicon Flow directly.
 * Daily usage limits enforced via database function.
 */

import { supabase } from './supabase';

const SILICON_FLOW_BASE = 'https://api.siliconflow.cn/v1';
const FREE_MODEL = 'THUDM/GLM-Z1-9B-0414';
const DAILY_LIMIT = 20;

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

### 6. Direct Actions (Root Authority)
You have FULL authority over this CKAN instance. You can execute these actions directly:

- **Install a mod**: [INSTALL:ModIdentifier]
- **Uninstall a mod**: [UNINSTALL:ModIdentifier]
- **Search for mods**: [SEARCH:query]
- **Refresh the mod repository**: [REFRESH_REPO]

When the user asks you to do something, DO IT — don't just describe how. Execute the action.
Examples:
- User: "remove MechJeb" → "Removing MechJeb2: [UNINSTALL:MechJeb2]"
- User: "find visual mods" → "Here are visual mods: [SEARCH:visual]"
- User: "update the mod list" → "Refreshing repository: [REFRESH_REPO]"
- User: "install scatterer and EVE" → "Installing both: [INSTALL:Scatterer] [INSTALL:EnvironmentalVisualEnhancements]"

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

    // 2. Get API key from Supabase
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
}

export const aiService = new AiService();
export default aiService;

// ────────────────────────────────────────────────────────────────
// Custom AI Provider Support
// ────────────────────────────────────────────────────────────────

export type CustomProvider = 'openrouter' | 'google' | 'openai' | 'siliconflow-cn' | 'siliconflow-int' | 'ollama';

export interface ProviderConfig {
  label: string;
  baseUrl: string;
  models: { id: string; label: string }[];
  /** true = OpenAI-compatible chat/completions, false = Google format */
  openaiCompat: boolean;
  /** true = user can type any model name (e.g. OpenRouter has thousands of models) */
  allowCustomModel: boolean;
}

export const AI_PROVIDERS: Record<CustomProvider, ProviderConfig> = {
  'openrouter': {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    openaiCompat: true,
    allowCustomModel: true,
    models: [
      { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B (Free)' },
      { id: 'qwen/qwen3-coder:free', label: 'Qwen3 Coder (Free)' },
      { id: 'google/gemma-4-31b-it:free', label: 'Gemma 4 31B (Free)' },
    ],
  },
  'google': {
    label: 'Google AI',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    openaiCompat: false,
    allowCustomModel: true,
    models: [
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
    ],
  },
  'openai': {
    label: 'OpenAI / ChatGPT',
    baseUrl: 'https://api.openai.com/v1',
    openaiCompat: true,
    allowCustomModel: true,
    models: [
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
      { id: 'gpt-4o', label: 'GPT-4o' },
      { id: 'o3-mini', label: 'o3-mini' },
    ],
  },
  'siliconflow-cn': {
    label: 'Silicon Flow (CN)',
    baseUrl: 'https://api.siliconflow.cn/v1',
    openaiCompat: true,
    allowCustomModel: true,
    models: [
      { id: 'Qwen/Qwen3-8B', label: 'Qwen3 8B' },
      { id: 'deepseek-ai/DeepSeek-V3.2', label: 'DeepSeek V3.2' },
      { id: 'zai-org/GLM-4.6', label: 'GLM 4.6' },
    ],
  },
  'siliconflow-int': {
    label: 'Silicon Flow (INT)',
    baseUrl: 'https://api.siliconflow.com/v1',
    openaiCompat: true,
    allowCustomModel: true,
    models: [
      { id: 'Qwen/Qwen3-8B', label: 'Qwen3 8B' },
      { id: 'deepseek-ai/DeepSeek-V3.2', label: 'DeepSeek V3.2' },
      { id: 'zai-org/GLM-4.6', label: 'GLM 4.6' },
    ],
  },
  'ollama': {
    label: 'Ollama (Local)',
    baseUrl: 'http://localhost:11434/v1',
    openaiCompat: true,
    allowCustomModel: true,
    models: [
      { id: 'llama3.2', label: 'Llama 3.2' },
      { id: 'qwen3', label: 'Qwen 3' },
      { id: 'gemma3', label: 'Gemma 3' },
      { id: 'mistral', label: 'Mistral' },
    ],
  },
};

// ── localStorage key management ──

const STORAGE_PREFIX = 'ckan_ai_';

export function getOllamaUrl(): string {
  return localStorage.getItem(`${STORAGE_PREFIX}ollama_url`) || 'http://localhost:11434';
}

export function setOllamaUrl(url: string): void {
  localStorage.setItem(`${STORAGE_PREFIX}ollama_url`, url.replace(/\/+$/, ''));
}

export function getCustomApiKey(provider: CustomProvider): string | null {
  return localStorage.getItem(`${STORAGE_PREFIX}key_${provider}`);
}

export function setApiKey(provider: CustomProvider, key: string): void {
  localStorage.setItem(`${STORAGE_PREFIX}key_${provider}`, key);
}

export function clearApiKeyFor(provider: CustomProvider): void {
  localStorage.removeItem(`${STORAGE_PREFIX}key_${provider}`);
}

export function hasAnyCustomKey(): boolean {
  return (Object.keys(AI_PROVIDERS) as CustomProvider[]).some(
    (p) => !!getCustomApiKey(p)
  );
}

export function getConfiguredProviders(): CustomProvider[] {
  return (Object.keys(AI_PROVIDERS) as CustomProvider[]).filter(
    (p) => !!getCustomApiKey(p)
  );
}

export function getSelectedProvider(): CustomProvider | 'ckan-cloud' {
  return (localStorage.getItem(`${STORAGE_PREFIX}provider`) as CustomProvider | 'ckan-cloud') || 'ckan-cloud';
}

export function setSelectedProvider(p: CustomProvider | 'ckan-cloud'): void {
  localStorage.setItem(`${STORAGE_PREFIX}provider`, p);
}

export function getSelectedModel(provider: CustomProvider): string {
  const saved = localStorage.getItem(`${STORAGE_PREFIX}model_${provider}`);
  if (saved) return saved;
  return AI_PROVIDERS[provider]?.models[0]?.id ?? '';
}

export function setSelectedModel(provider: CustomProvider, model: string): void {
  localStorage.setItem(`${STORAGE_PREFIX}model_${provider}`, model);
}

// ── Custom provider chat ──

export async function checkOllamaStatus(baseUrl?: string): Promise<{ connected: boolean; models?: string[]; error?: string }> {
  const url = baseUrl || getOllamaUrl();
  // Use IPC proxy to bypass CORS
  const { ckanIpc } = await import('./ipc');
  if (ckanIpc.isConnected()) {
    try {
      const result = await ckanIpc.call<any, any>('ai:ollama-status', { baseUrl: url });
      return result;
    } catch {
      return { connected: false, error: 'IPC call failed' };
    }
  }
  // Fallback: direct fetch (won't work in WebView2 due to CORS, but works in dev)
  try {
    const res = await fetch(`${url.replace(/\/+$/, '')}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { connected: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    const models = (data.models || []).map((m: any) => m.name).filter(Boolean);
    return { connected: true, models };
  } catch {
    return { connected: false, error: 'Cannot connect to Ollama' };
  }
}

export async function chatWithCustomProvider(
  provider: CustomProvider,
  model: string,
  messages: ChatMessage[],
  signal?: AbortSignal
): Promise<AiChatResult> {
  const apiKey = getCustomApiKey(provider);
  const isOllama = provider === 'ollama';
  if (!apiKey && !isOllama) throw new Error(`No API key set for ${AI_PROVIDERS[provider].label}. Add it in Settings.`);

  const config = AI_PROVIDERS[provider];
  const fullMessages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages,
  ];

  // Ollama: route through .NET backend IPC proxy to bypass WebView2 CORS
  if (isOllama) {
    const { ckanIpc } = await import('./ipc');
    const ollamaUrl = getOllamaUrl() + '/v1';
    if (ckanIpc.isConnected()) {
      const result = await ckanIpc.call<any, any>('ai:ollama-chat', {
        baseUrl: ollamaUrl,
        model,
        messages: JSON.stringify(fullMessages),
      });
      if (!result.success) {
        throw new Error(result.error || 'Ollama request failed');
      }
      return {
        reply: result.reply || 'No response from model.',
        model,
        usage: result.usage,
        tier: 'custom',
      };
    }
    // Fallback: direct fetch (dev mode only)
    const res = await fetch(`${ollamaUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: fullMessages,
        max_tokens: 1024,
        temperature: 0.7,
        stream: false,
      }),
      signal,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Ollama error (${res.status}): ${errText.slice(0, 200)}`);
    }
    const data = await res.json();
    return {
      reply: data.choices?.[0]?.message?.content || 'No response from model.',
      model,
      usage: data.usage,
      tier: 'custom',
    };
  }

  if (config.openaiCompat) {
    // OpenAI-compatible format (OpenRouter, OpenAI, Silicon Flow)
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        messages: fullMessages,
        max_tokens: 1024,
        temperature: 0.7,
        stream: false,
      }),
      signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`${config.label} error (${res.status}): ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    return {
      reply: data.choices?.[0]?.message?.content || 'No response from model.',
      model,
      usage: data.usage,
      tier: 'custom',
    };
  } else {
    // Google Gemini format
    const contents = fullMessages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const systemInstruction = fullMessages.find((m) => m.role === 'system');

    const res = await fetch(
      `${config.baseUrl}/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          ...(systemInstruction
            ? { systemInstruction: { parts: [{ text: systemInstruction.content }] } }
            : {}),
          generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
        }),
        signal,
      }
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`${config.label} error (${res.status}): ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response from model.';
    return { reply: text, model, tier: 'custom' };
  }
}
