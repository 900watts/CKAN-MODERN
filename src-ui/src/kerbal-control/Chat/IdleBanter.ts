import { kerbalStore } from '../KerbalStore';
import type { KerbalState } from '../KerbalStore';
import { SoulLoader } from '../SoulLoader';
import type { KerbalSoul } from '../SoulLoader';
import { statsToApiParams } from '../SoulLoader';
import { chatViaProvider, EMPTY_RESPONSE } from '../../services/ai';
import { t } from '../../services/i18n';
import { worldContext } from '../WorldContext';
import { moodSystem } from '../MoodSystem';
import { relationshipGraph } from '../RelationshipGraph';
import { storyEngine } from '../StoryEngine';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IdleConfig {
  enabled: boolean;
  delayMinutes: number; // how long idle before triggering banter
  frequency: 'occasional' | 'chatty' | 'never';
}

export interface BanterMessage {
  kerbalName: string;
  content: string;
  timestamp: number;
  isBanter: true;
}

type BanterListener = (message: BanterMessage) => void;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'kerbal-control:idle-config';

const DEFAULTS: IdleConfig = {
  enabled: true,
  delayMinutes: 0.5,
  frequency: 'chatty',
};

const FREQUENCY_MINUTES: Record<Exclude<IdleConfig['frequency'], 'never'>, number> = {
  occasional: 10,
  chatty: 3,
};

/**
 * Adaptive cooldown: the longer the user is idle, the faster kerbals chat.
 * Returns cooldown in minutes.
 */
function adaptiveCooldown(idleMs: number, baseFreq: keyof typeof FREQUENCY_MINUTES): number {
  const baseMin = FREQUENCY_MINUTES[baseFreq];
  const idleMinutes = idleMs / 60_000;
  if (idleMinutes < 5) return baseMin;        // 0-5 min idle → base cooldown
  if (idleMinutes < 15) return Math.max(2, baseMin * 0.6); // 5-15 min → 60% of base
  if (idleMinutes < 30) return Math.max(1, baseMin * 0.3); // 15-30 min → 30% of base
  return 1; // 30+ min → every minute
}

const POLL_INTERVAL_MS = 30_000; // 30 seconds

const BANTER_TIMEOUT_MS = 15_000; // 15 seconds per banter message

// ---------------------------------------------------------------------------
// Topic pool for contextual conversations
// ---------------------------------------------------------------------------

const BANTER_TOPICS: string[] = [
  // Mod-related
  'best visual mods debate',
  'MechJeb vs manual piloting',
  'whether scatterer eats too much RAM',
  'Parallax 3.0 looks insane on Duna',
  'which part mod has the ugliest textures',
  'TweakScale abuse horror stories',
  'RO / RP-1 realism rabbit hole',
  'FAR aerodynamic nightmares',
  'why CKAN metadata is always out of date',
  'new planet pack just dropped',

  // Meta
  'Gene complains about Jeb\'s latest explosion',
  'Mortimer worries about mod storage costs',
  'Wernher wants a bigger R&D budget',
  'Linus accidentally deleted the save file again',
  'Gus is hoarding snacks in the VAB break room',
  'Bob insists on running more simulations',
  'Valentina broke the runway landing a 200-ton SSTO',
  'Bill filed an incident report about the kraken drive',
  'Walt is panicking about public relations after the last launch',
  'the tracking station lost signal to the Duna probe',

  // Random
  'what\'s for lunch at the KSC cafeteria',
  'who used the last coffee pod',
  'the snack bar is out of mystery goo',
  'someone left a Kerbal plushie in the command pod',
  'does the admin building ever get cleaned',
  'the new intern keeps pressing the big red button',
  'which launch pad has the best echo',
  'solar panel dust debate at the Duna outpost',
  'mission patch design contest results',
  'someone microwaved fish in the astronaut complex',
];

// ---------------------------------------------------------------------------
// IdleBanter
// ---------------------------------------------------------------------------

export class IdleBanter {
  private config: IdleConfig;
  private listeners: Set<BanterListener> = new Set();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastUserInputTime: number = Date.now();
  private lastBanterRoundTime: number = 0;
  private isRunning = false;
  private roundInProgress = false;

