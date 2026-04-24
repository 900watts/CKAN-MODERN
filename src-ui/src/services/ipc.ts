/**
 * CKAN IPC Bridge
 *
 * This service handles communication between the React frontend (WebView2)
 * and the .NET 8 backend via JavaScript interop.
 *
 * The frontend calls intoDotNet() to invoke C# methods,
 * and listens to onDotNetEvent() to receive callbacks from C#.
 */

export type IpcChannel =
  | 'mod:search'
  | 'mod:install'
  | 'mod:uninstall'
  | 'mod:list-installed'
  | 'mod:get-details'
  | 'mod:scan-gamedata'
  | 'mod:check-updates'
  | 'game:list-instances'
  | 'game:add-instance'
  | 'game:remove-instance'
  | 'game:set-active'
  | 'ai:chat'
  | 'ai:points-balance'
  | 'auth:login'
  | 'auth:logout'
  | 'auth:get-user'
  | 'dispatch:send-command'
  | 'dispatch:pair'
  | 'dispatch:status'
  | 'app:get-version'
  | 'app:minimize'
  | 'app:maximize'
  | 'app:close'
  | 'app:browse-folder';

export interface IpcRequest<T = unknown> {
  channel: IpcChannel;
  args?: T;
  /** Unique request ID for correlating responses */
  id: string;
}

export interface IpcResponse<T = unknown> {
  id: string;
  success: boolean;
  data?: T;
  error?: string;
}

type IpcHandler = (response: IpcResponse) => void;

class CkanIpc {
  private handlers = new Map<string, IpcHandler>();
  private eventListeners = new Map<string, Set<(data: unknown) => void>>();
  private dotNetRef: unknown = null;

  /**
   * Initialize the IPC bridge.
   * Called once when the WebView2 app starts.
   */
  init(dotNetRef: unknown): void {
    this.dotNetRef = dotNetRef;

    // Listen for messages from .NET (WebView2)
    if ((window as any).chrome?.webview) {
      (window as any).chrome.webview.addEventListener('message', (e: MessageEvent) => {
        this.handleIncoming(e.data);
      });
    }

    console.log('[CKAN IPC] Bridge initialized');
  }

  /**
   * Auto-detect WebView2 environment and self-initialize.
   * Called at module load time.
   */
  autoInit(): void {
    if ((window as any).chrome?.webview) {
      this.dotNetRef = true;
      (window as any).chrome.webview.addEventListener('message', (e: MessageEvent) => {
        this.handleIncoming(e.data);
      });
      console.log('[CKAN IPC] Auto-detected WebView2 environment');
    }
  }

  /**
   * Handle incoming messages from .NET — either responses or push events.
   */
  private handleIncoming(data: any): void {
    if (!data) return;

    // If it has an 'id', it's a response to a request
    if (data.id && this.handlers.has(data.id)) {
      const handler = this.handlers.get(data.id)!;
      handler(data as IpcResponse);
      return;
    }

    // If it has a 'channel' but no 'id', it's a push event from .NET
    if (data.channel) {
      const listeners = this.eventListeners.get(data.channel);
      if (listeners) {
        for (const cb of listeners) {
          cb(data.data);
        }
      }
    }
  }

  /**
   * Check if the bridge is connected to .NET
   */
  isConnected(): boolean {
    return this.dotNetRef !== null;
  }

  /**
   * Call a C# method and return a promise with the result.
   */
  async call<T = unknown, R = unknown>(channel: IpcChannel, args?: T): Promise<R> {
    const id = crypto.randomUUID();
    
    return new Promise<R>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.handlers.delete(id);
        reject(new Error(`IPC timeout: ${channel}`));
      }, 30000);

      this.handlers.set(id, (response) => {
        clearTimeout(timeout);
        this.handlers.delete(id);
        if (response.success && response.data !== undefined) {
          resolve(response.data as R);
        } else {
          reject(new Error(response.error || `IPC error: ${channel}`));
        }
      });

      // Send to .NET via the window.chrome.webview (WebView2 API)
      if (this.dotNetRef) {
        (window as any).chrome?.webview?.postMessage({
          id,
          channel,
          args,
        });
      } else {
        // Fallback: simulate a response in dev mode (no .NET)
        setTimeout(() => {
          const handler = this.handlers.get(id);
          if (handler) {
            handler({
              id,
              success: true,
              data: this.getMockData(channel),
            });
          }
        }, 100);
      }
    });
  }

  /**
   * Listen for push events coming FROM .NET (e.g., progress, install status).
   */
  on(channel: string, callback: (data: unknown) => void): () => void {
    if (!this.eventListeners.has(channel)) {
      this.eventListeners.set(channel, new Set());
    }
    this.eventListeners.get(channel)!.add(callback);

    // Return unsubscribe function
    return () => {
      const listeners = this.eventListeners.get(channel);
      if (listeners) {
        listeners.delete(callback);
        if (listeners.size === 0) {
          this.eventListeners.delete(channel);
        }
      }
    };
  }

  /**
   * Dev-mode mock data for channels that don't need real .NET
   */
  private getMockData(channel: IpcChannel): unknown {
    switch (channel) {
      case 'app:get-version':
        return { version: '2.0.0-dev', build: 'modern' };
      case 'mod:list-installed':
        return { mods: [] };
      case 'mod:search':
        return { mods: [], query: '', total: 0 };
      case 'ai:points-balance':
        return { balance: 100, tier: 'free' };
      case 'auth:get-user':
        return null;
      case 'game:list-instances':
        return { instances: [] };
      case 'game:add-instance':
        return { success: true };
      case 'game:remove-instance':
        return { success: true };
      case 'app:browse-folder':
        return { selected: false, path: null };
      case 'mod:scan-gamedata':
        return { mods: [], scanned: true };
      case 'mod:check-updates':
        return { updates: [], count: 0 };
      default:
        return {};
    }
  }
}

export const ckanIpc = new CkanIpc();

// Auto-detect WebView2 and initialize
ckanIpc.autoInit();

export default ckanIpc;
