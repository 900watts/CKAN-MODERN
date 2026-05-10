/**
 * MoodSystem — Dynamic mood state machine for kerbals.
 * Moods decay toward normal over time, shift with interactions,
 * time-of-day, and events. Injects mood directives into AI prompts.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MoodLevel =
  | 'ecstatic'
  | 'excited'
  | 'normal'
  | 'tired'
  | 'annoyed'
  | 'groggy'
  | 'anxious';

export type MoodTrigger =
  | 'time_passing'
  | 'user_interaction'
  | 'kerbal_interaction'
  | 'error_occurred'
  | 'shift_change'
  | 'user_praise'
  | 'user_ignore'
  | 'break_start'
  | 'break_end';

interface MoodState {
  level: MoodLevel;
  intensity: number;
  lastTransition: number;
  trigger: MoodTrigger;
}

// ---------------------------------------------------------------------------
// Mood descriptions for prompt injection
// ---------------------------------------------------------------------------

const MOOD_PROMPTS: Record<MoodLevel, string> = {
  ecstatic: `[MOOD: ecstatic] You're in an uncharacteristically great mood. Be enthusiastic, crack jokes, maybe hum a little. Everything is AWESOME.`,
  excited: `[MOOD: excited] You're feeling energetic and optimistic. Be more animated than usual, use exclamation points sparingly.`,
  normal: `[MOOD: normal] You're in your default state. Act according to your base personality.`,
  tired: `[MOOD: tired] You're running low on energy. Be slightly slower, maybe sigh once. Still professional but lower effort.`,
  annoyed: `[MOOD: annoyed] Something is irritating you. Be slightly curt, sarcastic, or passive-aggressive. Don't be outright rude — just clearly bothered.`,
  groggy: `[MOOD: groggy] You just woke up or are half-asleep. Be slow, confused, yawn. Take a moment to process things.`,
  anxious: `[MOOD: anxious] You're worried about something. Fidget verbally, express concern, double-check things.`,
};

// ---------------------------------------------------------------------------
// Mood transitions — trigger → possible next moods
// ---------------------------------------------------------------------------

const MOOD_TRANSITIONS: Record<MoodTrigger, MoodLevel[]> = {
  time_passing: ['normal', 'tired', 'groggy'],
  user_interaction: ['excited', 'normal', 'ecstatic'],
  kerbal_interaction: ['excited', 'annoyed', 'normal', 'anxious'],
  error_occurred: ['annoyed', 'anxious', 'normal'],
  shift_change: ['groggy', 'tired', 'normal', 'excited'],
  user_praise: ['ecstatic', 'excited', 'normal'],
  user_ignore: ['annoyed', 'tired'],
  break_start: ['tired', 'groggy', 'normal'],
  break_end: ['excited', 'normal', 'groggy'],
};

// ---------------------------------------------------------------------------
// MoodSystem
// ---------------------------------------------------------------------------

const STORAGE_PREFIX = 'kerbal-mood:';

class MoodSystem {
  private moods = new Map<string, MoodState>();
  private decayInterval: ReturnType<typeof setInterval> | null = null;

  // ---- public API -----------------------------------------------------------

  /** Start the natural mood decay timer (every 5 minutes). */
  start(): void {
    if (this.decayInterval) return;
    this.decayInterval = setInterval(() => this.decayAll(), 300_000);
  }

  stop(): void {
    if (this.decayInterval) {
      clearInterval(this.decayInterval);
      this.decayInterval = null;
    }
  }

  /** Get the current mood state for a kerbal (loads from storage if needed). */
  getMood(name: string): MoodState {
    const key = name.toLowerCase();
    if (!this.moods.has(key)) {
      this.moods.set(key, this.load(key));
    }
    return this.moods.get(key)!;
  }

  /**
   * Tick a kerbal's mood based on a trigger. The mood may shift to a new level
   * depending on the trigger type and some randomness.
   */
  tickMood(name: string, trigger: MoodTrigger, context?: string): void {
    const key = name.toLowerCase();
    const current = this.getMood(key);
    const candidates = MOOD_TRANSITIONS[trigger];

    // 40% chance to shift mood on any trigger
    if (Math.random() < 0.4) {
      const next = candidates[Math.floor(Math.random() * candidates.length)];
      if (next !== current.level) {
        console.log(
          `[MoodSystem] ${name}: ${current.level} → ${next} (${trigger}${context ? ': ' + context : ''})`,
        );
      }
      current.level = next;
      current.intensity = 0.5 + Math.random() * 0.5;
      current.lastTransition = Date.now();
      current.trigger = trigger;
    }

    // Small intensity bump
    current.intensity = Math.min(1, current.intensity + 0.1);

    this.persist(key, current);
  }

  /** Build a compact mood directive for AI prompts. */
  buildMoodPrompt(name: string): string {
    const mood = this.getMood(name);
    return MOOD_PROMPTS[mood.level];
  }

  // ---- internal -------------------------------------------------------------

  private decayAll(): void {
    for (const [key, mood] of this.moods) {
      // Decay intensity over time
      mood.intensity = Math.max(0.1, mood.intensity - 0.15);

      // Low intensity + old transition → drift to normal
      const age = Date.now() - mood.lastTransition;
      if (mood.intensity < 0.3 && age > 600_000 && mood.level !== 'normal') {
        mood.level = 'normal';
        mood.intensity = 0.5;
        mood.lastTransition = Date.now();
        mood.trigger = 'time_passing';
      }

      this.persist(key, mood);
    }
  }

  // ---- persistence ----------------------------------------------------------

  private load(name: string): MoodState {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + name);
      if (raw) return JSON.parse(raw) as MoodState;
    } catch {}
    return {
      level: 'normal',
      intensity: 0.5,
      lastTransition: Date.now(),
      trigger: 'time_passing',
    };
  }

  private persist(name: string, state: MoodState): void {
    try {
      localStorage.setItem(STORAGE_PREFIX + name, JSON.stringify(state));
    } catch {}
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const moodSystem = new MoodSystem();
