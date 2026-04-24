import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download, CheckCircle, AlertCircle, Loader2, Trash2,
  ArrowDownToLine, ArrowUpFromLine, RefreshCw
} from 'lucide-react';
import ckanIpc from '../services/ipc';
import styles from './DownloadsPage.module.css';

type OpStatus = 'active' | 'completed' | 'failed';

interface Operation {
  id: string;
  identifier: string;
  name: string;
  type: 'install' | 'uninstall';
  status: OpStatus;
  error?: string;
  startedAt: number;
  completedAt?: number;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDuration(start: number, end?: number): string {
  const ms = (end || Date.now()) - start;
  if (ms < 1000) return '<1s';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default function DownloadsPage() {
  const [operations, setOperations] = useState<Map<string, Operation>>(new Map());

  const updateOp = useCallback((identifier: string, updates: Partial<Operation>) => {
    setOperations(prev => {
      const next = new Map(prev);
      const existing = next.get(identifier);
      if (existing) {
        next.set(identifier, { ...existing, ...updates });
      }
      return next;
    });
  }, []);

  const addOp = useCallback((identifier: string, name: string, type: 'install' | 'uninstall') => {
    setOperations(prev => {
      const next = new Map(prev);
      next.set(identifier, {
        id: identifier,
        identifier,
        name: name || identifier,
        type,
        status: 'active',
        startedAt: Date.now(),
      });
      return next;
    });
  }, []);

  useEffect(() => {
    const unsubs = [
      ckanIpc.on('install:start', (data: any) => {
        if (data?.identifier) addOp(data.identifier, data.name, 'install');
      }),
      ckanIpc.on('install:complete', (data: any) => {
        if (data?.identifier) updateOp(data.identifier, { status: 'completed', completedAt: Date.now() });
      }),
      ckanIpc.on('install:error', (data: any) => {
        if (data?.identifier) updateOp(data.identifier, { status: 'failed', error: data.error || 'Unknown error', completedAt: Date.now() });
      }),
      ckanIpc.on('uninstall:start', (data: any) => {
        if (data?.identifier) addOp(data.identifier, data.name || data.identifier, 'uninstall');
      }),
      ckanIpc.on('uninstall:complete', (data: any) => {
        if (data?.identifier) updateOp(data.identifier, { status: 'completed', completedAt: Date.now() });
      }),
      ckanIpc.on('uninstall:error', (data: any) => {
        if (data?.identifier) updateOp(data.identifier, { status: 'failed', error: data.error || 'Unknown error', completedAt: Date.now() });
      }),
    ];
    return () => unsubs.forEach(fn => fn());
  }, [addOp, updateOp]);

  const allOps = Array.from(operations.values()).sort((a, b) => b.startedAt - a.startedAt);
  const active = allOps.filter(op => op.status === 'active');
  const completed = allOps.filter(op => op.status === 'completed');
  const failed = allOps.filter(op => op.status === 'failed');
  const hasFinished = completed.length > 0 || failed.length > 0;

  const clearHistory = () => {
    setOperations(prev => {
      const next = new Map(prev);
      for (const [id, op] of next) {
        if (op.status !== 'active') next.delete(id);
      }
      return next;
    });
  };

  const retry = (op: Operation) => {
    const channel = op.type === 'uninstall' ? 'mod:uninstall' : 'mod:install';
    addOp(op.identifier, op.name, op.type);
    ckanIpc.call(channel, { identifier: op.identifier });
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Downloads</h1>
        {hasFinished && (
          <button className={styles.clearBtn} onClick={clearHistory}>
            <Trash2 size={14} />
            Clear History
          </button>
        )}
      </div>
      <div className={styles.content}>
        {allOps.length === 0 ? (
          <div className={styles.empty}>
            <Download size={48} className={styles.emptyIcon} />
            <h2>No downloads yet</h2>
            <p>Install or remove mods to see activity here</p>
          </div>
        ) : (
          <div className={styles.sections}>
            {active.length > 0 && (
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>
                  <Loader2 size={14} className={styles.spin} />
                  Active ({active.length})
                </h2>
                <div className={styles.opList}>
                  <AnimatePresence>
                    {active.map(op => (
                      <motion.div key={op.id} className={`${styles.opCard} ${styles.opActive}`}
                        initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 20 }}>
                        <div className={styles.opIcon}><Loader2 size={16} className={styles.spin} /></div>
                        <div className={styles.opInfo}>
                          <div className={styles.opName}>
                            {op.type === 'uninstall' ? <ArrowUpFromLine size={14} /> : <ArrowDownToLine size={14} />}
                            {op.name}
                          </div>
                          <div className={styles.opMeta}>
                            <span className={styles.opType}>{op.type}</span>
                            <span>Started {formatTime(op.startedAt)}</span>
                            <span>{formatDuration(op.startedAt)}</span>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            )}

            {completed.length > 0 && (
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>
                  <CheckCircle size={14} />
                  Completed ({completed.length})
                </h2>
                <div className={styles.opList}>
                  {completed.map(op => (
                    <div key={op.id} className={`${styles.opCard} ${styles.opCompleted}`}>
                      <div className={styles.opIcon}><CheckCircle size={16} /></div>
                      <div className={styles.opInfo}>
                        <div className={styles.opName}>
                          {op.type === 'uninstall' ? <ArrowUpFromLine size={14} /> : <ArrowDownToLine size={14} />}
                          {op.name}
                        </div>
                        <div className={styles.opMeta}>
                          <span className={styles.opType}>{op.type}</span>
                          <span>{formatDuration(op.startedAt, op.completedAt)}</span>
                          <span>Finished {formatTime(op.completedAt!)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {failed.length > 0 && (
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>
                  <AlertCircle size={14} />
                  Failed ({failed.length})
                </h2>
                <div className={styles.opList}>
                  {failed.map(op => (
                    <div key={op.id} className={`${styles.opCard} ${styles.opFailed}`}>
                      <div className={styles.opIcon}><AlertCircle size={16} /></div>
                      <div className={styles.opInfo}>
                        <div className={styles.opName}>
                          {op.type === 'uninstall' ? <ArrowUpFromLine size={14} /> : <ArrowDownToLine size={14} />}
                          {op.name}
                        </div>
                        <div className={styles.opMeta}>
                          <span className={styles.opType}>{op.type}</span>
                          <span>{formatTime(op.startedAt)}</span>
                        </div>
                        {op.error && <div className={styles.opError}>{op.error}</div>}
                      </div>
                      <button className={styles.retryBtn} onClick={() => retry(op)} title="Retry">
                        <RefreshCw size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
