/**
 * Browser Adapter — DOM-based context provider for web applications.
 *
 * Hybrid architecture (inspired by browser-use's CDP migration):
 * - Playwright for lifecycle management (launch, connect, cleanup)
 * - Raw CDP for the hot path (evaluate, network, screenshots)
 * - Playwright Locators as fallback for complex interactions
 * - Multi-watchdog system (popup, download, security, storage)
 *
 * Supports direct CDP mode (no Playwright at all) via cdpUrl config.
 *
 * Key advantages over browser-use:
 * - Shadow DOM traversal (they fail at shadow boundaries)
 * - Incremental updates via MutationObserver (~50ms vs their 5-30s)
 * - Network event capture via CDP Network domain
 * - Prompt injection sanitization (they inject raw DOM into LLM)
 * - Optional multi-browser support via Playwright (they're Chromium-only)
 * - 4 specialized watchdogs (popup, download, security, storage)
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
import { PopupWatchdog, type PopupWatchdogConfig, type PopupEvent } from "./popup-watchdog.js";
import { DownloadWatchdog, type DownloadWatchdogConfig, type DownloadEvent } from "./download-watchdog.js";
import { SecurityWatchdog, type SecurityWatchdogConfig, type SecurityEvent } from "./security-watchdog.js";
import { StorageWatchdog, type StorageWatchdogConfig, type StorageState } from "./storage-watchdog.js";

export interface BrowserAdapterConfig {
  /** Browser engine to use. */
  browser: "chromium" | "firefox" | "webkit";
  /** Whether to use CDP (Chrome DevTools Protocol). */
  useCdp: boolean;
  /** WebSocket endpoint to connect via Playwright's connectOverCDP. */
  wsEndpoint?: string;
  /** Raw CDP WebSocket URL — bypasses Playwright entirely. */
  cdpUrl?: string;
  /** Launch in headless mode (default: true). */
  headless?: boolean;
  /** Viewport dimensions. */
  viewport?: { width: number; height: number };
  /** Enable prompt injection sanitization (default: true). */
  sanitize?: boolean;
  /** Enable MutationObserver-based incremental updates (default: true). */
  incrementalUpdates?: boolean;

  // --- Watchdog configs ---
  /** Popup/dialog handling config. */
  popups?: PopupWatchdogConfig;
  /** Download detection config. */
  downloads?: DownloadWatchdogConfig;
  /** Security/domain restriction config. */
  security?: SecurityWatchdogConfig;
  /** Storage state persistence config. */
  storage?: StorageWatchdogConfig;
}

export class BrowserAdapter {
  private client: CdpClient;
  private mutationTracker: MutationTracker;
  private actionHandler: ActionHandler | null = null;
  private networkTap: NetworkTap;
  private popupWatchdog: PopupWatchdog;
  private downloadWatchdog: DownloadWatchdog;
  private securityWatchdog: SecurityWatchdog;
  private storageWatchdog: StorageWatchdog;
  private config: BrowserAdapterConfig;

  constructor(config: BrowserAdapterConfig) {
    this.config = config;
    this.client = new CdpClient({
      browser: config.browser,
      wsEndpoint: config.wsEndpoint,
      cdpUrl: config.cdpUrl,
      headless: config.headless,
      viewport: config.viewport,
    });
    this.mutationTracker = new MutationTracker({
      sanitize: config.sanitize ?? true,
    });
    this.networkTap = new NetworkTap();
    this.popupWatchdog = new PopupWatchdog(config.popups);
    this.downloadWatchdog = new DownloadWatchdog(config.downloads);
    this.securityWatchdog = new SecurityWatchdog(config.security);
    this.storageWatchdog = new StorageWatchdog(config.storage);
  }

  /** Connect to the browser and attach all watchdogs. */
  async connect(): Promise<void> {
    await this.client.connect();

    // Set up action handler (Playwright mode only — needs Page)
    if (this.client.hasPage) {
      this.actionHandler = new ActionHandler(this.client.page);
    }

    // Attach all watchdogs — prefer CDP, fall back to Playwright
    if (this.client.cdp.connected) {
      await this.networkTap.attachCdp(this.client.cdp);
      await this.popupWatchdog.attachCdp(this.client.cdp);
      await this.downloadWatchdog.attachCdp(this.client.cdp);
      await this.securityWatchdog.attachCdp(this.client.cdp);
      // Auto-restore storage state if configured
      await this.storageWatchdog.autoRestore(this.client.cdp);
    } else if (this.client.hasPage) {
      this.networkTap.attach(this.client.page);
      this.popupWatchdog.attach(this.client.page);
      this.downloadWatchdog.attach(this.client.page);
      this.securityWatchdog.attach(this.client.page);
    }
  }

