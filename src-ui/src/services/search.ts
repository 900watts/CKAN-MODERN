/**
 * Phase 5 — AI-powered semantic search for CKAN mods.
 *
 * Sends a natural language query to Silicon Flow, which returns a structured
 * list of CKAN identifiers. We resolve those against the local registry and
 * supplement with a keyword search for anything the AI suggested but wasn't
 * found verbatim.
 */

import { aiService } from './ai';
import { registryService } from './registry';
import type { CkanModule } from './registry';

export interface AiSearchResult {
  mods: CkanModule[];
  explanation: string;
  query: string;
}

class SearchService {
  /**
   * Run a natural-language search.
   * Returns resolved mods + a human-readable explanation from the AI.
   */
  async aiSearch(query: string, signal?: AbortSignal): Promise<AiSearchResult> {
    const prompt = `Find KSP mods in CKAN matching this request: "${query}"

Return ONLY a JSON object (no other text, no markdown fences):
{"ids":["ExactCkanId1","ExactCkanId2"],"keywords":["fallback","terms"],"explanation":"One sentence why these fit."}

Rules:
- ids must be exact CKAN identifiers (case-sensitive, e.g. Scatterer, EnvironmentalVisualEnhancements, RealSolarSystem)
- Include 5–15 mods, most relevant first
- Only include mods you are confident exist in CKAN
- keywords are 2–4 plain search words as a fallback if ids aren't found`;

    const response = await aiService.chat(
      [{ role: 'user', content: prompt }],
      { signal, maxTokens: 512 }
    );

    let ids: string[] = [];
    let keywords: string[] = [];
    let explanation = '';

    try {
      // Extract the first {...} block in the response
      const jsonMatch = response.reply.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        ids = Array.isArray(parsed.ids) ? parsed.ids.filter((v: unknown) => typeof v === 'string') : [];
        keywords = Array.isArray(parsed.keywords) ? parsed.keywords.filter((v: unknown) => typeof v === 'string') : [];
        explanation = typeof parsed.explanation === 'string' ? parsed.explanation : '';
      }
    } catch {
      // Couldn't parse JSON — fall back to keyword search using the raw query
      keywords = query.split(/\s+/).filter((w) => w.length > 2);
    }

    // 1. Resolve exact identifiers from the registry
    const byId = ids
      .map((id) => registryService.getModById(id))
      .filter((m): m is CkanModule => m !== undefined);

    // 2. Keyword fallback for anything not found by ID
    const foundIds = new Set(byId.map((m) => m.identifier));
    const searchTerms = keywords.length > 0 ? keywords.join(' ') : query;
    const byKeyword = registryService
      .search(searchTerms)
      .filter((m) => !foundIds.has(m.identifier))
      .slice(0, 12);

    const mods = [...byId, ...byKeyword];

    return { mods, explanation: explanation || `AI results for: ${query}`, query };
  }
}

export const searchService = new SearchService();
export default searchService;
