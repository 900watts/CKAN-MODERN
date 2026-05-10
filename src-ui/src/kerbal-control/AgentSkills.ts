/**
 * AgentSkills — Tool registry for kerbal agent capabilities.
 * Each kerbal gets role-specific tools. Web search is universal.
 * Tools execute real actions (web search, registry lookup, calculations).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string }>;
  /** Roles that have access to this tool. Empty = all kerbals. */
  roles: string[];
  execute: (params: Record<string, unknown>) => Promise<string>;
}

export interface ToolCall {
  toolName: string;
  params: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

async function webSearch(query: string): Promise<string> {
  try {
    const res = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return 'Search unavailable.';
    const data = await res.json();

    const results: string[] = [];
    if (data.AbstractText) {
      results.push(`Summary: ${data.AbstractText.slice(0, 300)}`);
    }
    if (data.RelatedTopics) {
      for (const t of data.RelatedTopics.slice(0, 3)) {
        if (t.Text) results.push(`- ${t.Text.slice(0, 150)}`);
      }
    }
    return results.length > 0 ? results.join('\n') : `No results found for "${query}".`;
  } catch {
    return 'Search timed out. Try again or ask me directly.';
  }
}

async function fetchUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return `Failed to fetch (${res.status}).`;
    const text = await res.text();
    // Strip HTML tags for a rough text extraction
    const stripped = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return stripped.slice(0, 2000);
  } catch {
    return 'Could not fetch the URL.';
  }
}

function getCurrentTime(): string {
  const now = new Date();
  return now.toLocaleString();
}

function getModInfo(identifier: string): string {
  // Try to load from the local registry cache
  try {
    const raw = sessionStorage.getItem('ckan-registry-cache');
    if (raw) {
      const mods = JSON.parse(raw);
      const mod = mods[identifier] || mods[identifier.toLowerCase()];
      if (mod) {
        return `${mod.name || identifier}: ${mod.abstract || 'No description'}. Version: ${mod.version || 'unknown'}. KSP: ${mod.ksp_version_min || '?'} - ${mod.ksp_version_max || '?'}`;
      }
    }
  } catch {}
  return `No cached info for "${identifier}". Try refreshing the repository first.`;
}

function calculateDeltaV(params: Record<string, string>): string {
  const isp = parseFloat(params.isp || '300');
  const wetMass = parseFloat(params.wet_mass || '10');
  const dryMass = parseFloat(params.dry_mass || '5');
  const g0 = 9.81;
  const dv = isp * g0 * Math.log(wetMass / dryMass);
  return `Delta-V: ${dv.toFixed(1)} m/s (ISP: ${isp}s, Wet: ${wetMass}t, Dry: ${dryMass}t)`;
}

function estimateStorage(): string {
  try {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) total += (localStorage.getItem(key) || '').length * 2; // UTF-16
    }
    return `Estimated localStorage usage: ${(total / 1024).toFixed(1)} KB.`;
  } catch {
    return 'Could not estimate storage.';
  }
}

function missionChecklist(): string {
  const steps = [
    '1. Verify all mods are compatible with target KSP version',
    '2. Check ModuleManager patches for conflicts',
    '3. Test in a sandbox save first',
    '4. Back up your save files',
    '5. Launch and check KSP.log for errors',
  ];
  return 'Standard pre-launch checklist:\n' + steps.join('\n');
}

// ---------------------------------------------------------------------------
// Tool catalog
// ---------------------------------------------------------------------------

