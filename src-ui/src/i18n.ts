/**
 * Minimal i18n module — provides a `useT()` hook and a `t()` function
 * for the CKAN Modern frontend.
 *
 * Translations are inline for now; this can be swapped for a full
 * i18n library (i18next, react-intl, etc.) later.
 */

export type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

const fallback: Record<string, string> = {
  'nav.available': 'Available',
  'nav.installed': 'Installed',
  'nav.downloads': 'Downloads',
  'nav.instances': 'Instances',
  'nav.settings': 'Settings',
  'nav.aiAssistant': 'AI Assistant',
  'nav.collapse': 'Collapse',
  'nav.expand': 'Expand',
  'nav.modsLoaded': '{count} mods loaded',
  'nav.loadingRegistry': 'Loading registry…',
  'nav.installed.count': '{count} installed',
  'nav.missionControl': 'Mission Control',
};

function lookup(key: string, params?: Record<string, string | number>): string {
  let value = fallback[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      value = value.replace(`{${k}}`, String(v));
    }
  }
  return value;
}

/**
 * Simple translation function. Returns the translated string,
 * or the key itself if no translation is found.
 */
export const t: TranslateFn = lookup;

/**
 * React hook that returns `{ t }` — a stable translation function.
 * In the current implementation it returns the same value every render,
 * but a real i18n solution would make it reactive to locale changes.
 */
export function useT(): { t: TranslateFn } {
  return { t: lookup };
}
