import type { KerbalState } from '../KerbalStore';
import type { KerbalSoul } from '../SoulLoader';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RouteReason =
  | 'mentioned'
  | 'auto-domain'
  | 'broadcast'
  | 'unprompted-chime'
  | 'idle-banter'
  | 'proactive-checkin';

export interface RoutedMessage {
  /** Internal ID / lowercase name of the Kerbal that should respond. */
  targetKerbal: string;
  /** Why this Kerbal was chosen. */
  reason: RouteReason;
  /** The unmodified user message. */
  originalMessage: string;
}

// ---------------------------------------------------------------------------
// Domain keyword → Kerbal mapping
// ---------------------------------------------------------------------------

interface DomainRule {
  keywords: string[];
  kermanNames: string[];
}

const DOMAIN_RULES: DomainRule[] = [
  {
    keywords: ['visual', 'graphics', 'beautiful', 'pretty', 'looks'],
    kermanNames: ['walt'],
  },
  {
    keywords: ['aerodynamics', 'physics', 'delta-v', 'orbit', 'trajectory'],
    kermanNames: ['wernher', 'bob'],
  },
  {
    keywords: ['engine', 'booster', 'rocket', 'thrust'],
    kermanNames: ['wernher', 'jeb'],
  },
  {
    keywords: ['bug', 'crash', 'error', 'broken', 'fix'],
    kermanNames: ['bill'],
  },
  {
    keywords: ['science', 'experiment', 'data', 'lab'],
    kermanNames: ['bob'],
  },
  {
    keywords: ['cheap', 'budget', 'lightweight', 'performance'],
    kermanNames: ['mortimer'],
  },
  {
    keywords: ['mission', 'plan', 'launch', 'schedule'],
    kermanNames: ['gene'],
  },
  {
    keywords: ['experimental', 'alpha', 'beta', 'new mod'],
    kermanNames: ['linus'],
  },
  {
    keywords: ['install', 'uninstall', 'mod list'],
    kermanNames: ['gene'],
  },
  {
    keywords: ['news', 'latest', 'whats new', 'update', 'real', 'nasa', 'spacex', 'real rocket', 'what happened'],
    kermanNames: ['gene', 'wernher'],
  },
];

/** Broadcast trigger words — route to every present Kerbal. */
const BROADCAST_WORDS = new Set([
  'everyone',
  'all',
  'anyone',
  'somebody',
]);

// ---------------------------------------------------------------------------
// MessageRouter
// ---------------------------------------------------------------------------

export class MessageRouter {
  /**
   * Parse a user message and determine which Kerbal(s) should respond.
   *
   * Order of precedence:
   *   1. @mention / name-mention → direct route to that Kerbal
   *   2. Broadcast words ("everyone", "all", etc.) → all present Kerbals
   *   3. Keyword domain matching → best-matching Kerbal
   *   4. Default → first available Kerbal
   *
   * When only one Kerbal is routed, there is a 20 % chance that a second
   * Kerbal chimes in as an "unprompted-chime".
   */
  static route(
    message: string,
    presentKerbals: KerbalState[],
  ): RoutedMessage[] {
    if (!message || presentKerbals.length === 0) {
      return [];
    }

    const trimmed = message.trim();
    const lower = trimmed.toLowerCase();

    // Step 1 – @mention / name mention
    const mentioned = this.routeByMention(lower, presentKerbals);
    if (mentioned.length > 0) {
      return mentioned;
    }

    // Step 2 – broadcast keywords
    if (this.isBroadcast(lower)) {
      return presentKerbals.map((k) => ({
        targetKerbal: k.name.toLowerCase(),
        reason: 'broadcast' as const,
        originalMessage: trimmed,
      }));
    }

    // Step 3 – keyword-domain matching
    const domainResult = this.routeByDomain(lower, presentKerbals);
    if (domainResult.length > 0) {
      return this.maybeAddChime(domainResult, presentKerbals);
    }

    // Step 4 – fallback: route to Gene (Flight Director) as default point of contact
    const gene = presentKerbals.find(
      (k) => k.name.toLowerCase() === 'gene',
    );
    const fallbackTarget = gene ?? presentKerbals[0];
    const fallbackResult: RoutedMessage[] = [
      {
        targetKerbal: fallbackTarget.name.toLowerCase(),
        reason: 'auto-domain',
        originalMessage: trimmed,
      },
    ];

    return this.maybeAddChime(fallbackResult, presentKerbals);
  }

  // -----------------------------------------------------------------------
  // Mention routing
  // -----------------------------------------------------------------------

