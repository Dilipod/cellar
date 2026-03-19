/**
 * CDP Channel — raw Chrome DevTools Protocol communication.
 *
 * Provides direct CDP access for the hot path (DOM extraction, network
 * monitoring, input events) while coexisting with Playwright for lifecycle
 * management and complex interactions.
 *
 * Two connection modes:
 * 1. Via Playwright CDPSession (when Playwright manages the browser)
 * 2. Via raw WebSocket (for direct CDP connections without Playwright)
 *
 * This follows browser-use's learning: own the protocol layer for
 * performance-critical operations, use the framework for lifecycle.
 *
 * License: MIT
 */

import type { CDPSession } from "playwright";
import WebSocket from "ws";

export interface CdpEvent {
  method: string;
  params: Record<string, unknown>;
}

export type CdpEventHandler = (params: Record<string, unknown>) => void;

/**
 * Unified interface for CDP communication.
 * Abstracts over Playwright CDPSession and raw WebSocket.
 */
export class CdpChannel {
  private session: CDPSession | null = null;
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pendingRequests = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  private eventHandlers = new Map<string, Set<CdpEventHandler>>();
  private _connected = false;

  get connected(): boolean {
    return this._connected;
  }

  /** Connect via an existing Playwright CDPSession. */
  connectViaSession(session: CDPSession): void {
    this.session = session;
    this._connected = true;

    // Forward CDP events from Playwright session to our handlers
    // CDPSession emits events like session.on('Network.requestWillBeSent', handler)
    // We need to proxy any events our handlers care about
  }

  /** Connect via raw WebSocket to a CDP endpoint. */
  async connectViaWebSocket(wsUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(wsUrl);

      this.ws.on("open", () => {
        this._connected = true;
        resolve();
      });

      this.ws.on("message", (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString());

          // Response to a command
          if (msg.id !== undefined) {
            const pending = this.pendingRequests.get(msg.id);
            if (pending) {
              this.pendingRequests.delete(msg.id);
              if (msg.error) {
                pending.reject(
                  new Error(`CDP error: ${msg.error.message} (${msg.error.code})`),
                );
              } else {
                pending.resolve(msg.result);
              }
            }
          }

          // Event notification
          if (msg.method) {
            const handlers = this.eventHandlers.get(msg.method);
            if (handlers) {
              for (const handler of handlers) {
                try {
                  handler(msg.params ?? {});
                } catch (e) {
                  console.warn(`CDP event handler error for ${msg.method}:`, e);
                }
              }
            }
          }
        } catch {
          // Malformed message — ignore
        }
      });

      this.ws.on("close", () => {
        this._connected = false;
        // Reject all pending requests
        for (const [, pending] of this.pendingRequests) {
          pending.reject(new Error("CDP WebSocket closed"));
        }
        this.pendingRequests.clear();
      });

      this.ws.on("error", (err) => {
        if (!this._connected) {
          reject(err);
        }
      });
    });
  }

  /** Reconnect a dropped WebSocket (browser-use learned this matters for remote CDP). */
  async reconnect(wsUrl: string, maxRetries = 3): Promise<void> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await this.connectViaWebSocket(wsUrl);
        // Re-enable any domains that were active
        return;
      } catch (e) {
        lastError = e as Error;
        const delay = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw lastError ?? new Error("CDP reconnect failed");
  }

  /**
   * Send a CDP command and wait for the response.
   * Works with both Playwright CDPSession and raw WebSocket.
   */
  async send<T = unknown>(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    if (this.session) {
      return this.session.send(method as never, params as never) as Promise<T>;
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return new Promise((resolve, reject) => {
        const id = this.nextId++;
        this.pendingRequests.set(id, {
          resolve: resolve as (value: unknown) => void,
          reject,
        });

        const msg = JSON.stringify({ id, method, params: params ?? {} });
        this.ws!.send(msg, (err) => {
          if (err) {
            this.pendingRequests.delete(id);
            reject(err);
          }
        });

        // Timeout after 30s
        setTimeout(() => {
          if (this.pendingRequests.has(id)) {
            this.pendingRequests.delete(id);
            reject(new Error(`CDP command timeout: ${method}`));
          }
        }, 30_000);
      });
    }

    throw new Error("CdpChannel not connected");
  }

  /** Subscribe to CDP events. */
  on(event: string, handler: CdpEventHandler): void {
    let handlers = this.eventHandlers.get(event);
    if (!handlers) {
      handlers = new Set();
      this.eventHandlers.set(event, handlers);
    }
    handlers.add(handler);

    // If using Playwright session, also register on the session
    if (this.session) {
      this.session.on(event as never, handler as never);
    }
  }

  /** Unsubscribe from CDP events. */
  off(event: string, handler: CdpEventHandler): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
    if (this.session) {
      this.session.off(event as never, handler as never);
    }
  }

  // -------------------------------------------------------
  // Convenience methods for common CDP operations
  // -------------------------------------------------------

  /** Evaluate a JavaScript expression in the page context via CDP. */
  async evaluate<T = unknown>(expression: string): Promise<T> {
    const result = await this.send<{
      result: { type: string; value?: unknown; objectId?: string; description?: string };
      exceptionDetails?: { text: string; exception?: { description?: string } };
    }>("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });

    if (result.exceptionDetails) {
      const desc =
        result.exceptionDetails.exception?.description ??
        result.exceptionDetails.text;
      throw new Error(`CDP evaluate error: ${desc}`);
    }

    return result.result.value as T;
  }

  /** Navigate to a URL via CDP. */
  async navigate(url: string): Promise<void> {
    await this.send("Page.navigate", { url });
  }

  /** Take a screenshot via CDP (returns base64 PNG). */
  async screenshot(format: "png" | "jpeg" = "png", quality?: number): Promise<string> {
    const result = await this.send<{ data: string }>("Page.captureScreenshot", {
      format,
      quality,
    });
    return result.data;
  }

  /** Enable a CDP domain (e.g., "Network", "Page", "DOM"). */
  async enableDomain(domain: string): Promise<void> {
    await this.send(`${domain}.enable`);
  }

  /** Disable a CDP domain. */
  async disableDomain(domain: string): Promise<void> {
    await this.send(`${domain}.disable`);
  }

  /** Dispatch a mouse event via CDP Input domain. */
  async dispatchMouseEvent(
    type: "mousePressed" | "mouseReleased" | "mouseMoved",
    x: number,
    y: number,
    button?: "left" | "right" | "middle",
    clickCount?: number,
  ): Promise<void> {
    await this.send("Input.dispatchMouseEvent", {
      type,
      x,
      y,
      button: button ?? "left",
      clickCount: clickCount ?? 1,
    });
  }

  /** Click at coordinates via CDP (press + release). */
  async click(x: number, y: number, button: "left" | "right" = "left"): Promise<void> {
    await this.dispatchMouseEvent("mousePressed", x, y, button, 1);
    await this.dispatchMouseEvent("mouseReleased", x, y, button, 1);
  }

  /** Type text via CDP Input domain. */
  async insertText(text: string): Promise<void> {
    await this.send("Input.insertText", { text });
  }

  /** Press a key via CDP. */
  async dispatchKeyEvent(
    type: "keyDown" | "keyUp" | "char",
    key: string,
  ): Promise<void> {
    await this.send("Input.dispatchKeyEvent", {
      type,
      key,
    });
  }

  /** Disconnect and clean up. */
  async disconnect(): Promise<void> {
    if (this.session) {
      try {
        await this.session.detach();
      } catch {
        // Already detached
      }
      this.session = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this._connected = false;
    this.pendingRequests.clear();
    this.eventHandlers.clear();
  }
}
