/**
 * StoryEngine — Cross-kerbal narrative arcs that evolve across days.
 * Stories progress regardless of user engagement. Kerbals reference
 * them in banter and proactive messages. Persisted to localStorage.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StoryPhase = 'setup' | 'development' | 'crisis' | 'climax' | 'resolution';

export interface StoryMilestone {
  id: string;
  description: string;
  triggerKerbal: string;
  revealed: boolean;
  revealedAt: number;
}

export interface StoryArc {
  id: string;
  title: string;
  phase: StoryPhase;
  phaseStartedAt: number;
  milestones: StoryMilestone[];
  nextAdvanceAt: number;
  totalDurationDays: number;
  involvedKerbals: string[];
}

// ---------------------------------------------------------------------------
// Default story arcs
// ---------------------------------------------------------------------------

function buildDefaultArcs(): StoryArc[] {
  return [
    {
      id: 'linus-secret-project',
      title: "Linus's Secret Project",
      phase: 'setup',
      phaseStartedAt: Date.now(),
      nextAdvanceAt: Date.now() + 86_400_000, // advance in 1 day
      totalDurationDays: 5,
      involvedKerbals: ['Linus', 'Wernher', 'Gene'],
      milestones: [
        {
          id: 'linus-suspicious',
          description: 'Linus has been requisitioning strange parts from inventory. Nobody knows why. He gets defensive when asked.',
          triggerKerbal: 'Wernher',
          revealed: false,
          revealedAt: 0,
        },
        {
          id: 'wernher-blueprint',
          description: 'Wernher found a crumpled blueprint in the VAB labeled "Project Snack Delivery — CLASSIFIED". Linus is definitely building something.',
          triggerKerbal: 'Wernher',
          revealed: false,
          revealedAt: 0,
        },
        {
          id: 'gene-demands-answers',
          description: 'Gene noticed the missing inventory items. He demands to know what Linus is working on. Linus refuses to answer, citing "national dessert security."',
          triggerKerbal: 'Gene',
          revealed: false,
          revealedAt: 0,
        },
        {
          id: 'big-reveal',
          description: 'The secret is out: Linus built a fully automated snack delivery rocket that can send chips from the VAB to any desk in Mission Control. It works. Mostly.',
          triggerKerbal: 'Linus',
          revealed: false,
          revealedAt: 0,
        },
      ],
    },
    {
      id: 'jeb-val-bet',
      title: "Jeb & Val's Landing Bet",
      phase: 'setup',
      phaseStartedAt: Date.now(),
      nextAdvanceAt: Date.now() + 100_000_000,
      totalDurationDays: 3,
      involvedKerbals: ['Jebediah', 'Valentina', 'Bill', 'Bob'],
      milestones: [
        {
          id: 'bet-started',
          description: 'Jeb and Valentina have a running wager: who can land on the VAB helipad first. Bill is taking bets. Bob thinks they\'re both insane.',
          triggerKerbal: 'Bill',
          revealed: false,
          revealedAt: 0,
        },
        {
          id: 'first-attempt',
          description: 'Valentina tried the VAB landing during a "routine test flight." She got within 50 meters. Jeb claims he could do better. The bet is heating up.',
          triggerKerbal: 'Valentina',
          revealed: false,
          revealedAt: 0,
        },
        {
          id: 'jeb-crashes',
          description: 'Jeb attempted the landing and... overshot. He hit the water tower instead. Gene is furious. The VAB is fine. The water tower is not.',
          triggerKerbal: 'Jebediah',
          revealed: false,
          revealedAt: 0,
        },
      ],
    },
    {
      id: 'walt-media-event',
      title: "Walt's Dreaded Media Event",
      phase: 'setup',
      phaseStartedAt: Date.now(),
      nextAdvanceAt: Date.now() + 100_000_000,
      totalDurationDays: 4,
      involvedKerbals: ['Walt', 'Mortimer', 'Gene'],
      milestones: [
        {
          id: 'walt-planning',
          description: 'Walt is planning a "Public Relations Showcase" to improve KSC\'s image after the last few... incidents. Mortimer is already calculating the cost.',
          triggerKerbal: 'Mortimer',
          revealed: false,
          revealedAt: 0,
        },
        {
          id: 'budget-panic',
          description: 'Mortimer saw Walt\'s proposed budget. He hasn\'t stopped hyperventilating for three hours. "Balloon animals do NOT cost this much."',
          triggerKerbal: 'Mortimer',
          revealed: false,
          revealedAt: 0,
        },
        {
          id: 'gene-mediates',
          description: 'Gene had to mediate between Walt and Mortimer. The compromise: half the balloon animals, but a Jebediah "live stunt demonstration" to make up for it.',
          triggerKerbal: 'Gene',
          revealed: false,
          revealedAt: 0,
        },
        {
          id: 'event-day',
          description: 'The media event happened. The balloon animals escaped. Jeb\'s stunt involved unexpected fire. The press LOVED it. Mortimer is crying in the corner.',
          triggerKerbal: 'Walt',
          revealed: false,
          revealedAt: 0,
        },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Story phase progression timing
// ---------------------------------------------------------------------------

const PHASE_ADVANCE_HOURS: Record<StoryPhase, number> = {
  setup: 24,
  development: 36,
  crisis: 12,
  climax: 24,
  resolution: 48,
};

const PHASE_ORDER: StoryPhase[] = ['setup', 'development', 'crisis', 'climax', 'resolution'];

// ---------------------------------------------------------------------------
// StoryEngine
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'kerbal-stories:arcs';

class StoryEngine {
  private arcs: StoryArc[] = [];

  constructor() {
    this.arcs = this.load();
  }

  // ---- public API -----------------------------------------------------------

  /** Advance story phases that are due (call periodically). */
  tick(): void {
    const now = Date.now();
    let changed = false;

    for (const arc of this.arcs) {
      if (arc.phase === 'resolution') continue;
      if (now >= arc.nextAdvanceAt) {
        const idx = PHASE_ORDER.indexOf(arc.phase);
        if (idx >= 0 && idx < PHASE_ORDER.length - 1) {
          arc.phase = PHASE_ORDER[idx + 1];
          arc.phaseStartedAt = now;
          arc.nextAdvanceAt = now + PHASE_ADVANCE_HOURS[arc.phase] * 3_600_000;
          console.log(`[StoryEngine] "${arc.title}" → ${arc.phase}`);
          changed = true;
        }
      }
    }

    if (changed) this.persist();
  }

  /** Get milestones ready to be revealed (not yet revealed, story not resolved). */
  getPendingReveals(): StoryMilestone[] {
    return this.arcs
      .filter((a) => a.phase !== 'resolution')
      .flatMap((a) => a.milestones.filter((m) => !m.revealed))
      .slice(0, 1); // Only return one at a time
  }

  /** Mark a milestone as revealed. */
  markRevealed(milestoneId: string): void {
    for (const arc of this.arcs) {
      const m = arc.milestones.find((x) => x.id === milestoneId);
      if (m && !m.revealed) {
        m.revealed = true;
        m.revealedAt = Date.now();
        this.persist();
        return;
      }
    }
  }

  /**
   * Build a story context prompt for a kerbal involved in active stories.
   * Only includes info the kerbal would know at the current phase.
   */
  buildStoryPrompt(name: string): string {
    const lower = name.toLowerCase();
    const myArcs = this.arcs.filter(
      (a) => a.involvedKerbals.some((k) => k.toLowerCase() === lower) && a.phase !== 'resolution',
    );

    if (myArcs.length === 0) return '';

    const parts: string[] = ['[ONGOING STORIES — things happening at KSC]'];
    for (const arc of myArcs) {
      const revealed = arc.milestones.filter((m) => m.revealed);
      const nextMilestone = arc.milestones.find((m) => !m.revealed);
      parts.push(`\n"${arc.title}" (${arc.phase.toUpperCase()} phase):`);
      if (revealed.length > 0) {
        const lastRevealed = revealed[revealed.length - 1];
        parts.push(`  Last known: ${lastRevealed.description}`);
      }
      if (nextMilestone && arc.phase !== 'setup') {
        parts.push(`  You might know: ${nextMilestone.description}`);
      }
    }

    return parts.join('\n');
  }

  /** Get story-driven topics for banter injection. */
  getStoryTopics(): string[] {
    const topics: string[] = [];
    for (const arc of this.arcs) {
      if (arc.phase === 'resolution') continue;
      const next = arc.milestones.find((m) => !m.revealed);
      if (next) {
        topics.push(`${arc.title}: ${next.description}`);
      }
    }
    return topics;
  }

  // ---- persistence ----------------------------------------------------------

  private load(): StoryArc[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StoryArc[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return buildDefaultArcs();
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.arcs));
    } catch {}
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const storyEngine = new StoryEngine();