  /**
   * Check if the message contains an explicit mention of a Kerbal.
   * Supports forms like "@Bob", "Hey Bob", "Bob, help me", "Jebediah".
   */
  private static routeByMention(
    lowerMessage: string,
    presentKerbals: KerbalState[],
  ): RoutedMessage[] {
    // Build a lookup: lowercase-name → KerbalState
    const lookup = new Map<string, KerbalState>();
    for (const k of presentKerbals) {
      const key = k.name.toLowerCase();
      lookup.set(key, k);
      // Also store first-name portion (e.g. "jebediah" → "jeb")
      const firstName = key.split(' ')[0];
      if (firstName !== key) {
        lookup.set(firstName, k);
      }
      // Store just the Kerman name part (e.g. "jebediah kerman" → "jebediah")
      const kermanPart = key.replace(/\s*kerman\s*/i, '');
      if (kermanPart !== key && kermanPart.length > 0) {
        lookup.set(kermanPart, k);
      }
    }

    // Check for @mention patterns: @bob, @Wernher, etc.
    const atMention = this.extractMention(lowerMessage);
    if (atMention) {
      const match = lookup.get(atMention.toLowerCase());
      if (match) {
        return [
          {
            targetKerbal: match.name.toLowerCase(),
            reason: 'mentioned',
            originalMessage: lowerMessage,
          },
        ];
      }
    }

    // Check for name mentions in the message: "Hey Bob", "Bob, ...", "... Bob ?"
    // When multiple names match, route to the FIRST mentioned (by position in message).
    let bestMatch: { kerbal: KerbalState; pos: number } | null = null;
    for (const [key, kerbal] of lookup.entries()) {
      const regex = new RegExp(`\\b${this.escapeRegex(key)}\\b`, 'i');
      const match = regex.exec(lowerMessage);
      if (match && (bestMatch === null || match.index < bestMatch.pos)) {
        bestMatch = { kerbal, pos: match.index };
      }
    }

    if (bestMatch) {
      return [
        {
          targetKerbal: bestMatch.kerbal.name.toLowerCase(),
          reason: 'mentioned',
          originalMessage: lowerMessage,
        },
      ];
    }

    return [];
  }

  /** Extract a Kerbal name from an @mention in the format, e.g. "@Bob". */
  static extractMention(message: string): string | null {
    // Match @ followed by word characters, hyphens, or periods
    const match = message.match(/@([\w.-]+)/);
    return match ? match[1] : null;
  }

  // -----------------------------------------------------------------------
  // Broadcast
  // -----------------------------------------------------------------------

  private static isBroadcast(lowerMessage: string): boolean {
    const words = lowerMessage.split(/[\s,!.?]+/);
    return words.some((w) => BROADCAST_WORDS.has(w));
  }

  // -----------------------------------------------------------------------
  // Domain / keyword matching
  // -----------------------------------------------------------------------

  private static routeByDomain(
    lowerMessage: string,
    presentKerbals: KerbalState[],
  ): RoutedMessage[] {
    const presentNames = new Set(
      presentKerbals.map((k) => k.name.toLowerCase()),
    );

    // Score each Kerbal by domain-keyword relevance
    const scores = new Map<string, number>();

    for (const rule of DOMAIN_RULES) {
      let keywordMatchCount = 0;
      for (const kw of rule.keywords) {
        if (lowerMessage.includes(kw)) {
          keywordMatchCount++;
        }
      }

      if (keywordMatchCount === 0) continue;

      // Distribute score across all Kerbals in this domain
      for (const kName of rule.kermanNames) {
        if (!presentNames.has(kName)) continue;
        const current = scores.get(kName) ?? 0;
        scores.set(kName, current + keywordMatchCount);
      }
    }

    if (scores.size === 0) return [];

    // Return the highest-scoring Kerbal(s) — tie = all of them
    let bestScore = 0;
    for (const s of scores.values()) {
      if (s > bestScore) bestScore = s;
    }

    const results: RoutedMessage[] = [];
    for (const [name, score] of scores.entries()) {
      if (score === bestScore) {
        results.push({
          targetKerbal: name,
          reason: 'auto-domain',
          originalMessage: lowerMessage,
        });
      }
    }

    return results;
  }

  // -----------------------------------------------------------------------
  // Unprompted chime
  // -----------------------------------------------------------------------

  /**
   * When only one Kerbal is routed, there is a 20 % chance another present
   * Kerbal will chime in uninvited to add flavor and banter.
   */
  private static maybeAddChime(
    current: RoutedMessage[],
    presentKerbals: KerbalState[],
  ): RoutedMessage[] {
    if (current.length !== 1) return current;

    // 20 % chance
    if (Math.random() > 0.2) return current;

    const alreadyTargeted = new Set(current.map((r) => r.targetKerbal));
    const candidates = presentKerbals.filter(
      (k) => !alreadyTargeted.has(k.name.toLowerCase()),
    );

    if (candidates.length === 0) return current;

    // Pick a random candidate
    const chimingIn = candidates[Math.floor(Math.random() * candidates.length)];

    return [
      ...current,
      {
        targetKerbal: chimingIn.name.toLowerCase(),
        reason: 'unprompted-chime',
        originalMessage: current[0].originalMessage,
      },
    ];
  }

  // -----------------------------------------------------------------------
  // Soul-domain relevance scoring
  // -----------------------------------------------------------------------

  /**
   * Return a 0-1 relevance score for how well a Kerbal soul matches a
   * message based on domain keywords.
   *
   * This is used externally when callers want to rank Kerbals by how
   * relevant they are to a given topic, e.g. for displaying domain hints.
   */
  static matchDomain(message: string, soul: KerbalSoul): number {
    if (!message || !soul) return 0;

    const lowerMessage = message.toLowerCase();
    const soulName = soul.name.toLowerCase();

    // Find all domain rules that apply to this soul
    const relevantRules = DOMAIN_RULES.filter((rule) =>
      rule.kermanNames.includes(soulName),
    );

    if (relevantRules.length === 0) return 0;

    let totalKeywords = 0;
    let matchedKeywords = 0;

    for (const rule of relevantRules) {
      for (const kw of rule.keywords) {
        totalKeywords++;
        if (lowerMessage.includes(kw)) {
          matchedKeywords++;
        }
      }
    }

    if (totalKeywords === 0) return 0;
    return matchedKeywords / totalKeywords;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private static escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
