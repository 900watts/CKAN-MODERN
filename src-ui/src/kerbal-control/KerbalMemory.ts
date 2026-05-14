/**
 * KerbalMemory — Per-kerbal persistent memory system.
 *
 * Each kerbal remembers past conversations via localStorage. Memories are
 * summarized and injected into the AI system prompt so kerbals recall prior
 * interactions across sessions.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KerbalMemory {
  kerbalName: string;
  /** Key facts the kerbal has learned about the user / world. */
  facts: string[];
  /** Condensed summaries of prior conversations (newest last). */
  conversationSummaries: string[];
  /** When this memory was last updated (epoch ms). */
  lastUpdated: number;
}

// ---------------------------------------------------------------------------
// localStorage persistence
// ---------------------------------------------------------------------------

const MEMORY_PREFIX = 'kerbal-memory:';
const MAX_FACTS = 20;
const MAX_SUMMARIES = 10;

function loadMemory(kerbalName: string): KerbalMemory {
  try {
    const raw = localStorage.getItem(`${MEMORY_PREFIX}${kerbalName.toLowerCase()}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    kerbalName,
    facts: [],
    conversationSummaries: [],
    lastUpdated: 0,
  };
}

function saveMemory(memory: KerbalMemory): void {
  try {
    localStorage.setItem(
      `${MEMORY_PREFIX}${memory.kerbalName.toLowerCase()}`,
      JSON.stringify(memory),
    );
  } catch {}
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const KerbalMemory = {
  get(kerbalName: string): KerbalMemory {
    return loadMemory(kerbalName);
  },

  /** Add a conversation summary to the kerbal's memory. */
  addSummary(kerbalName: string, userMessage: string, kerbalResponse: string): void {
    const mem = loadMemory(kerbalName);
    const summary = `User: "${userMessage.slice(0, 120)}" → ${kerbalName}: "${kerbalResponse.slice(0, 120)}"`;
    mem.conversationSummaries.push(summary);
    if (mem.conversationSummaries.length > MAX_SUMMARIES) {
      mem.conversationSummaries = mem.conversationSummaries.slice(-MAX_SUMMARIES);
    }
    mem.lastUpdated = Date.now();
    saveMemory(mem);
  },

  /** Add a fact the kerbal learned. */
  addFact(kerbalName: string, fact: string): void {
    const mem = loadMemory(kerbalName);
    if (!mem.facts.includes(fact)) {
      mem.facts.push(fact);
      if (mem.facts.length > MAX_FACTS) {
        mem.facts = mem.facts.slice(-MAX_FACTS);
      }
    }
    mem.lastUpdated = Date.now();
    saveMemory(mem);
  },

  /**
   * Extract memorable facts from a conversation and store them.
   * Uses pattern matching — no AI call needed, so it's instant.
   */
  extractAndStore(kerbalName: string, userMessage: string, _kerbalResponse: string): void {
    const msg = userMessage.toLowerCase();

    // Name extraction: "I'm X", "my name is X", "call me X"
    const nameMatch = msg.match(/(?:i'm|i am|my name is|call me)\s+([a-z]+)/i);
    if (nameMatch) {
      const name = nameMatch[1].charAt(0).toUpperCase() + nameMatch[1].slice(1);
      KerbalMemory.addFact(kerbalName, `User's name is ${name}`);
    }

    // Preferences: "I like X", "I love X", "I hate X", "I don't like X"
    const likeMatch = msg.match(/i (?:really )?(?:like|love|enjoy|prefer)\s+(.+?)(?:\.|!|$)/i);
    if (likeMatch) {
      KerbalMemory.addFact(kerbalName, `User likes ${likeMatch[1].trim()}`);
    }
    const hateMatch = msg.match(/i (?:really )?(?:hate|dislike|can't stand)\s+(.+?)(?:\.|!|$)/i);
    if (hateMatch) {
      KerbalMemory.addFact(kerbalName, `User dislikes ${hateMatch[1].trim()}`);
    }

    // Game context: KSP version, mod counts, play style
    const versionMatch = msg.match(/ksp\s*(\d+[\.\d]*)/i);
    if (versionMatch) {
      KerbalMemory.addFact(kerbalName, `User plays KSP ${versionMatch[1]}`);
    }
    const modMatch = msg.match(/(\d+)\s*mod/i);
    if (modMatch) {
      KerbalMemory.addFact(kerbalName, `User has ${modMatch[1]} mods installed`);
    }

    // Skill level: "I'm new", "I'm a veteran", "I'm experienced"
    const skillMatch = msg.match(/i'm (?:a |an )?(beginner|newbie|veteran|experienced|pro|expert|new player)/i);
    if (skillMatch) {
      KerbalMemory.addFact(kerbalName, `User is a ${skillMatch[1]} KSP player`);
    }

    // Current activity: "I'm building X", "I'm trying to X", "I'm working on X"
    const activityMatch = msg.match(/i'm (?:building|trying to|working on|setting up|designing)\s+(.+?)(?:\.|!|$)/i);
    if (activityMatch) {
      KerbalMemory.addFact(kerbalName, `User is working on: ${activityMatch[1].trim()}`);
    }

    // Problems: "I can't X", "X isn't working", "X broke"
    const problemMatch = msg.match(/(?:i can't|doesn't work|isn't working|won't)\s+(.+?)(?:\.|!|$)/i);
    if (problemMatch) {
      KerbalMemory.addFact(kerbalName, `User had trouble with: ${problemMatch[1].trim()}`);
    }
  },

  /**
   * Build a concise memory preamble for injection into the system prompt.
   * Returns empty string if there are no memories.
   */
  buildMemoryContext(kerbalName: string): string {
    const mem = loadMemory(kerbalName);
    const parts: string[] = [];

    if (mem.facts.length > 0) {
      parts.push('## Memory — things you know about the user\n' +
        mem.facts.map((f) => `- ${f}`).join('\n'));
    }

    if (mem.conversationSummaries.length > 0) {
      const recent = mem.conversationSummaries.slice(-5);
      parts.push('## Recent conversations\n' +
        recent.map((s) => `- ${s}`).join('\n'));
    }

    return parts.length > 0 ? '\n\n' + parts.join('\n\n') : '';
  },

  /** Clear all memories for a kerbal. */
  clear(kerbalName: string): void {
    try {
      localStorage.removeItem(`${MEMORY_PREFIX}${kerbalName.toLowerCase()}`);
    } catch {}
  },
};
