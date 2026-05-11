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
    options?: { signal?: AbortSignal; temperature?: number; topP?: number; noSystemPrompt?: boolean }
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
    const fullMessages: ChatMessage[] = options?.noSystemPrompt
      ? messages
      : [{ role: 'system', content: SYSTEM_PROMPT }, ...messages];

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
        temperature: options?.temperature ?? 0.7,
        ...(options?.topP !== undefined ? { top_p: options.topP } : {}),
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

/** Sentinel returned when all AI retries produce empty responses. */
export const EMPTY_RESPONSE = '(no response)';

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
      { id: 'llama3.2:latest', label: 'Llama 3.2' },
      { id: 'qwen3:latest', label: 'Qwen3' },
      { id: 'deepseek-coder-v2:latest', label: 'DeepSeek Coder V2' },
      { id: 'mistral:latest', label: 'Mistral' },
      { id: 'codellama:latest', label: 'Code Llama' },
      { id: 'gemma3:latest', label: 'Gemma 3' },
    ],
  },
};

// ── localStorage key management ──

const STORAGE_PREFIX = 'ckan_ai_';

export function getCustomApiKey(provider: CustomProvider): string | null {
  if (provider === 'ollama') return 'ollama'; // local, no key needed
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
    (p) => p === 'ollama' || !!getCustomApiKey(p)
  );
}

