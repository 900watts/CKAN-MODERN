/**
 * Download Manager — tracks mod installation/download state.
 *
 * In production (WebView2): delegates to .NET via IPC (mod:install).
 * In dev mode (browser): triggers a browser download of the mod zip.
 */

import { ckanIpc } from './ipc';
import type { CkanModule } from './registry';

export type DownloadStatus = 'queued' | 'downloading' | 'installing' | 'done' | 'error';

export interface Download {
  id: string;
  modId: string;
  modName: string;
  status: DownloadStatus;
  progress: number; // 0–100
  error?: string;
  url?: string;
  startedAt: Date;
  completedAt?: Date;
}

type DownloadListener = (downloads: Download[]) => void;

class DownloadManager {
  private downloads = new Map<string, Download>();
  private listeners: DownloadListener[] = [];

  getAll(): Download[] {
    return [...this.downloads.values()].sort(
      (a, b) => b.startedAt.getTime() - a.startedAt.getTime()
    );
  }

  getActive(): Download[] {
    return this.getAll().filter(d => d.status !== 'done' && d.status !== 'error');
  }

  getActiveCount(): number {
    return this.getActive().length;
  }

  find(modId: string): Download | undefined {
    return this.downloads.get(modId);
  }

  onChange(listener: DownloadListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  async install(mod: CkanModule): Promise<void> {
    // Don't start a duplicate download
    const existing = this.downloads.get(mod.identifier);
    if (existing && (existing.status === 'queued' || existing.status === 'downloading' || existing.status === 'installing')) {
      return;
    }

    const dl: Download = {
      id: mod.identifier,
      modId: mod.identifier,
      modName: mod.name,
      status: 'queued',
      progress: 0,
      url: Array.isArray(mod.download) ? mod.download[0] ?? undefined : mod.download ?? undefined,
      startedAt: new Date(),
    };

    this.downloads.set(mod.identifier, dl);
    this.notify();

    if (ckanIpc.isConnected()) {
      await this.installViaIpc(mod, dl);
    } else {
      await this.installDevMode(mod, dl);
    }
  }

  async uninstall(modId: string): Promise<void> {
    try {
      if (ckanIpc.isConnected()) {
        await ckanIpc.call('mod:uninstall', { identifier: modId });
      }
    } catch {
      // Best-effort
    }
    this.downloads.delete(modId);
    this.notify();
  }

  clear(modId: string) {
    this.downloads.delete(modId);
    this.notify();
  }

  private async installViaIpc(mod: CkanModule, dl: Download): Promise<void> {
    try {
      this.update(dl.id, { status: 'downloading', progress: 5 });

      // Listen for progress events emitted by .NET
      const unsub = ckanIpc.on(`mod:progress:${mod.identifier}`, (data: unknown) => {
        const progress = (data as { progress?: number })?.progress ?? 50;
        this.update(dl.id, { progress, status: progress < 80 ? 'downloading' : 'installing' });
      });

      await ckanIpc.call('mod:install', { identifier: mod.identifier });
      unsub();
      this.update(dl.id, { status: 'done', progress: 100, completedAt: new Date() });
    } catch (err) {
      this.update(dl.id, {
        status: 'error',
        error: err instanceof Error ? err.message : 'Installation failed',
      });
    }
  }

  private async installDevMode(mod: CkanModule, dl: Download): Promise<void> {
    const url = Array.isArray(mod.download) ? mod.download[0] : mod.download;

    if (!url) {
      this.update(dl.id, { status: 'error', error: 'No download URL available for this mod' });
      return;
    }

    try {
      // Animate progress to indicate something is happening
      this.update(dl.id, { status: 'downloading', progress: 10 });
      for (let p = 10; p < 80; p += 15) {
        await new Promise(r => setTimeout(r, 120));
        this.update(dl.id, { progress: p });
      }

      // Trigger browser download
      const a = document.createElement('a');
      a.href = url;
      a.download = `${mod.identifier}.zip`;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      await new Promise(r => setTimeout(r, 200));
      this.update(dl.id, { status: 'done', progress: 100, completedAt: new Date() });
    } catch (err) {
      this.update(dl.id, {
        status: 'error',
        error: err instanceof Error ? err.message : 'Download failed',
      });
    }
  }

  private update(id: string, partial: Partial<Download>) {
    const dl = this.downloads.get(id);
    if (!dl) return;
    this.downloads.set(id, { ...dl, ...partial });
    this.notify();
  }

  private notify() {
    const list = this.getAll();
    for (const l of this.listeners) l(list);
  }
}

export const downloadManager = new DownloadManager();
export default downloadManager;