  // ---- constructor --------------------------------------------------------

  constructor(config?: Partial<IdleConfig>) {
    this.config = this.loadConfig();
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }

  // ---- public API ---------------------------------------------------------

  /** Returns a snapshot of the current idle-banter config. */
  getConfig(): IdleConfig {
    return { ...this.config };
  }

  /** Begin monitoring user idle time. Safe to call multiple times. */
  start(): void {
    if (this.isRunning) return;
    if (this.config.frequency === 'never' || !this.config.enabled) {
      this.isRunning = false;
      return;
    }

    this.isRunning = true;
    this.lastUserInputTime = Date.now();
    this.intervalId = setInterval(() => this.tick(), POLL_INTERVAL_MS);
  }

  /** Stop monitoring. Clears the interval. */
  stop(): void {
    this.isRunning = false;
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.roundInProgress = false;
  }

  /** Merge a partial config, persist, and restart if running. */
  updateConfig(patch: Partial<IdleConfig>): void {
    const wasRunning = this.isRunning;
    this.stop();

    this.config = { ...this.config, ...patch };
    this.persistConfig();

    if (wasRunning && this.config.enabled) {
      this.start();
    }
  }

  /**
   * Subscribe to banter events. Returns an unsubscribe function.
   */
  onBanter(listener: BanterListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Register user activity (e.g. text input, clicks) so the idle timer
   * resets. Components should call this on user interaction events.
   */
  markActivity(): void {
    this.lastUserInputTime = Date.now();
    worldContext.markActivity();
  }

  // ---- internal tick ------------------------------------------------------

  private tick(): void {
    if (!this.isRunning) return;
    if (this.config.frequency === 'never' || !this.config.enabled) return;
    if (this.roundInProgress) return;

    const idleMs = Date.now() - this.lastUserInputTime;
    const requiredMs = this.config.delayMinutes * 60_000;

    if (idleMs < requiredMs) return;

    // Check adaptive frequency cooldown (shorter cooldown the longer user is idle)
    const freqMinutes = adaptiveCooldown(idleMs, this.config.frequency as keyof typeof FREQUENCY_MINUTES);
    const cooldownMs = freqMinutes * 60_000;
    const sinceLastRound = Date.now() - this.lastBanterRoundTime;

    if (sinceLastRound < cooldownMs) return;

    this.runBanterRound();
  }

  // ---- banter round -------------------------------------------------------

  private async runBanterRound(): Promise<void> {
    this.roundInProgress = true;

    let participants: KerbalState[] = [];

    try {
      const candidates = kerbalStore.getAvailable();
      if (candidates.length < 2) return; // need at least 2 Kerbals

      // Pick 2-3 Kerbals — bias toward high-affinity pairs for better chemistry
      const count = Math.min(
        candidates.length,
        2 + Math.floor(Math.random() * 2), // 2 or 3
      );
      const shuffled = [...candidates].sort(() => Math.random() - 0.5);
      const initiator = shuffled[0];
      // Prefer kerbals who have strong feelings about the initiator
      const compatible = relationshipGraph.getStrongFeelings(initiator.name, shuffled.slice(1).map(k => k.name));
      const followers = compatible.length > 0
        ? compatible.slice(0, count - 1)
        : shuffled.slice(1, count).map(k => k.name);
      participants = [initiator, ...followers.map(name => kerbalStore.getByName(name)!).filter(Boolean)];

      // Pick a topic — mix story topics with banter topics
      const storyTopics = storyEngine.getStoryTopics();
      const allTopics = [...storyTopics, ...BANTER_TOPICS];
      const topic = allTopics[Math.floor(Math.random() * allTopics.length)];

      // --- Initiate: first Kerbal comments on the topic ---
      const opening = await this.generateMessage(initiator, topic, 'initiator');

      this.emit({
        kerbalName: initiator.name,
        content: opening,
        timestamp: Date.now(),
        isBanter: true,
      });

      // Brief pause between messages for natural rhythm
      await this.delay(2000 + Math.random() * 3000);

      // --- Responders ---
      for (let i = 1; i < participants.length; i++) {
        const responder = participants[i];
        const priorContext =
          i === 1
            ? `${initiator.name} said: "${opening}"\nTopic: ${topic}`
            : `Topic: ${topic} — respond to the conversation above`;

        const reply = await this.generateMessage(responder, priorContext, 'responder');
        this.emit({
          kerbalName: responder.name,
          content: reply,
          timestamp: Date.now(),
          isBanter: true,
        });

        if (i < participants.length - 1) {
          await this.delay(1500 + Math.random() * 2000);
        }
      }
    } finally {
      // Tick moods and record relationships for all participant pairs
      for (const p of participants) {
        moodSystem.tickMood(p.name, 'kerbal_interaction');
      }
      for (let i = 0; i < participants.length; i++) {
        for (let j = i + 1; j < participants.length; j++) {
          relationshipGraph.recordInteraction(participants[i].name, participants[j].name, true);
        }
      }
      // Advance story phases
      storyEngine.tick();

      this.lastBanterRoundTime = Date.now();
      this.roundInProgress = false;
    }
  }

  // ---- AI generation ------------------------------------------------------

  /**
   * Generate a single banter message for a Kerbal using real AI.
   *
   * Loads the Kerbal's soul definition, builds a system prompt from it,
   * and calls the AI service for a character-authentic response. Falls
   * back to stub templates if the AI call fails, so banter never breaks.
   */
  private async generateMessage(
    kerbal: KerbalState,
    context: string,
    role: 'initiator' | 'responder',
  ): Promise<string> {
    try {
      // Load the Kerbal's soul (personality, stats, backstory)
      const soul: KerbalSoul = await SoulLoader.load(kerbal.name.toLowerCase());

      // Derive temperature/topP from the Kerbal's courage and stupidity
      const params = statsToApiParams(soul);

      // Build messages: soul markdown as the system prompt, context as user
      const messages = [
        { role: 'system' as const, content: soul.rawMarkdown },
        { role: 'user' as const, content: `[BANTER - ${role}] ${context}` },
      ];

      // 15-second timeout — kerbals shouldn't take forever to chat
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), BANTER_TIMEOUT_MS);

      try {
        const result = await chatViaProvider(messages, {
          signal: controller.signal,
          temperature: params.temperature,
          topP: params.topP,
          noSystemPrompt: true,
        });

        if (!result.reply || result.reply === EMPTY_RESPONSE) {
          return this.getFallbackMessage(context, role);
        }
        return result.reply;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (err: unknown) {
      console.error(`[IdleBanter] AI call failed for ${kerbal.name}:`, err);
      // Fall back to stub templates so banter never completely breaks
      return this.getFallbackMessage(context, role);
    }
  }

  /**
   * Returns a canned stub message as a fallback when the AI call fails.
   * Prevents banter from going completely silent on API errors.
   */
  private getFallbackMessage(
    context: string,
    role: 'initiator' | 'responder',
  ): string {
    const templates: Record<typeof role, string[]> = {
      initiator: [
        t('banter.fallback.initiator.0', { context }),
        t('banter.fallback.initiator.1', { context }),
        t('banter.fallback.initiator.2', { context }),
        t('banter.fallback.initiator.3', { context }),
      ],
      responder: [
        t('banter.fallback.responder.0'),
        t('banter.fallback.responder.1'),
        t('banter.fallback.responder.2'),
        t('banter.fallback.responder.3'),
        t('banter.fallback.responder.4'),
      ],
    };

    const pool = templates[role];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // ---- helpers ------------------------------------------------------------

  private emit(message: BanterMessage): void {
    for (const fn of this.listeners) {
      fn(message);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ---- persistence --------------------------------------------------------

  private loadConfig(): IdleConfig {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<IdleConfig>;
        return { ...DEFAULTS, ...parsed };
      }
    } catch {
      // corrupted localStorage — fall through to defaults
    }
    return { ...DEFAULTS };
  }

  private persistConfig(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
    } catch {
      // quota exceeded or storage unavailable — silently ignore
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton convenience export
// ---------------------------------------------------------------------------

/** Pre-configured singleton instance for easy importing by components. */
export const idleBanter = new IdleBanter();

// Re-export TimeSystem helper for consumers that previously imported from here
export { getTimeOfDayDescription } from '../TimeSystem';