export function getConfiguredProviders(): CustomProvider[] {
  return (Object.keys(AI_PROVIDERS) as CustomProvider[]).filter(
    (p) => p === 'ollama' || !!getCustomApiKey(p)
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

export function getKerbalModelOverride(): string {
  return localStorage.getItem(`${STORAGE_PREFIX}kerbal_model`) || '';
}

export function setKerbalModelOverride(model: string): void {
  localStorage.setItem(`${STORAGE_PREFIX}kerbal_model`, model);
}

// ── Custom provider chat ──

export interface CustomChatOptions {
  signal?: AbortSignal;
  temperature?: number;
  topP?: number;
  /** If true, skips prepending the CKAN SYSTEM_PROMPT (kerbals provide their own). */
  noSystemPrompt?: boolean;
}

export async function chatWithCustomProvider(
  provider: CustomProvider,
  model: string,
  messages: ChatMessage[],
  options?: CustomChatOptions,
): Promise<AiChatResult> {
  const apiKey = provider === 'ollama' ? 'ollama' : getCustomApiKey(provider);
  if (!apiKey && provider !== 'ollama') throw new Error(`No API key set for ${AI_PROVIDERS[provider].label}. Add it in Settings.`);

  const config = AI_PROVIDERS[provider];
  const fullMessages: ChatMessage[] = options?.noSystemPrompt
    ? messages
    : [{ role: 'system', content: SYSTEM_PROMPT }, ...messages];

  if (config.openaiCompat) {
    const baseTemp = options?.temperature ?? 0.7;
    const body: Record<string, unknown> = {
      model,
      messages: fullMessages,
      max_tokens: provider === 'ollama' ? 300 : 1024,
      temperature: baseTemp,
    };
    if (options?.topP !== undefined) body.top_p = options.topP;
    // Ollama-specific: ensure we get a response
    if (provider === 'ollama') {
      body.options = { num_predict: 300 };
    }

    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: options?.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`${config.label} error (${res.status}): ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    let reply = data.choices?.[0]?.message?.content;

    // Retry with different params if empty
    if (!reply) {
      console.warn(`[ai] Empty response from ${config.label}, retrying...`);
      // Retry 1: higher temperature + no max_tokens limit
      try {
        const retryBody: Record<string, unknown> = { ...body, temperature: Math.min(baseTemp + 0.2, 1.2) };
        delete retryBody.max_tokens;
        if (provider === 'ollama' && retryBody.options) {
          (retryBody.options as Record<string, unknown>).num_predict = 256;
        }
        const r1 = await fetch(`${config.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(retryBody),
          signal: options?.signal,
        });
        if (r1.ok) {
          const d1 = await r1.json();
          reply = d1.choices?.[0]?.message?.content;
        }
      } catch { /* continue */ }

      // Retry 2: minimal prompt — just the last user message
      if (!reply) {
        console.warn(`[ai] Retry 2: minimal prompt...`);
        try {
          const lastUser = fullMessages.filter(m => m.role === 'user').slice(-1);
          const r2 = await fetch(`${config.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              model,
              messages: [
                { role: 'system', content: 'You are a KSP kerbal. Respond briefly in character.' },
                ...lastUser,
              ],
              temperature: baseTemp + 0.1,
              max_tokens: 200,
            }),
            signal: options?.signal,
          });
          if (r2.ok) {
            const d2 = await r2.json();
            reply = d2.choices?.[0]?.message?.content;
          }
        } catch { /* continue */ }
      }
    }

    if (!reply) {
      console.error(`[ai] All attempts empty for ${config.label}/${model}`);
    }

    return {
      reply: reply || EMPTY_RESPONSE,
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
          generationConfig: {
            maxOutputTokens: 1024,
            temperature: options?.temperature ?? 0.7,
          },
        }),
        signal: options?.signal,
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

// ── Provider-aware unified chat (routes to the selected provider) ──

let ollamaDetected: boolean | null = null;
let ollamaModels: string[] | null = null;

async function detectOllama(): Promise<boolean> {
  if (ollamaDetected !== null) return ollamaDetected;
  try {
    const res = await fetch('http://localhost:11434/api/tags', {
      signal: AbortSignal.timeout(800),
    });
    if (res.ok) {
      const data = await res.json();
      ollamaModels = (data.models ?? []).map((m: { name: string }) => m.name);
      ollamaDetected = true;
    } else {
      ollamaDetected = false;
    }
  } catch {
    ollamaDetected = false;
  }
  return ollamaDetected;
}

function getOllamaAvailableModels(): string[] {
  return ollamaModels ?? [];
}

/** Pick the best Ollama model: use the saved one if available, otherwise the first detected. */
function resolveOllamaModel(fallbackModel?: string): string {
  const model = fallbackModel ?? getSelectedModel('ollama');
  const available = getOllamaAvailableModels();
  if (available.length > 0 && !available.includes(model)) {
    return available[0];
  }
  return model;
}

async function resolveProvider(): Promise<CustomProvider | 'ckan-cloud'> {
  const selected = getSelectedProvider();
  const stored = localStorage.getItem(`${STORAGE_PREFIX}provider`);
  if (stored) return selected;
  // No explicit provider chosen — default to ckan-cloud (Ollama is lazy-detected only when needed)
  return selected;
}

/** Cached auth state to avoid repeated Supabase getSession() calls on the hot path. */
let cachedAuthState: { configured: boolean; checkedAt: number } | null = null;
const AUTH_CACHE_MS = 30_000;

async function isAuthConfiguredCached(): Promise<boolean> {
  if (cachedAuthState && Date.now() - cachedAuthState.checkedAt < AUTH_CACHE_MS) {
    return cachedAuthState.configured;
  }
  const configured = await aiService.isConfigured();
  cachedAuthState = { configured, checkedAt: Date.now() };
  return configured;
}

/** Clear the auth cache (call on sign-in / sign-out events). */
export function clearAuthCache(): void {
  cachedAuthState = null;
}

export async function chatViaProvider(
  messages: ChatMessage[],
  options?: CustomChatOptions,
): Promise<AiChatResult> {
  const provider = await resolveProvider();

  if (provider !== 'ckan-cloud') {
    let model = getSelectedModel(provider);
    if (options?.noSystemPrompt) {
      const kerbalOverride = getKerbalModelOverride();
      if (kerbalOverride) model = kerbalOverride;
    }
    if (provider === 'ollama') {
      model = resolveOllamaModel(model);
    }
    return chatWithCustomProvider(provider, model, messages, {
      ...options,
      noSystemPrompt: options?.noSystemPrompt ?? false,
    });
  }

  // CKAN Cloud path — check auth (cached), fall back to Ollama if not configured
  const configured = await isAuthConfiguredCached();
  if (configured) {
    return aiService.chat(messages, {
      signal: options?.signal,
      temperature: options?.temperature,
      topP: options?.topP,
      noSystemPrompt: options?.noSystemPrompt,
    });
  }

  const ollamaAvailable = await detectOllama();
  if (ollamaAvailable) {
    console.log('[ai] CKAN Cloud not available (not signed in), falling back to Ollama');
    const model = resolveOllamaModel();
    return chatWithCustomProvider('ollama', model, messages, {
      ...options,
      noSystemPrompt: options?.noSystemPrompt ?? false,
    });
  }

  throw new Error(
    'AI not available. Please sign in to CKAN Cloud (Settings > Account) or set up a local Ollama instance or custom API key (Settings > AI).',
  );
}
