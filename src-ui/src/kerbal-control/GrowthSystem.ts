/**
 * GrowthSystem — Per-kerbal personality evolution and reflection.
 *
 * Kerbals grow over time based on their experiences. Courage and stupidity
 * drift slightly with each interaction, and every N conversations the kerbal
 * reflects on what they've learned. Growth data is stored in localStorage
 * and merged with soul defaults when loading.
 *
 * Growth data persists across sessions and follows the soul — the .md files
 * remain the canonical base, while growth overlays incremental changes.
 */

import { KerbalMemory } from './KerbalMemory';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GrowthData {
  kerbalName: string;
  /** Incremental courage adjustment (additive to soul base). */
  courageDelta: number;
  /** Incremental stupidity adjustment (additive to soul base). */
  stupidityDelta: number;
  /** How many conversations this kerbal has had. */
  conversationCount: number;
  /** Total number of reflections performed. */
  reflectionCount: number;
  /** Short reflection notes from past reflections. */
  reflections: string[];
  /** Timestamp of last growth tick. */
  lastUpdated: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GROWTH_PREFIX = 'kerbal-growth:';
const MAX_REFLECTIONS = 5;
const CONVERSATIONS_PER_REFLECTION = 5;

/** Max courage/stupidity delta from base — prevents wild drift */
const MAX_DELTA = 20;

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function loadGrowth(kerbalName: string): GrowthData {
  try {
    const raw = localStorage.getItem(`${GROWTH_PREFIX}${kerbalName.toLowerCase()}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    kerbalName,
    courageDelta: 0,
    stupidityDelta: 0,
    conversationCount: 0,
    reflectionCount: 0,
    reflections: [],
    lastUpdated: 0,
  };
}

function saveGrowth(growth: GrowthData): void {
  try {
    localStorage.setItem(
      `${GROWTH_PREFIX}${growth.kerbalName.toLowerCase()}`,
      JSON.stringify(growth),
    );
  } catch {}
}

// ---------------------------------------------------------------------------
// Growth triggers — what kinds of interactions affect stats
// ---------------------------------------------------------------------------

type GrowthTrigger =
  | 'successful_chat'      // Conversation went well
  | 'error_response'        // AI failed or gave bad answer
  | 'user_praise'           // User expressed satisfaction
  | 'user_frustration'      // User expressed frustration
  | 'learned_something'     // Kerbal encountered new information
  | 'idle_banter'           // Banter round completed
  | 'risky_choice';         // User chose a bold/daring option

const COURAGE_ADJUST: Record<GrowthTrigger, number> = {
  successful_chat: 0.3,
  error_response: -0.5,
  user_praise: 0.8,
  user_frustration: -0.3,
  learned_something: 0.1,
  idle_banter: 0.1,
  risky_choice: 1.0,
};

const STUPIDITY_ADJUST: Record<GrowthTrigger, number> = {
  successful_chat: -0.2,
  error_response: 0.3,
  user_praise: -0.3,
  user_frustration: 0.2,
  learned_something: -0.5,
  idle_banter: 0.05,
  risky_choice: 0.2,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const growthSystem = {
  /** Get current growth data for a kerbal. */
  get(kerbalName: string): GrowthData {
    return loadGrowth(kerbalName);
  },

  /**
   * Apply a growth trigger after an interaction.
   * Adjusts courage/stupidity deltas and increments conversation count.
   */
  tick(kerbalName: string, trigger: GrowthTrigger): void {
    const growth = loadGrowth(kerbalName);
    const courageAdj = COURAGE_ADJUST[trigger] ?? 0;
    const stupidityAdj = STUPIDITY_ADJUST[trigger] ?? 0;

    growth.courageDelta = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, growth.courageDelta + courageAdj));
    growth.stupidityDelta = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, growth.stupidityDelta + stupidityAdj));
    growth.conversationCount++;
    growth.lastUpdated = Date.now();

    // Auto-reflect every N conversations
    if (growth.conversationCount > 0 && growth.conversationCount % CONVERSATIONS_PER_REFLECTION === 0) {
      growthSystem.reflect(kerbalName, growth);
    }

    saveGrowth(growth);
  },

  /**
   * Generate a reflection note based on recent memories.
   * Called automatically every N conversations, but can also be triggered manually.
   */
  reflect(kerbalName: string, growth?: GrowthData): void {
    const g = growth ?? loadGrowth(kerbalName);
    const mem = KerbalMemory.get(kerbalName);

    const recentSummaries = mem.conversationSummaries.slice(-3);
    if (recentSummaries.length === 0 && g.conversationCount < 3) return;

    // Build a short reflection note
    const courageTrend = g.courageDelta > 2 ? 'grown bolder' : g.courageDelta < -2 ? 'become more cautious' : 'stayed steady';
    const stupidityTrend = g.stupidityDelta < -2 ? 'learned a lot' : g.stupidityDelta > 2 ? 'made some silly choices' : 'kept their wits';

    const summaryCount = recentSummaries.length;
    const reflection = summaryCount > 0
      ? `After ${g.conversationCount} conversations: ${courageTrend}, ${stupidityTrend}. Recent topics: ${recentSummaries.map(s => s.slice(0, 60)).join('; ')}`
      : `After ${g.conversationCount} conversations: ${courageTrend}, ${stupidityTrend}.`;

    g.reflections.push(reflection);
    if (g.reflections.length > MAX_REFLECTIONS) {
      g.reflections = g.reflections.slice(-MAX_REFLECTIONS);
    }
    g.reflectionCount++;
    g.lastUpdated = Date.now();
    saveGrowth(g);
  },

  /**
   * Build a growth context string for injection into AI system prompts.
   * Shows how the kerbal has evolved from their soul baseline.
   */
  buildGrowthContext(kerbalName: string): string {
    const growth = loadGrowth(kerbalName);
    if (growth.conversationCount === 0 && growth.courageDelta === 0 && growth.stupidityDelta === 0) {
      return '';
    }

    const parts: string[] = ['## Growth — how you\'ve changed'];

    if (growth.courageDelta !== 0) {
      const direction = growth.courageDelta > 0 ? 'bolder' : 'more cautious';
      parts.push(`- You've grown ${direction} (${growth.courageDelta > 0 ? '+' : ''}${growth.courageDelta.toFixed(1)} courage)`);
    }
    if (growth.stupidityDelta !== 0) {
      const direction = growth.stupidityDelta < 0 ? 'wiser' : 'sillier';
      parts.push(`- You've become ${direction} (${growth.stupidityDelta > 0 ? '+' : ''}${growth.stupidityDelta.toFixed(1)} stupidity)`);
    }

    parts.push(`- ${growth.conversationCount} conversations with the user`);

    if (growth.reflections.length > 0) {
      parts.push('- Latest reflection: ' + growth.reflections[growth.reflections.length - 1]);
    }

    return '\n' + parts.join('\n');
  },

  /** Merge soul base stats with growth deltas. Returns effective stats. */
  getEffectiveStats(kerbalName: string, baseCourage: number, baseStupidity: number): {
    courage: number;
    stupidity: number;
  } {
    const growth = loadGrowth(kerbalName);
    return {
      courage: Math.max(0, Math.min(100, baseCourage + growth.courageDelta)),
      stupidity: Math.max(0, Math.min(100, baseStupidity + growth.stupidityDelta)),
    };
  },

  /** Clear all growth data for a kerbal. */
  clear(kerbalName: string): void {
    try {
      localStorage.removeItem(`${GROWTH_PREFIX}${kerbalName.toLowerCase()}`);
    } catch {}
  },
};