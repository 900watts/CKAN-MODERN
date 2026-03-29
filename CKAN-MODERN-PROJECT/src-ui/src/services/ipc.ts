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
  | 'game:list-instances'
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
  | 'app:close';

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
  private dotNetRef: unknown = null;

  /**
   * Initialize the IPC bridge.
   * Called once when the WebView2 app starts.
   */
  init(dotNetRef: unknown): void {
    this.dotNetRef = dotNetRef;
    console.log('[CKAN IPC] Bridge initialized');
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
   * Listen for events coming FROM .NET (callbacks, push notifications).
   */
  on(channel: string, callback: (data: unknown) => void): () => void {
    const handler = (response: IpcResponse) => {
      if (response.data) {
        callback(response.data);
      }
    };

    // Store the handler globally for .NET to call
    const key = `listener:${channel}`;
    (window as any)[key] = handler;

    // Return unsubscribe function
    return () => {
      delete (window as any)[key];
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
      case 'ai:points-balance':
        return { balance: 100, tier: 'free' };
      case 'auth:get-user':
        return null;
      case 'game:list-instances':
        return { instances: [] };
      default:
        return {};
    }
  }
}

export const ckanIpc = new CkanIpc();

export default ckanIpc;
