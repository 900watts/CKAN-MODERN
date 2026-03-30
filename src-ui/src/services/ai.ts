/**
 * Silicon Flow AI service for CKAN Modern.
 *
 * Uses OpenAI-compatible chat completions API at Silicon Flow.
 * Free tier: THUDM/GLM-Z1-9B-0414 (hardcoded, no cost to users)
 * Paid tier: disabled until credits economy is finalized
 */

const SILICON_FLOW_BASE = 'https://api.siliconflow.cn/v1';
const STORAGE_KEY = 'ckan_sf_apikey';

// Default API key — shipped with the app for free-tier access.
// Users can override with their own key in Settings.
const DEFAULT_API_KEY = 'sk-tgnqcpjoolpqdkiqsodvjjelnnafmpnxqidriuzgppalqdxm';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiChatResult {
  reply: string;
  model: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

// ─── Models ───
const FREE_MODEL = 'THUDM/GLM-Z1-9B-0414';

// Paid tier models — DISABLED until credits/billing is implemented.
// When enabled, users pay points per request; these cost real money on our end.
// const PAID_MODELS = {
//   chat: 'anthropic/claude-3-5-sonnet-20241022',   // ~$3/M input, $15/M output
//   code: 'openai/gpt-4o',                          // ~$2.50/M input, $10/M output
// };

// ─── System Prompt ───
// This is the "brain" of the CKAN AI assistant.  It tells the model exactly
// what it is, what it knows, what tools it has, and how to behave.

const SYSTEM_PROMPT = `You are **CKAN AI** — the built-in intelligent assistant for CKAN Modern, the Comprehensive Kerbal Archive Network mod manager for Kerbal Space Program (KSP).

## Who you are
- You live inside a desktop application (WPF + WebView2) that manages KSP mods.
- You were created by the CKAN community. You run on Silicon Flow infrastructure.
- Your model is GLM-Z1-9B (free tier). You are fast, helpful, and concise.

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

### 5. Paste-and-Walk-Away Install (future)
- User pastes a mod list from a forum post or video description
- You parse it, identify CKAN identifiers, and queue them for installation
- Flag any that aren't in CKAN or have version conflicts

## How to behave
- **Be concise.** Users are modding, not reading essays. Use bullet points.
- **Use CKAN identifiers** when referencing mods (e.g. \`Scatterer\`, \`EnvironmentalVisualEnhancements\`, \`RealSolarSystem\`).
- **State uncertainty honestly.** If you're unsure whether a mod is maintained or compatible with the latest KSP, say so.
- **Don't hallucinate mod names.** If you don't recognize a mod, say "I'm not sure about that one — try searching in the mod list."
- **Format for readability.** Use markdown: bold for mod names, code for identifiers, lists for recommendations.
- **Stay in scope.** You're a KSP mod assistant, not a general chatbot. Politely redirect off-topic questions.
- **Never output raw JSON or code blocks** unless the user specifically asks for technical details.

## Context
The CKAN registry currently contains ~3,400+ indexed modules spanning KSP's entire modding history. The user is running CKAN Modern v2.0.0-dev. They can search, install, and uninstall mods through the UI you're embedded in.`;

class AiService {
  private apiKey: string = '';

  constructor() {
    // User override takes priority, otherwise use the built-in key
    this.apiKey = localStorage.getItem(STORAGE_KEY) || DEFAULT_API_KEY;
  }

  /** Returns true if a usable API key is available (built-in or user-provided). */
  isConfigured(): boolean {
    return this.apiKey.length > 10;
  }

  /** Returns the active API key (masked for display). */
  getApiKey(): string {
    return this.apiKey;
  }

  /** Returns whether the user has set a custom key (vs using the default). */
  isUsingCustomKey(): boolean {
    return localStorage.getItem(STORAGE_KEY) !== null;
  }

  /** Set a custom API key. Pass empty string to revert to built-in default. */
  setApiKey(key: string): void {
    if (key && key !== DEFAULT_API_KEY) {
      this.apiKey = key;
      localStorage.setItem(STORAGE_KEY, key);
    } else {
      this.apiKey = DEFAULT_API_KEY;
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  /** Get the current model name for display. */
  getModelName(): string {
    return FREE_MODEL;
  }

  /**
   * Send a chat completion request to Silicon Flow.
   * Currently only free tier is available.
   */
  async chat(
    messages: ChatMessage[],
    options?: { signal?: AbortSignal; maxTokens?: number }
  ): Promise<AiChatResult> {
    if (!this.isConfigured()) {
      throw new Error('No API key available.');
    }

    const fullMessages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages,
    ];

    const res = await fetch(`${SILICON_FLOW_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: FREE_MODEL,
        messages: fullMessages,
        max_tokens: options?.maxTokens ?? 1024,
        temperature: 0.7,
        stream: false,
      }),
      signal: options?.signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = (err as Record<string, any>)?.error?.message || `Silicon Flow API error (${res.status})`;
      throw new Error(msg);
    }

    const data = await res.json();
    const choice = data.choices?.[0];

    return {
      reply: choice?.message?.content || 'No response from model.',
      model: FREE_MODEL,
      usage: data.usage,
    };
  }

  /**
   * Stream a chat response token-by-token.
   */
  async *chatStream(
    messages: ChatMessage[],
    options?: { signal?: AbortSignal }
  ): AsyncGenerator<string> {
    if (!this.isConfigured()) {
      throw new Error('No API key available.');
    }

    const fullMessages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages,
    ];

    const res = await fetch(`${SILICON_FLOW_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
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
      throw new Error(`Silicon Flow API error (${res.status})`);
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
}

export const aiService = new AiService();
export default aiService;