  /** Disconnect and clean up. Save storage state if configured. */
  async disconnect(): Promise<void> {
    // Save storage state before disconnecting
    if (this.client.cdp.connected) {
      try {
        await this.storageWatchdog.captureFromCdp(this.client.cdp);
      } catch {
        // Best-effort — don't block disconnect
      }
    }

    this.mutationTracker.reset();
    this.networkTap.clear();
    this.popupWatchdog.clear();
    this.downloadWatchdog.clear();
    this.securityWatchdog.clear();
    this.actionHandler = null;
    await this.client.disconnect();
  }

  /** Whether the adapter is connected. */
  get isConnected(): boolean {
    return this.client.isConnected;
  }

  /** Whether we're in direct CDP mode (no Playwright). */
  get isDirectCdp(): boolean {
    return this.client.isDirectCdp;
  }

  /**
   * Get DOM elements as ContextElements.
   *
   * Uses CDP Runtime.evaluate for DOM extraction (hot path),
   * with incremental updates via MutationObserver when available.
   */
  async getElements(): Promise<ContextElement[]> {
    if (!this.client.isConnected) return [];

    // Choose evaluator: prefer CDP channel, fall back to Playwright page
    const evaluator = this.client.cdp.connected
      ? this.client.cdp
      : this.client.hasPage
        ? this.client.page
        : null;

    if (!evaluator) return [];

    const currentUrl = await this.client.getPageUrlAsync();

    if (this.config.incrementalUpdates !== false) {
      return this.mutationTracker.getElements(evaluator, currentUrl);
    }

    // No incremental updates — full extraction every time
    const rawElements = await extractDOMAllFrames(
      this.client.hasPage ? this.client.page : evaluator as any,
    );
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

  /**
   * Evaluate JavaScript in the browser context.
   * Uses CDP Runtime.evaluate when available.
   */
  async evaluate<T = unknown>(script: string): Promise<T> {
    return this.client.evaluate<T>(script);
  }

  /** Navigate to a URL (enforces security watchdog). */
  async navigate(url: string): Promise<void> {
    // Security check before navigation
    if (!this.securityWatchdog.validateNavigation(url)) {
      const blocked = this.securityWatchdog.getBlocked();
      const reason = blocked[blocked.length - 1]?.reason ?? "blocked by security policy";
      throw new Error(`Navigation blocked: ${reason}`);
    }

    this.mutationTracker.reset();
    this.networkTap.clear();
    await this.client.navigate(url);
  }

  /**
   * Execute a browser-specific action.
   * Uses Playwright Locators for complex interactions, falls back to CDP.
   */
  async executeAction(
    action: string,
    params: Record<string, unknown>,
  ): Promise<boolean> {
    // Security check for navigate actions
    if (action === "navigate" && params.url) {
      if (!this.securityWatchdog.validateNavigation(params.url as string)) {
        throw new Error(
          `Navigation to ${params.url} blocked by security policy`,
        );
      }
    }

    // Reset mutation tracker on navigation actions
    if (action === "navigate" || action === "reload") {
      this.mutationTracker.reset();
    }

    // Use Playwright action handler if available
    if (this.actionHandler) {
      const result = await this.actionHandler.execute(action, params);
      if (!result.success) {
        throw new Error(`Browser action "${action}" failed: ${result.error}`);
      }
      return true;
    }

    // Direct CDP fallback for basic actions
    if (this.client.cdp.connected) {
      return this.executeCdpAction(action, params);
    }

    throw new Error("BrowserAdapter not connected");
  }

  /** Execute basic actions via raw CDP (when no Playwright). */
  private async executeCdpAction(
    action: string,
    params: Record<string, unknown>,
  ): Promise<boolean> {
    const cdp = this.client.cdp;
    switch (action) {
      case "navigate":
        await cdp.navigate(params.url as string);
        return true;
      case "click":
        if (params.x !== undefined && params.y !== undefined) {
          await cdp.click(params.x as number, params.y as number);
          return true;
        }
        throw new Error("CDP click requires x,y coordinates (no CSS selectors in direct CDP mode)");
      case "type":
        await cdp.insertText(params.text as string ?? params.value as string);
        return true;
      case "screenshot":
        await cdp.screenshot("png");
        return true;
      case "reload":
        await cdp.send("Page.reload");
        return true;
      case "go_back":
        await cdp.evaluate("history.back()");
        return true;
      case "go_forward":
        await cdp.evaluate("history.forward()");
        return true;
      default:
        throw new Error(
          `Action "${action}" requires Playwright (not available in direct CDP mode). ` +
          `Use wsEndpoint instead of cdpUrl for full action support.`
        );
    }
  }

  // --- Watchdog accessors ---

  /** Get buffered network events. */
  getNetworkEvents(): NetworkEvent[] {
    return this.networkTap.getEvents();
  }

  /** Get popup/dialog events (alerts, confirms, prompts that were auto-handled). */
  getPopupEvents(): PopupEvent[] {
    return this.popupWatchdog.getEvents();
  }

  /** Get download events. */
  getDownloadEvents(): DownloadEvent[] {
    return this.downloadWatchdog.getEvents();
  }

  /** Whether any downloads are currently in progress. */
  get hasPendingDownloads(): boolean {
    return this.downloadWatchdog.hasPendingDownloads;
  }

  /** Get security events (blocked/allowed navigations). */
  getSecurityEvents(): SecurityEvent[] {
    return this.securityWatchdog.getEvents();
  }

  /** Manually save storage state (cookies + localStorage). */
  async saveStorageState(): Promise<StorageState | null> {
    if (this.client.cdp.connected) {
      return this.storageWatchdog.captureFromCdp(this.client.cdp);
    }
    return null;
  }

  /** Manually restore storage state. */
  async restoreStorageState(state?: StorageState): Promise<void> {
    if (this.client.cdp.connected) {
      await this.storageWatchdog.restoreToCdp(this.client.cdp, state ?? undefined);
    }
  }

  /** Get the current storage state (cookies + localStorage). */
  get storageState(): StorageState | null {
    return this.storageWatchdog.state;
  }

  // --- Existing methods ---

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
    const evaluator = this.client.cdp.connected
      ? this.client.cdp
      : this.client.hasPage
        ? this.client.page
        : null;
    if (!evaluator) return [];
    return this.mutationTracker.fullExtraction(evaluator);
  }

