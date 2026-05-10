/**
 * ProactiveAgent — Watches for trigger conditions and dispatches
 * kerbal-initiated messages. Kerbals notice what the user is doing,
 * comment on it, check in after long idle, react to errors, greet in
 * the morning, and reference ongoing stories.
 */

import { worldContext } from './WorldContext';
import { kerbalStore } from './KerbalStore';
import type { KerbalState } from './KerbalStore';
import { SoulLoader } from './SoulLoader';
import type { KerbalSoul } from './SoulLoader';
import { statsToApiParams } from './SoulLoader';
import { chatViaProvider, EMPTY_RESPONSE } from '../services/ai';
import { moodSystem } from './MoodSystem';
import { relationshipGraph } from './RelationshipGraph';
import { storyEngine } from './StoryEngine';
import { buildToolsPrompt, parseToolCalls, executeToolCall, stripToolCalls } from './AgentSkills';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProactiveMessage {
  kerbalName: string;
  content: string;
  triggerId: string;
  timestamp: number;
  isProactive: true;
}

type ProactiveListener = (message: ProactiveMessage) => void;

interface ProactiveTrigger {
  id: string;
  condition: (ctx: ReturnType<typeof worldContext.getSnapshot>, kerbals: KerbalState[]) => boolean;
  selectKerbal: (kerbals: KerbalState[]) => KerbalState;
  buildPrompt: (ctx: ReturnType<typeof worldContext.getSnapshot>, kerbal: KerbalState) => string;
  cooldownMs: number;
}

// ---------------------------------------------------------------------------
// Trigger catalog
// ---------------------------------------------------------------------------