export const AGENT_TOOLS: AgentTool[] = [
  {
    name: 'web_search',
    description: 'Search the web for real information about KSP, mods, space news, or anything.',
    parameters: { query: { type: 'string', description: 'What to search for' } },
    roles: [],
    execute: (p) => webSearch(p.query as string),
  },
  {
    name: 'fetch_url',
    description: 'Fetch and read contents of a URL.',
    parameters: { url: { type: 'string', description: 'Full URL to fetch' } },
    roles: ['gene', 'wernher', 'bob'],
    execute: (p) => fetchUrl(p.url as string),
  },
  {
    name: 'current_time',
    description: 'Get the current real-world date and time.',
    parameters: {},
    roles: [],
    execute: () => Promise.resolve(getCurrentTime()),
  },
  {
    name: 'mod_info',
    description: 'Look up information about a mod from the CKAN registry.',
    parameters: { identifier: { type: 'string', description: 'CKAN mod identifier' } },
    roles: ['gene', 'bill', 'bob', 'wernher'],
    execute: (p) => Promise.resolve(getModInfo(p.identifier as string)),
  },
  {
    name: 'calculate_deltav',
    description: 'Calculate delta-v using the rocket equation.',
    parameters: {
      isp: { type: 'number', description: 'Specific impulse in seconds' },
      wet_mass: { type: 'number', description: 'Total mass with fuel (tons)' },
      dry_mass: { type: 'number', description: 'Mass without fuel (tons)' },
    },
    roles: ['wernher', 'bob'],
    execute: (p) => Promise.resolve(calculateDeltaV(p as Record<string, string>)),
  },
  {
    name: 'check_storage',
    description: 'Check how much storage the mod manager is using.',
    parameters: {},
    roles: ['mortimer'],
    execute: () => Promise.resolve(estimateStorage()),
  },
  {
    name: 'prelaunch_checklist',
    description: 'Generate a standard pre-launch checklist for mission preparation.',
    parameters: {},
    roles: ['gene', 'walt'],
    execute: () => Promise.resolve(missionChecklist()),
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Filter tools available to a specific kerbal role. */
export function getToolsForKerbal(roleName: string): AgentTool[] {
  const lower = roleName.toLowerCase();
  return AGENT_TOOLS.filter((t) => t.roles.length === 0 || t.roles.includes(lower));
}

/** Build a tools description block for system prompts. */
export function buildToolsPrompt(roleName: string): string {
  const tools = getToolsForKerbal(roleName);
  if (tools.length === 0) return '';

  const lines = ['\n[TOOLS AVAILABLE - you can use these to get real information]'];
  for (const t of tools) {
    const params = Object.entries(t.parameters)
      .map(([k, v]) => `${k}=<${v.type}>`)
      .join(', ');
    lines.push(`- ${t.name}${params ? `(${params})` : ''}: ${t.description}`);
  }
  lines.push('');
  lines.push('To use a tool, output EXACTLY: [TOOL_CALL:tool_name param1=value1 param2=value2]');
  lines.push('Example: [TOOL_CALL:web_search query=latest KSP mods 2026]');
  lines.push('You will receive the results. Then respond naturally incorporating the info.');
  return lines.join('\n');
}

/** Parse tool calls from AI response text. */
export function parseToolCalls(text: string): ToolCall[] {
  const calls: ToolCall[] = [];
  const regex = /\[TOOL_CALL:(\w+)\s+(.+?)\]/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const toolName = match[1];
    const paramsStr = match[2];
    const params: Record<string, string> = {};
    // Parse key=value pairs (value may be quoted or unquoted)
    const paramRegex = /(\w+)=("[^"]*"|\S+)/g;
    let pm;
    while ((pm = paramRegex.exec(paramsStr)) !== null) {
      params[pm[1]] = pm[2].replace(/^"|"$/g, '');
    }
    calls.push({ toolName, params });
  }
  return calls;
}

/** Execute a tool call and return the result. */
export async function executeToolCall(call: ToolCall): Promise<string> {
  const tool = AGENT_TOOLS.find((t) => t.name === call.toolName);
  if (!tool) return `Unknown tool: ${call.toolName}`;
  try {
    return await tool.execute(call.params);
  } catch (err) {
    return `Tool error: ${err instanceof Error ? err.message : 'Unknown error'}`;
  }
}

/** Strip tool call tags from AI response to display clean text. */
export function stripToolCalls(text: string): string {
  return text.replace(/\[TOOL_CALL:\w+\s+.*?\]/g, '').trim();
}
