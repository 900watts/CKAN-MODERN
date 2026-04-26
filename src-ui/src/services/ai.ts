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

export type CustomProvider = 'openrouter' | 'google' | 'openai' | 'siliconflow-cn' | 'siliconflow-int';

export interface ProviderConfig {
  label: string;
  baseUrl: string;
  models: { id: string; label: string }[];
  /** true = OpenAI-compatible chat/completions, false = Google format */
  openaiCompat: boolean;
}

export const AI_PROVIDERS: Record<CustomProvider, ProviderConfig> = {
  'openrouter': {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    openaiCompat: true,
    models: [
      { id: 'google/gemini-2.0-flash-exp:free', label: 'Gemini 2.0 Flash (Free)' },
      { id: 'deepseek/deepseek-chat-free:free', label: 'DeepSeek Chat (Free)' },
      { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B (Free)' },
    ],
  },
  'google': {
    label: 'Google AI',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    openaiCompat: false,
    models: [
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
      { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
      { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
    ],
  },
  'openai': {
    label: 'OpenAI / ChatGPT',
    baseUrl: 'https://api.openai.com/v1',
    openaiCompat: true,
    models: [
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
      { id: 'gpt-4o', label: 'GPT-4o' },
      { id: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
    ],
  },
  'siliconflow-cn': {
    label: 'Silicon Flow (CN)',
    baseUrl: 'https://api.siliconflow.cn/v1',
    openaiCompat: true,
    models: [
      { id: 'THUDM/GLM-Z1-9B-0414', label: 'GLM-Z1-9B' },
      { id: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek V3' },
      { id: 'Qwen/Qwen2.5-7B-Instruct', label: 'Qwen 2.5 7B' },
    ],
  },
  'siliconflow-int': {
    label: 'Silicon Flow (INT)',
    baseUrl: 'https://api.siliconflow.com/v1',
    openaiCompat: true,
    models: [
      { id: 'THUDM/GLM-Z1-9B-0414', label: 'GLM-Z1-9B' },
      { id: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek V3' },
      { id: 'Qwen/Qwen2.5-7B-Instruct', label: 'Qwen 2.5 7B' },
    ],
  },
};

// ── localStorage key management ──

const STORAGE_PREFIX = 'ckan_ai_';

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

export async function chatWithCustomProvider(
  provider: CustomProvider,
  model: string,
  messages: ChatMessage[],
  signal?: AbortSignal
): Promise<AiChatResult> {
  const apiKey = getCustomApiKey(provider);
  if (!apiKey) throw new Error(`No API key set for ${AI_PROVIDERS[provider].label}. Add it in Settings.`);

  const config = AI_PROVIDERS[provider];
  const fullMessages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages,
  ];

  if (config.openaiCompat) {
    // OpenAI-compatible format (OpenRouter, OpenAI, Silicon Flow)
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
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