const TRIGGERS: ProactiveTrigger[] = [
  {
    id: 'window_return',
    condition: (ctx) => ctx.windowFocused && ctx.focusAwayDuration > 120_000,
    selectKerbal: (k) => k[Math.floor(Math.random() * k.length)],
    buildPrompt: (ctx, kerbal) =>
      `[PROACTIVE: user just returned after being away for ${Math.round(ctx.focusAwayDuration / 60_000)} min. Greet them casually, ask if everything's OK, or joke about what you were discussing while they were gone. Be warm and natural — no formal greetings.]`,
    cooldownMs: 300_000,
  },
  {
    id: 'late_night',
    condition: (ctx) => {
      const h = ctx.systemTime.hour;
      return (h >= 23 || h < 5) && ctx.userIdleMs < 60_000;
    },
    selectKerbal: (k) => {
      const gene = k.find((x) => x.name.toLowerCase() === 'gene');
      return gene || k[0];
    },
    buildPrompt: (ctx, kerbal) =>
      `[PROACTIVE: It's ${String(ctx.systemTime.hour).padStart(2, '0')}:${String(ctx.systemTime.minute).padStart(2, '0')} — very late. The user is still awake. Express mild concern as ${kerbal.name}. Be caring but not parental. Suggest they get some rest. 1-2 sentences.]`,
    cooldownMs: 900_000,
  },
  {
    id: 'page_browse_long',
    condition: (ctx) => ctx.currentPageDuration > 300_000 && ctx.currentPage !== 'mission-control',
    selectKerbal: (k) => {
      const wernher = k.find((x) => x.name.toLowerCase() === 'wernher');
      return wernher || k[Math.floor(Math.random() * k.length)];
    },
    buildPrompt: (ctx, kerbal) =>
      `[PROACTIVE: The user has been on the "${ctx.currentPage}" page for ${Math.round(ctx.currentPageDuration / 60_000)} minutes. They might be stuck or deeply researching. Offer relevant help. Reference the page they're on naturally.]`,
    cooldownMs: 600_000,
  },
  {
    id: 'error_reaction',
    condition: (ctx) => {
      if (!ctx.lastError) return false;
      return Date.now() - ctx.lastError.timestamp < 60_000;
    },
    selectKerbal: (k) => {
      const bill = k.find((x) => x.name.toLowerCase() === 'bill');
      return bill || k[0];
    },
    buildPrompt: (ctx, kerbal) =>
      `[PROACTIVE: An error just occurred: "${ctx.lastError!.message}". As ${kerbal.name}, react to it. Bill would offer to diagnose. Gene would ask for a status report. Others might express concern or make a joke. 1-2 sentences.]`,
    cooldownMs: 180_000,
  },
  {
    id: 'morning_greeting',
    condition: (ctx) => {
      const h = ctx.systemTime.hour;
      const sessionMins = (Date.now() - ctx.sessionStartTime) / 60_000;
      return h >= 6 && h <= 10 && sessionMins < 30 && ctx.userIdleMs < 30_000;
    },
    selectKerbal: (k) => {
      const val = k.find((x) => x.name.toLowerCase() === 'valentina');
      return val || k[0];
    },
    buildPrompt: (ctx, kerbal) =>
      `[PROACTIVE: It's morning (${String(ctx.systemTime.hour).padStart(2, '0')}:${String(ctx.systemTime.minute).padStart(2, '0')}). Greet the user warmly as ${kerbal.name}. Mention the time. Ask what the plan is for today. Keep it motivational.]`,
    cooldownMs: 3_600_000, // once per session essentially
  },
  {
    id: 'long_idle',
    condition: (ctx) => ctx.userIdleMs > 900_000, // 15 min
    selectKerbal: (k) => {
      const jeb = k.find((x) => x.name.toLowerCase() === 'jebediah');
      return jeb || k[Math.floor(Math.random() * k.length)];
    },
    buildPrompt: (ctx, kerbal) =>
      `[PROACTIVE: The user has been idle for ${Math.round(ctx.userIdleMs / 60_000)} minutes. As ${kerbal.name}, check in on them. Are they still there? Jeb might make a joke about them falling asleep. Gene might ask if comms are down. 1-2 sentences.]`,
    cooldownMs: 1_200_000,
  },
  {
    id: 'story_reveal',
    condition: () => storyEngine.getPendingReveals().length > 0,
    selectKerbal: (kerbals) => {
      const reveals = storyEngine.getPendingReveals();
      if (reveals.length === 0) return kerbals[0];
      const triggerName = reveals[0].triggerKerbal.toLowerCase();
      const match = kerbals.find((k) => k.name.toLowerCase() === triggerName);
      return match || kerbals[0];
    },
    buildPrompt: (_ctx, kerbal) => {
      const reveals = storyEngine.getPendingReveals();
      if (reveals.length === 0) return '';
      const r = reveals[0];
      storyEngine.markRevealed(r.id);
      return `[PROACTIVE: STORY REVEAL] ${r.description}\nAs ${kerbal.name}, naturally bring this up. Don't announce it — weave it into conversation casually. 1-2 sentences.`;
    },
    cooldownMs: 300_000,
  },
];

// ---------------------------------------------------------------------------
// ProactiveAgent
// ---------------------------------------------------------------------------

class ProactiveAgent {
  private listeners: Set<ProactiveListener> = new Set();
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private lastFireTime = 0;
  private triggerCooldowns = new Map<string, number>();
  private isRunning = false;

