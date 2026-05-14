import { growthSystem } from './GrowthSystem';

/**
 * SoulLoader — Loads soul.md files and provides them as system prompts
 * for AI calls. Each Kerbal has a unique personality defined by
 * courage, stupidity, mood traits, and a detailed markdown backstory.
 *
 * Growth data is merged on top of soul base stats, so kerbals
 * evolve over time while the .md files remain the canonical source.
 */

export interface KerbalSoul {
  name: string;
  role: string;
  courage: number;    // 0-100
  stupidity: number;  // 0-100
  badS: boolean;
  personality: string;
  knowledgeDomain: string[];
  speechStyle: string;
  catchphrases: string[];
  rawMarkdown: string;  // full soul.md content for system prompt
}

/** Maps Kerbal soul stats to LLM API parameters. */
export interface SoulApiParams {
  temperature: number;
  topP: number;
}

/**
 * Converts a KerbalSoul's courage and stupidity into LLM sampling parameters.
 * - BadS Kerbals get high temperature and wide top_p (chaotic output).
 * - Courage maps to temperature (more courageous = more creative).
 * - Stupidity maps to top_p (more stupid = wider token selection).
 */
export function statsToApiParams(soul: KerbalSoul): SoulApiParams {
  // BadS override: chaotic, unpredictable output
  if (soul.badS) return { temperature: 0.9, topP: 0.95 };

  // Courage 0-100 → temperature 0.1-1.0
  const temperature = 0.1 + (soul.courage / 100) * 0.9;
  // Stupidity 0-100 → topP 0.5-1.0
  const topP = 0.5 + (soul.stupidity / 100) * 0.5;

  return {
    temperature: Math.round(temperature * 100) / 100,
    topP: Math.round(topP * 100) / 100,
  };
}

/** All 9 named Kerbals available in the system. */
const KERBAL_NAMES = [
  'Gene',
  'Valentina',
  'Bill',
  'Bob',
  'Jebediah',
  'Wernher',
  'Linus',
  'Walt',
  'Mortimer',
];

/**
 * Parses a section value from markdown text.
 * Looks for patterns like `**Label:** value` and returns the value.
 */
function parseSection(markdown: string, label: string): string {
  const regex = new RegExp(`\\*\\*${label}:\\*\\*\\s*(.+)`, 'i');
  const match = markdown.match(regex);
  return match ? match[1].trim() : '';
}

/**
 * Parses a numeric section value from markdown text.
 */
function parseNumericSection(markdown: string, label: string): number {
  const value = parseSection(markdown, label);
  const num = parseInt(value, 10);
  return isNaN(num) ? 50 : Math.max(0, Math.min(100, num));
}

/**
 * Parses a boolean section value from markdown text.
 */
function parseBooleanSection(markdown: string, label: string): boolean {
  const value = parseSection(markdown, label).toLowerCase();
  return value === 'true' || value === 'yes' || value === 's';
}

/**
 * Parses a bulleted list section from markdown text.
 * Looks for `- [item]` patterns after the labeled section header.
 */
function parseListSection(markdown: string, label: string): string[] {
  const regex = new RegExp(`\\*\\*${label}:\\*\\*\\s*\\n([\\s\\S]*?)(?=\\n\\*\\*|$)`, 'i');
  const match = markdown.match(regex);
  if (!match) return [];

  const listBlock = match[1];
  const items: string[] = [];
  const itemRegex = /-\s*\[([^\]]+)\]/g;
  let itemMatch: RegExpExecArray | null;
  while ((itemMatch = itemRegex.exec(listBlock)) !== null) {
    items.push(itemMatch[1].trim());
  }
  return items;
}

/**
 * Static loader for Kerbal soul definitions.
 *
 * Soul markdown files live in `/src/kerbal-control/Souls/{name}.md`
 * and follow this format:
 *
 *   **Role:** Flight Director
 *   **Courage:** 85
 *   **Stupidity:** 10
 *   **BadS:** false
 *   **Personality:** Calm under pressure...
 *   **Knowledge Domain:**
 *   - [Mission Planning]
 *   - [Orbital Mechanics]
 *   **Speech Style:** Professional, clipped...
 *   **Catchphrases:**
 *   - ["Failure is not an option"]
 *   - ["Check your staging"]
 */
export class SoulLoader {
  /**
   * Fetches and parses a soul.md file for the named Kerbal.
   * Returns a fully populated KerbalSoul object.
   */
  static async load(name: string): Promise<KerbalSoul> {
    const response = await fetch(`/kerbal-souls/${name}.md`);
    if (!response.ok) {
      throw new Error(`Failed to load soul for "${name}": ${response.status} ${response.statusText}`);
    }

    const rawMarkdown = await response.text();

    // Brief roleplay instruction — keeps kerbals conversational
    const roleplayWrapper = [
      `You are ${name}. Stay in character. Match the user's tone. Be brief (1-3 sentences).`,
      'Do not introduce yourself repeatedly. Never mention being an AI. Always respond.',
    ].join(' ');
    const wrappedMarkdown = roleplayWrapper + '\n\n' + rawMarkdown;

    return {
      name,
      role: parseSection(rawMarkdown, 'Role'),
      courage: parseNumericSection(rawMarkdown, 'Courage'),
      stupidity: parseNumericSection(rawMarkdown, 'Stupidity'),
      badS: parseBooleanSection(rawMarkdown, 'BadS'),
      personality: parseSection(rawMarkdown, 'Personality'),
      knowledgeDomain: parseListSection(rawMarkdown, 'Knowledge Domain'),
      speechStyle: parseSection(rawMarkdown, 'Speech Style'),
      catchphrases: parseListSection(rawMarkdown, 'Catchphrases'),
      rawMarkdown: wrappedMarkdown,
    };
  }

  /**
   * Returns the full raw markdown content as the system prompt
   * for an AI call using this Kerbal's persona.
   */
  static getSystemPrompt(soul: KerbalSoul): string {
    return soul.rawMarkdown;
  }

  /**
   * Fetches and parses a soul.md file for the named Kerbal,
   * then merges growth data (evolved stats) on top of the base soul.
   * Use this when the soul will be used for AI calls or visual rendering.
   */
  static async loadWithGrowth(name: string): Promise<KerbalSoul> {
    const soul = await SoulLoader.load(name);
    const effective = growthSystem.getEffectiveStats(name, soul.courage, soul.stupidity);
    soul.courage = effective.courage;
    soul.stupidity = effective.stupidity;

    // Append growth context to the system prompt
    const growthContext = growthSystem.buildGrowthContext(name);
    if (growthContext) {
      soul.rawMarkdown += '\n\n' + growthContext;
    }

    return soul;
  }

  /**
   * Returns the names of all 9 Kerbals in the system.
   */
  static getAllNames(): string[] {
    return [...KERBAL_NAMES];
  }
}