  /**
   * Dismiss cookie consent banners.
   * Requires Playwright mode (uses Locator API for complex selector matching).
   */
  async dismissCookieConsent(): Promise<boolean> {
    if (!this.actionHandler) return false;
    const result = await this.actionHandler.dismissCookieConsent();
    return result.success;
  }

  /**
   * Wait for the page to stabilize after an action.
   * Also waits for pending downloads to complete.
   */
  async waitForStable(options?: { timeout?: number; idleTime?: number }): Promise<void> {
    const timeout = options?.timeout ?? 5000;
    const idleTime = options?.idleTime ?? 500;

    if (this.client.hasPage) {
      try {
        await this.client.page.waitForLoadState("networkidle", { timeout });
      } catch {
        // Timeout is OK — some pages never reach full network idle
      }
    }

    // Wait for DOM to stop changing
    const evaluator = this.client.cdp.connected ? this.client.cdp : this.client.hasPage ? this.client.page : null;
    if (!evaluator) return;

    const start = Date.now();
    let lastMutationCount = -1;

    while (Date.now() - start < timeout) {
      const mutations = await evaluator.evaluate(
        `(window.__cel_mutations || []).length`,
      ).catch(() => 0) as number;

      if (mutations === lastMutationCount && !this.downloadWatchdog.hasPendingDownloads) {
        break;
      }

      lastMutationCount = mutations;
      await new Promise((r) => setTimeout(r, idleTime));
    }
  }

  /** Access the raw CDP channel for advanced protocol operations. */
  get cdpChannel() {
    return this.client.cdp;
  }
}

// Re-export types for consumers
export type { RawDOMElement } from "./dom-extractor.js";
export type { ActionResult } from "./action-handler.js";
export type { PopupEvent } from "./popup-watchdog.js";
export type { DownloadEvent } from "./download-watchdog.js";
export type { SecurityEvent } from "./security-watchdog.js";
export type { StorageState } from "./storage-watchdog.js";
export { CdpChannel } from "./cdp-channel.js";
export { PopupWatchdog } from "./popup-watchdog.js";
export { DownloadWatchdog } from "./download-watchdog.js";
export { SecurityWatchdog } from "./security-watchdog.js";
export { StorageWatchdog } from "./storage-watchdog.js";
export { sanitizeElements } from "./sanitizer.js";
export { mapElements } from "./element-mapper.js";
export { extractDOM, extractDOMAllFrames } from "./dom-extractor.js";