  // ---- public API -----------------------------------------------------------

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.pollInterval = setInterval(() => this.tick(), 15_000);
  }

  stop(): void {
    this.isRunning = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  onMessage(listener: ProactiveListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ---- tick -----------------------------------------------------------------

  private async tick(): Promise<void> {
    if (!this.isRunning) return;

    // Global minimum 2 min between any proactive messages
    if (Date.now() - this.lastFireTime < 120_000) return;

    const ctx = worldContext.getSnapshot();
    const presentKerbals = kerbalStore.getPresent();
    if (presentKerbals.length === 0) return;

    // Check each trigger
    for (const trigger of TRIGGERS) {
      const lastFire = this.triggerCooldowns.get(trigger.id) || 0;
      if (Date.now() - lastFire < trigger.cooldownMs) continue;
      if (!trigger.condition(ctx, presentKerbals)) continue;

      const kerbal = trigger.selectKerbal(presentKerbals);
      const promptText = trigger.buildPrompt(ctx, kerbal);
      if (!promptText) continue;

      // Generate the proactive message via AI
      try {
        const soul: KerbalSoul = await SoulLoader.load(kerbal.name.toLowerCase());
        const params = statsToApiParams(soul);
        const toolsPrompt = buildToolsPrompt(soul.role);

        const messages = [
          { role: 'system' as const, content: soul.rawMarkdown + toolsPrompt },
          { role: 'user' as const, content: promptText },
        ];

        const result = await chatViaProvider(messages, {
          temperature: params.temperature,
          topP: params.topP,
        });

        const reply = (result.reply && result.reply !== EMPTY_RESPONSE)
          ? stripToolCalls(result.reply)
          : this.getFallback(trigger.id, kerbal.name);

        // Handle tool calls if any
        const toolCalls = parseToolCalls(result.reply);
        if (toolCalls.length > 0) {
          for (const tc of toolCalls.slice(0, 2)) {
            const toolResult = await executeToolCall(tc);
            // We got the result — the final reply already incorporates it
            // For now, just log. In future, could do a second AI pass.
            console.log(`[ProactiveAgent] Tool ${tc.toolName}: ${toolResult.slice(0, 100)}`);
          }
        }

        const msg: ProactiveMessage = {
          kerbalName: kerbal.name,
          content: reply,
          triggerId: trigger.id,
          timestamp: Date.now(),
          isProactive: true,
        };

        this.emit(msg);
        this.lastFireTime = Date.now();
        this.triggerCooldowns.set(trigger.id, Date.now());
        moodSystem.tickMood(kerbal.name, 'user_interaction', trigger.id);
        break; // One per tick
      } catch (err) {
        console.error(`[ProactiveAgent] Failed for ${kerbal.name} (${trigger.id}):`, err);
        // Fire fallback anyway
        const msg: ProactiveMessage = {
          kerbalName: kerbal.name,
          content: this.getFallback(trigger.id, kerbal.name),
          triggerId: trigger.id,
          timestamp: Date.now(),
          isProactive: true,
        };
        this.emit(msg);
        this.lastFireTime = Date.now();
        this.triggerCooldowns.set(trigger.id, Date.now());
        break;
      }
    }
  }

  // ---- fallback templates ---------------------------------------------------

  private getFallback(triggerId: string, kerbalName: string): string {
    const templates: Record<string, string[]> = {
      window_return: [
        'Oh hey, welcome back! We were just talking about rocket designs.',
        'You\'re back! Everything OK out there?',
        'Ah, there you are. The team was getting worried.',
      ],
      late_night: [
        `It's pretty late... shouldn't you be getting some rest? The mods will still be here tomorrow.`,
        'Still awake? Even the night shift is getting tired.',
        'Burning the midnight rocket fuel, I see.',
      ],
      page_browse_long: [
        'Taking a close look at those mods? Need any engineering advice?',
        'You\'ve been studying that list for a while. Found anything interesting?',
        'If you\'re stuck deciding, I can offer recommendations.',
      ],
      error_reaction: [
        'Uh oh, I saw that error pop up. Want me to take a look?',
        'Something just glitched. Bill\'s already running diagnostics in his head.',
        'Error detected. Nothing explodes without my permission.',
      ],
      morning_greeting: [
        'Good morning! Ready to launch some rockets today?',
        'Morning! The coffee\'s fresh and the rockets are fueled.',
        'Rise and shine! Mission Control is ready when you are.',
      ],
      long_idle: [
        'Everything OK over there? You\'ve been quiet for a while.',
        '*taps mic* Hello? Mission Control to Flight Director?',
        'Did you fall asleep at the console? Happens to the best of us.',
      ],
      story_reveal: [
        'So... something interesting happened while you were gone.',
        'You won\'t believe what Linus has been up to in the lab.',
        'I\'ve got news. It\'s... well, you should hear this.',
      ],
    };

    const pool = templates[triggerId] || ['Hmm? Did you need something?'];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // ---- emit -----------------------------------------------------------------

  private emit(message: ProactiveMessage): void {
    for (const fn of this.listeners) {
      fn(message);
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const proactiveAgent = new ProactiveAgent();
