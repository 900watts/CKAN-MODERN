export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'ckan_theme';

class ThemeService {
  private theme: Theme;
  private listeners: Set<(theme: Theme) => void> = new Set();

  constructor() {
    const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
    this.theme = saved === 'light' ? 'light' : 'dark';
    this.apply();
  }

  getTheme(): Theme {
    return this.theme;
  }

  setTheme(theme: Theme) {
    this.theme = theme;
    localStorage.setItem(STORAGE_KEY, theme);
    this.apply();
    this.listeners.forEach((fn) => fn(theme));
  }

  toggle() {
    this.setTheme(this.theme === 'dark' ? 'light' : 'dark');
  }

  onChange(fn: (theme: Theme) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private apply() {
    if (this.theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }
}

export const themeService = new ThemeService();
