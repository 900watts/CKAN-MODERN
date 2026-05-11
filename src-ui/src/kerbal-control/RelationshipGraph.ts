/**
 * RelationshipGraph — Pair-wise kerbal relationships.
 * Tracks affinity, shared/conflict topics, inside jokes between kerbals.
 * Drifts over time based on interactions. Injects relationship context into AI prompts.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RelationshipPair {
  kerbalA: string;
  kerbalB: string;
  affinity: number; // -1.0 (hatred) to 1.0 (best friends)
  sharedTopics: string[];
  conflictTopics: string[];
  insideJokes: string[];
  lastInteraction: number;
  interactionCount: number;
}

// ---------------------------------------------------------------------------
// Default relationships
// ---------------------------------------------------------------------------

function buildDefaults(): Record<string, RelationshipPair> {
  const pairs: Record<string, RelationshipPair> = {};

  function add(a: string, b: string, affinity: number, shared: string[], conflicts: string[], jokes: string[]) {
    const key = pairKey(a, b);
    pairs[key] = {
      kerbalA: a,
      kerbalB: b,
      affinity,
      sharedTopics: shared,
      conflictTopics: conflicts,
      insideJokes: jokes,
      lastInteraction: 0,
      interactionCount: 0,
    };
  }

  add('Jebediah', 'Bill', 0.7,
    ['SRBs', 'dangerous stunts', 'emergency repairs'],
    ['safety protocols'],
    ['That time with the SRBs and the VAB roof', 'The "unplanned rapid disassembly" incident report']);
  add('Walt', 'Jebediah', -0.3,
    [],
    ['safety regulations', 'PR disasters', 'press conferences'],
    []);
  add('Mortimer', 'Wernher', -0.2,
    [],
    ['budget requests', 'expensive experiments', 'resource allocation'],
    ['The "million-fund rocket snack delivery system" proposal']);
  add('Valentina', 'Jebediah', 0.5,
    ['piloting technique', 'speed records', 'stunt flying'],
    ['who is the better pilot'],
    ['The VAB helipad landing bet', 'Who broke the runway landing a 200-ton SSTO']);
  add('Linus', 'Wernher', 0.6,
    ['experimental tech', 'prototypes', 'simulations'],
    ['safety testing procedures'],
    ['The secret project in Lab B']);
  add('Bob', 'Bill', 0.4,
    ['science payloads', 'data analysis', 'mission design'],
    [],
    []);

  return pairs;
}

function pairKey(a: string, b: string): string {
  return [a.toLowerCase(), b.toLowerCase()].sort().join('::');
}

// ---------------------------------------------------------------------------
// RelationshipGraph
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'kerbal-relationships';

class RelationshipGraph {
  private pairs: Record<string, RelationshipPair>;

  constructor() {
    this.pairs = this.load();
  }

  // ---- public API -----------------------------------------------------------

  /** Get the relationship between two kerbals (creates neutral if missing). */
  get(a: string, b: string): RelationshipPair {
    const key = pairKey(a, b);
    if (!this.pairs[key]) {
      this.pairs[key] = {
        kerbalA: a,
        kerbalB: b,
        affinity: 0,
        sharedTopics: [],
        conflictTopics: [],
        insideJokes: [],
        lastInteraction: 0,
        interactionCount: 0,
      };
    }
    return this.pairs[key];
  }

  /**
   * Record an interaction between two kerbals. Affinity drifts based on
   * whether they agreed (positive) or argued (negative).
   */
  recordInteraction(a: string, b: string, agreed: boolean): void {
    const pair = this.get(a, b);
    const drift = agreed ? 0.02 : -0.02;
    pair.affinity = Math.max(-1, Math.min(1, pair.affinity + drift));
    pair.lastInteraction = Date.now();
    pair.interactionCount++;
    this.persist();
  }

  /**
   * Get kerbals most compatible with the given kerbal (highest affinity).
   * Used by banter to pick conversation partners who have chemistry.
   */
  getCompatible(name: string, candidates: string[]): string[] {
    return candidates
      .filter((c) => c.toLowerCase() !== name.toLowerCase())
      .map((c) => {
        const pair = this.get(name, c);
        return { name: c, affinity: pair.affinity };
      })
      .sort((a, b) => b.affinity - a.affinity)
      .map((x) => x.name);
  }

  /**
   * Get kerbals who have strong feelings (positive or negative) about the
   * given kerbal — these make for interesting conversation pairings.
   */
  getStrongFeelings(name: string, candidates: string[]): string[] {
    return candidates
      .filter((c) => c.toLowerCase() !== name.toLowerCase())
      .map((c) => {
        const pair = this.get(name, c);
        return { name: c, strength: Math.abs(pair.affinity) };
      })
      .sort((a, b) => b.strength - a.strength)
      .filter((x) => x.strength > 0.2)
      .map((x) => x.name);
  }

  /**
   * Build a compact relationship context for AI prompts when two kerbals
   * are interacting.
   */
  buildRelationshipPrompt(a: string, b: string): string {
    const pair = this.get(a, b);
    if (pair.interactionCount === 0) return '';

    const parts: string[] = [];
    parts.push(`[RELATIONSHIP with ${b}]:`);

    if (pair.affinity > 0.5) {
      parts.push(`You and ${b} are good friends (affinity ${pair.affinity.toFixed(1)}).`);
    } else if (pair.affinity < -0.3) {
      parts.push(`You and ${b} don't always see eye to eye (affinity ${pair.affinity.toFixed(1)}).`);
    }

    if (pair.sharedTopics.length > 0) {
      parts.push(`Shared interests: ${pair.sharedTopics.join(', ')}.`);
    }
    if (pair.insideJokes.length > 0) {
      parts.push(`Inside joke: "${pair.insideJokes[0]}"`);
    }
    if (pair.conflictTopics.length > 0) {
      parts.push(`Disagreements about: ${pair.conflictTopics.join(', ')}.`);
    }

    return parts.join(' ');
  }

  /** Get an insight about a kerbal pair for storytelling. */
  getInsight(a: string, b: string): string | null {
    const pair = this.get(a, b);
    if (pair.insideJokes.length > 0 && pair.interactionCount > 5) {
      return `${a} and ${b} share an inside joke: "${pair.insideJokes[0]}"`;
    }
    if (pair.affinity > 0.6) {
      return `${a} and ${b} are close — affinity ${pair.affinity.toFixed(1)}`;
    }
    if (pair.affinity < -0.4) {
      return `There's tension between ${a} and ${b} — affinity ${pair.affinity.toFixed(1)}`;
    }
    return null;
  }

  // ---- persistence ----------------------------------------------------------

  private load(): Record<string, RelationshipPair> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, RelationshipPair>;
        // Merge defaults for any missing pairs
        return { ...buildDefaults(), ...parsed };
      }
    } catch {}
    return buildDefaults();
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.pairs));
    } catch {}
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const relationshipGraph = new RelationshipGraph();
