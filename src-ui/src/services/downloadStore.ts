/**
 * Persistent download/operation tracker — survives tab switches.
 * Listens to IPC push events and maintains operation history.
 */

import ckanIpc from './ipc';

export type OpStatus = 'active' | 'completed' | 'failed';
export type OpType = 'install' | 'uninstall';

export interface Operation {
  id: string;
  identifier: string;
  name: string;
  type: OpType;
  status: OpStatus;
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

let _ops: Operation[] = [];
const _listeners = new Set<() => void>();
let _initialized = false;

function notify() {
  _listeners.forEach((fn) => fn());
}

function upsert(id: string, patch: Partial<Operation>) {
  const idx = _ops.findIndex((o) => o.id === id);
  if (idx >= 0) {
    _ops = _ops.map((o, i) => (i === idx ? { ...o, ...patch } : o));
  } else {
    _ops = [{ id, identifier: '', name: '', type: 'install', status: 'active', startedAt: Date.now(), ...patch } as Operation, ..._ops];
  }
  notify();
}

function init() {
  if (_initialized) return;
  _initialized = true;

  ckanIpc.on('install:start', (d: any) => {
    upsert(`install-${d?.identifier}-${Date.now()}`, {
      identifier: d?.identifier ?? '',
      name: d?.name ?? d?.identifier ?? '',
      type: 'install',
      status: 'active',
      startedAt: Date.now(),
    });
  });

  ckanIpc.on('install:complete', (d: any) => {
    const active = _ops.find((o) => o.identifier === d?.identifier && o.status === 'active' && o.type === 'install');
    if (active) {
      upsert(active.id, { status: 'completed', finishedAt: Date.now() });
    } else {
      upsert(`install-${d?.identifier}-${Date.now()}`, {
        identifier: d?.identifier ?? '',
        name: d?.name ?? d?.identifier ?? '',
        type: 'install',
        status: 'completed',
        startedAt: Date.now(),
        finishedAt: Date.now(),
      });
    }
  });

  ckanIpc.on('install:error', (d: any) => {
    const active = _ops.find((o) => o.identifier === d?.identifier && o.status === 'active' && o.type === 'install');
    if (active) {
      upsert(active.id, { status: 'failed', error: d?.error ?? 'Unknown error', finishedAt: Date.now() });
    } else {
      upsert(`install-${d?.identifier}-${Date.now()}`, {
        identifier: d?.identifier ?? '',
        name: d?.name ?? d?.identifier ?? '',
        type: 'install',
        status: 'failed',
        error: d?.error ?? 'Unknown error',
        startedAt: Date.now(),
        finishedAt: Date.now(),
      });
    }
  });

  ckanIpc.on('uninstall:start', (d: any) => {
    upsert(`uninstall-${d?.identifier}-${Date.now()}`, {
      identifier: d?.identifier ?? '',
      name: d?.name ?? d?.identifier ?? '',
      type: 'uninstall',
      status: 'active',
      startedAt: Date.now(),
    });
  });

  ckanIpc.on('uninstall:complete', (d: any) => {
    const active = _ops.find((o) => o.identifier === d?.identifier && o.status === 'active' && o.type === 'uninstall');
    if (active) {
      upsert(active.id, { status: 'completed', finishedAt: Date.now() });
    } else {
      upsert(`uninstall-${d?.identifier}-${Date.now()}`, {
        identifier: d?.identifier ?? '',
        name: d?.name ?? d?.identifier ?? '',
        type: 'uninstall',
        status: 'completed',
        startedAt: Date.now(),
        finishedAt: Date.now(),
      });
    }
  });

  ckanIpc.on('uninstall:error', (d: any) => {
    const active = _ops.find((o) => o.identifier === d?.identifier && o.status === 'active' && o.type === 'uninstall');
    if (active) {
      upsert(active.id, { status: 'failed', error: d?.error ?? 'Unknown error', finishedAt: Date.now() });
    } else {
      upsert(`uninstall-${d?.identifier}-${Date.now()}`, {
        identifier: d?.identifier ?? '',
        name: d?.name ?? d?.identifier ?? '',
        type: 'uninstall',
        status: 'failed',
        error: d?.error ?? 'Unknown error',
        startedAt: Date.now(),
        finishedAt: Date.now(),
      });
    }
  });
}

// FIX: Use arrow functions to avoid 'this' binding issues with useSyncExternalStore
export const downloadStore = {
  init,
  getAll: (): Operation[] => _ops,
  getActive: (): Operation[] => _ops.filter((o) => o.status === 'active'),
  getCompleted: (): Operation[] => _ops.filter((o) => o.status === 'completed'),
  getFailed: (): Operation[] => _ops.filter((o) => o.status === 'failed'),
  clearHistory: () => {
    _ops = _ops.filter((o) => o.status === 'active');
    notify();
  },
  retry: (op: Operation) => {
    if (op.type === 'install') {
      ckanIpc.call('mod:install', { identifier: op.identifier });
    } else {
      ckanIpc.call('mod:uninstall', { identifier: op.identifier });
    }
  },
  // FIX: Arrow function so 'this' is not needed — useSyncExternalStore passes subscribe as a bare function
  subscribe: (fn: () => void): (() => void) => {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
  },
};
