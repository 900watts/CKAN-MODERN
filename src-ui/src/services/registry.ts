/**
 * Registry data service — fetches and manages the real CKAN mod registry.
 */

export interface ModAuthor {
  name: string;
}

export interface ModResource {
  homepage?: string;
  bugtracker?: string;
  repository?: string;
  spacedock?: string;
  curse?: string;
  manual?: string;
  discussions?: string;
  ci?: string;
  store?: string;
  steamstore?: string;
}

export interface ModDependency {
  name: string;
  version?: string;
  min_version?: string;
  max_version?: string;
}

export interface CkanModule {
  identifier: string;
  name: string;
  abstract: string;
  author: string[];
  license: string[];
  tags: string[];
  resources: ModResource;
  version: string;
  download_size: number;
  install_size: number;
  ksp_version: string | null;
  ksp_version_min: string | null;
  ksp_version_max: string | null;
  release_date: string | null;
  depends: ModDependency[];
  recommends: ModDependency[];
  conflicts: ModDependency[];
  description: string;
  download: string | string[] | null;
  download_count: number;
  version_count: number;
  all_versions: string[];
}

export interface Registry {
  generated_at: string;
  module_count: number;
  file_count: number;
  modules: CkanModule[];
}

class RegistryService {
  private registry: Registry | null = null;
  private loading: Promise<Registry> | null = null;
  private installedIds: Set<string> = new Set();

  async load(): Promise<Registry> {
    if (this.registry) return this.registry;
    if (this.loading) return this.loading;

    this.loading = fetch('./registry.json')
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load registry: ${res.status}`);
        return res.json();
      })
      .then((data: Registry) => {
        this.registry = data;
        try {
          const saved = localStorage.getItem('ckan-installed');
          if (saved) this.installedIds = new Set(JSON.parse(saved));
        } catch {}
        return data;
      });

    return this.loading;
  }

  getModules(): CkanModule[] {
    return this.registry?.modules ?? [];
  }

  getModuleCount(): number {
    return this.registry?.module_count ?? 0;
  }

  search(query: string, filters?: SearchFilters): CkanModule[] {
    let results = this.getModules();

    if (query.trim()) {
      const q = query.toLowerCase().trim();
      results = results.filter((m) => {
        return (
          m.name.toLowerCase().includes(q) ||
          m.identifier.toLowerCase().includes(q) ||
          m.abstract.toLowerCase().includes(q) ||
          m.author.some((a) => a.toLowerCase().includes(q)) ||
          m.tags.some((t) => t.toLowerCase().includes(q))
        );
      });
    }

    if (filters?.tag) {
      results = results.filter((m) => m.tags.includes(filters.tag!));
    }

    if (filters?.sortBy) {
      results = [...results].sort((a, b) => {
        switch (filters.sortBy) {
          case 'name': return a.name.localeCompare(b.name);
          case 'downloads': return b.download_count - a.download_count;
          case 'updated': return (b.release_date ?? '').localeCompare(a.release_date ?? '');
          default: return 0;
        }
      });
    }

    return results;
  }

  getInstalledModules(): CkanModule[] {
    return this.getModules().filter((m) => this.installedIds.has(m.identifier));
  }

  isInstalled(identifier: string): boolean {
    return this.installedIds.has(identifier);
  }

  /** Returns a copy of installed IDs for reactive state in components. */
  getInstalledIds(): string[] {
    return [...this.installedIds];
  }

  install(identifier: string): void {
    this.installedIds.add(identifier);
    this.saveInstalled();
  }

  uninstall(identifier: string): void {
    this.installedIds.delete(identifier);
    this.saveInstalled();
  }

  /**
   * FIX: Replaces the entire installed set from an authoritative list (e.g. from the backend).
   * Previously we only ever added to installedIds, so uninstalls done outside the UI
   * (or on previous sessions) would never be reflected.
   */
  setInstalledFromList(identifiers: string[]): void {
    this.installedIds = new Set(identifiers);
    this.saveInstalled();
  }

  getInstalledCount(): number {
    return this.installedIds.size;
  }

  getAllTags(): { tag: string; count: number }[] {
    const tagMap = new Map<string, number>();
    for (const mod of this.getModules()) {
      for (const tag of mod.tags) {
        tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
      }
    }
    return Array.from(tagMap.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }

  getModById(identifier: string): CkanModule | undefined {
    return this.getModules().find((m) => m.identifier === identifier);
  }

  formatSize(bytes: number): string {
    if (!bytes || bytes === 0) return '--';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  formatDownloads(count: number): string {
    if (!count) return '0';
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
    return count.toString();
  }

  private saveInstalled(): void {
    try {
      localStorage.setItem('ckan-installed', JSON.stringify([...this.installedIds]));
    } catch {}
  }
}

export interface SearchFilters {
  tag?: string;
  sortBy?: 'name' | 'downloads' | 'updated';
}

export const registryService = new RegistryService();
export default registryService;
