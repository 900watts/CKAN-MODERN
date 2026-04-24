/**
 * Global Download Manager Service
 *
 * Tracks mod install/uninstall operations across page navigations.
 * Operations persist even when the user switches pages because this
 * service lives as a singleton outside of React component lifecycle.
 */

import ckanIpc from './ipc';
import { registryService } from './registry';

export type OperationType = 'install' | 'uninstall' | 'update';
export type OperationStatus = 'queued' | 'in-progress' | 'completed' | 'failed';

export interface DownloadOperation {
  id: string;
  identifier: string;
  name: string;
  type: OperationType;
  status: OperationStatus;
  error?: string;
  startedAt: number;
  completedAt?: number;
}

type Listener = () => void;

class DownloadManager {
  private operations: Map<string, DownloadOperation> = new Map();
  private listeners: Set<Listener> = new Set();
  private ipcListenersAttached = false;

  // Cached snapshots for useSyncExternalStore compatibility.
  // Must return the same reference unless data actually changed.
  private _snapshotAll: DownloadOperation[] = [];
  private _snapshotActiveCount: number = 0;
  private _snapshotVersion = 0;
  private _lastSnapshotVersion = -1;

  private rebuildSnapshots() {
    this._snapshotVersion++;
  }

  private ensureSnapshots() {
    if (this._lastSnapshotVersion === this._snapshotVersion) return;
    this._lastSnapshotVersion = this._snapshotVersion;
    this._snapshotAll = Array.from(this.operations.values()).sort((a, b) => b.startedAt - a.startedAt);
    this._snapshotActiveCount = this._snapshotAll.filter(op => op.status === 'queued' || op.status === 'in-progress').length;
  }

  /** Subscribe to state changes. Returns unsubscribe function. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private notify() {
    this.rebuildSnapshots();
    for (const fn of this.listeners) fn();
  }

  /** Attach IPC push-event listeners (idempotent). */
  attachIpcListeners() {
    if (this.ipcListenersAttached) return;
    this.ipcListenersAttached = true;

    ckanIpc.on('install:complete', (data: any) => {
      const id = data?.identifier;
      if (!id) return;
      registryService.install(id);
      const op = this.operations.get(id);
      if (op) {
        op.status = 'completed';
        op.completedAt = Date.now();
        this.notify();
      }
    });

    ckanIpc.on('install:error', (data: any) => {
      const id = data?.identifier;
      if (!id) return;
      const op = this.operations.get(id);
      if (op) {
        op.status = 'failed';
        op.error = data?.error || 'Unknown error';
        op.completedAt = Date.now();
        this.notify();
      }
    });

    ckanIpc.on('uninstall:complete', (data: any) => {
      const id = data?.identifier;
      if (!id) return;
      registryService.uninstall(id);
      const op = this.operations.get(id);
      if (op) {
        op.status = 'completed';
        op.completedAt = Date.now();
        this.notify();
      }
    });

    ckanIpc.on('uninstall:error', (data: any) => {
      const id = data?.identifier;
      if (!id) return;
      const op = this.operations.get(id);
      if (op) {
        op.status = 'failed';
        op.error = data?.error || 'Unknown error';
        op.completedAt = Date.now();
        this.notify();
      }
    });
  }

  /** Check if a mod currently has an active operation. */
  isActive(identifier: string): boolean {
    const op = this.operations.get(identifier);
    return !!op && (op.status === 'queued' || op.status === 'in-progress');
  }

  /** Get all operations (newest first). Stable reference for useSyncExternalStore. */
  getAll(): DownloadOperation[] {
    this.ensureSnapshots();
    return this._snapshotAll;
  }

  /** Get active (in-progress/queued) operations. */
  getActive(): DownloadOperation[] {
    return this.getAll().filter(op => op.status === 'queued' || op.status === 'in-progress');
  }

  /** Get count of active operations. Stable value for useSyncExternalStore. */
  getActiveCount(): number {
    this.ensureSnapshots();
    return this._snapshotActiveCount;
  }

  /** Clear completed/failed operations from the list. */
  clearCompleted() {
    for (const [id, op] of this.operations) {
      if (op.status === 'completed' || op.status === 'failed') {
        this.operations.delete(id);
      }
    }
    this.notify();
  }

  /**
   * Start an install or uninstall operation.
   * The operation runs in the background and survives page navigation.
   */
  async startOperation(identifier: string, name: string, type: OperationType): Promise<void> {
    // Don't double-queue
    if (this.isActive(identifier)) return;

    const op: DownloadOperation = {
      id: crypto.randomUUID(),
      identifier,
      name,
      type,
      status: 'in-progress',
      startedAt: Date.now(),
    };
    this.operations.set(identifier, op);
    this.notify();

    const isConnected = ckanIpc.isConnected();

    if (isConnected) {
      try {
        const channel = type === 'uninstall' ? 'mod:uninstall' : 'mod:install';
        const result = await ckanIpc.call<any, any>(channel, { identifier });

        if (type === 'uninstall') {
          if (result?.status === 'removed') {
            registryService.uninstall(identifier);
            op.status = 'completed';
          } else if (result?.status === 'error') {
            op.status = 'failed';
            op.error = result.error || 'Uninstall failed';
          } else {
            op.status = 'failed';
            op.error = `Unexpected status: ${result?.status ?? 'none'}`;
          }
        } else {
          if (result?.status === 'installed') {
            registryService.install(identifier);
            op.status = 'completed';
          } else if (result?.status === 'error') {
            op.status = 'failed';
            op.error = result.error || 'Install failed';
          } else {
            op.status = 'failed';
            op.error = `Unexpected status: ${result?.status ?? 'none'}`;
          }
        }
      } catch (err) {
        op.status = 'failed';
        op.error = err instanceof Error ? err.message : 'Unknown error';
      }
    } else {
      // Dev mode fallback
      if (type === 'uninstall') {
        registryService.uninstall(identifier);
      } else {
        registryService.install(identifier);
      }
      op.status = 'completed';
    }

    op.completedAt = Date.now();
    this.notify();
  }
}

export const downloadManager = new DownloadManager();

// Attach IPC listeners at module load time
downloadManager.attachIpcListeners();

export default downloadManager;
