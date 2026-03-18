/**
 * Browser Adapter — DOM-based context provider for web applications.
 *
 * Uses CDP (Chrome DevTools Protocol) via Playwright to extract DOM elements,
 * convert them to ContextElements with confidence scoring, and provide
 * browser-specific actions.
 *
 * Key advantages over browser-use:
 * - Shadow DOM traversal (they fail at shadow boundaries)
 * - Incremental updates via MutationObserver (~50ms vs their 5-30s)
 * - Network event capture (they have none)
 * - Prompt injection sanitization (they inject raw DOM into LLM)
 * - Multi-browser support via Playwright (they're Chromium-only)
 *
 * License: MIT
 */

import type { ContextElement, NetworkEvent, ScreenContext } from "@cellar/agent";
import { CdpClient, type CdpClientConfig } from "./cdp-client.js";
import { extractDOMAllFrames } from "./dom-extractor.js";
import { mapElements } from "./element-mapper.js";
import { sanitizeElements } from "./sanitizer.js";
import { MutationTracker } from "./mutation-tracker.js";
import { ActionHandler } from "./action-handler.js";
import { NetworkTap } from "./network-tap.js";

export interface BrowserAdapterConfig {
  /** Browser engine to use. */
  browser: "chromium" | "firefox" | "webkit";
  /** Whether to use CDP (Chrome DevTools Protocol). */
  useCdp: boolean;
  /** WebSocket endpoint to connect to an existing browser. */
  wsEndpoint?: string;
  /** Launch in headless mode (default: true). */
  headless?: boolean;
  /** Viewport dimensions. */
  viewport?: { width: number; height: number };
  /** Enable prompt injection sanitization (default: true). */
  sanitize?: boolean;
  /** Enable MutationObserver-based incremental updates (default: true). */
  incrementalUpdates?: boolean;
}

export class BrowserAdapter {
  private client: CdpClient;
  private mutationTracker: MutationTracker;
  private actionHandler: ActionHandler | null = null;
  private networkTap: NetworkTap;
  private config: BrowserAdapterConfig;

  constructor(config: BrowserAdapterConfig) {
    this.config = config;
    this.client = new CdpClient({
      browser: config.browser,
      wsEndpoint: config.wsEndpoint,
      headless: config.headless,
      viewport: config.viewport,
    });
    this.mutationTracker = new MutationTracker({
      sanitize: config.sanitize ?? true,
    });
    this.networkTap = new NetworkTap();
  }

  /** Connect to the browser. */
  async connect(): Promise<void> {
    await this.client.connect();
    this.actionHandler = new ActionHandler(this.client.page);
    this.networkTap.attach(this.client.page);
  }

  /** Disconnect and clean up. */
  async disconnect(): Promise<void> {
    this.mutationTracker.reset();
    this.networkTap.clear();
    this.actionHandler = null;
    await this.client.disconnect();
  }

  /** Whether the adapter is connected. */
  get isConnected(): boolean {
    return this.client.isConnected;
  }

  /**
   * Get DOM elements as ContextElements.
   *
   * Uses incremental updates (MutationObserver) when available,
   * falls back to full extraction on first call or after navigation.
   */
  async getElements(): Promise<ContextElement[]> {
    if (!this.client.isConnected) return [];

    if (this.config.incrementalUpdates !== false) {
      return this.mutationTracker.getElements(this.client.page);
    }

    // No incremental updates — full extraction every time
    const rawElements = await extractDOMAllFrames(this.client.page);
    let elements = mapElements(rawElements);

    if (this.config.sanitize !== false) {
      elements = sanitizeElements(elements);
    }

    return elements;
  }

  /**
   * Get a full ScreenContext for the current page.
   * Convenience method that assembles elements + network events.
   */
  async getContext(): Promise<ScreenContext> {
    const [elements, title] = await Promise.all([
      this.getElements(),
      this.client.getPageTitle(),
    ]);

    return {
      app: "Browser",
      window: title,
      elements,
      network_events: this.networkTap.getEvents(),
      timestamp_ms: Date.now(),
    };
  }

  /** Execute JavaScript in the browser context. */
  async evaluate<T = unknown>(script: string): Promise<T> {
    return this.client.evaluate<T>(script);
  }

  /** Navigate to a URL. */
  async navigate(url: string): Promise<void> {
    this.mutationTracker.reset();
    this.networkTap.clear();
    await this.client.navigate(url);
    // Re-attach network tap (page listeners survive navigation)
  }

  /**
   * Execute a browser-specific action.
   * Maps to the `custom` action type in WorkflowAction.
   */
  async executeAction(
    action: string,
    params: Record<string, unknown>,
  ): Promise<boolean> {
    if (!this.actionHandler) {
      throw new Error("BrowserAdapter not connected");
    }

    // Reset mutation tracker on navigation actions
    if (action === "navigate" || action === "reload") {
      this.mutationTracker.reset();
    }

    const result = await this.actionHandler.execute(action, params);
    if (!result.success) {
      throw new Error(
        `Browser action "${action}" failed: ${result.error}`,
      );
    }
    return true;
  }

  /** Get buffered network events. */
  getNetworkEvents(): NetworkEvent[] {
    return this.networkTap.getEvents();
  }

  /** Get the current page title. */
  async getPageTitle(): Promise<string> {
    return this.client.getPageTitle();
  }

  /** Get the current page URL. */
  getPageUrl(): string {
    return this.client.getPageUrl();
  }

  /** Take a screenshot as a PNG Buffer. */
  async screenshot(): Promise<Buffer> {
    return this.client.screenshot();
  }

  /** Force a full DOM re-extraction (bypasses incremental cache). */
  async forceRefresh(): Promise<ContextElement[]> {
    return this.mutationTracker.fullExtraction(this.client.page);
  }
}

// Re-export types for consumers
export type { RawDOMElement } from "./dom-extractor.js";
export type { ActionResult } from "./action-handler.js";
export { sanitizeElements } from "./sanitizer.js";
export { mapElements } from "./element-mapper.js";
export { extractDOM, extractDOMAllFrames } from "./dom-extractor.js";
