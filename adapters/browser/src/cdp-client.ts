/**
 * CDP Client — hybrid Playwright + raw CDP browser access.
 *
 * Uses Playwright for lifecycle management (launch, connect, contexts)
 * and CdpChannel for the hot path (evaluate, input, network).
 *
 * Two connection modes:
 * 1. Playwright-managed: launch/connect browser, extract CDP session
 * 2. Direct CDP: connect via raw WebSocket (no Playwright dependency)
 *
 * License: MIT
 */

import { chromium, firefox, webkit } from "playwright";
import type {
  Browser,
  BrowserContext,
  Page,
  BrowserType,
} from "playwright";
import { CdpChannel } from "./cdp-channel.js";

export interface CdpClientConfig {
  browser: "chromium" | "firefox" | "webkit";
  /** WebSocket endpoint to connect via Playwright's connectOverCDP. */
  wsEndpoint?: string;
  /** Raw CDP WebSocket URL — bypasses Playwright entirely. */
  cdpUrl?: string;
  headless?: boolean;
  viewport?: { width: number; height: number };
}

export class CdpClient {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private _page: Page | null = null;
  private _cdp: CdpChannel;
  private config: CdpClientConfig;
  private _directCdp = false;

  constructor(config: CdpClientConfig) {
    this.config = config;
    this._cdp = new CdpChannel();
  }

  /**
   * The Playwright Page — available when using Playwright-managed connection.
   * Throws in direct CDP mode; use `cdp` instead.
   */
  get page(): Page {
    if (!this._page) throw new Error("CdpClient not connected (or in direct CDP mode — use cdp channel)");
    return this._page;
  }

  /** The raw CDP channel — available in ALL connection modes. */
  get cdp(): CdpChannel {
    return this._cdp;
  }

  /** Whether the browser adapter has a Playwright Page (for backwards compat). */
  get hasPage(): boolean {
    return this._page !== null && !this._page.isClosed();
  }

  get isConnected(): boolean {
    if (this._directCdp) return this._cdp.connected;
    return this._page !== null && !this._page.isClosed();
  }

  /** Whether we're in direct CDP mode (no Playwright). */
  get isDirectCdp(): boolean {
    return this._directCdp;
  }

  /** Connect to an existing browser or launch a new one. */
  async connect(): Promise<void> {
    // Mode 1: Direct CDP — no Playwright at all
    if (this.config.cdpUrl) {
      await this._cdp.connectViaWebSocket(this.config.cdpUrl);
      await this._cdp.enableDomain("Page");
      await this._cdp.enableDomain("Runtime");
      this._directCdp = true;
      return;
    }

    // Mode 2: Playwright-managed lifecycle + CDP channel for hot path
    const browserType = this.getBrowserType();

    if (this.config.wsEndpoint) {
      this.browser = await browserType.connectOverCDP(
        this.config.wsEndpoint,
      );
      const contexts = this.browser.contexts();
      this.context = contexts[0] ?? (await this.browser.newContext());
      const pages = this.context.pages();
      this._page = pages[0] ?? (await this.context.newPage());
    } else {
      this.browser = await browserType.launch({
        headless: this.config.headless ?? true,
      });
      this.context = await this.browser.newContext({
        viewport: this.config.viewport ?? { width: 1280, height: 800 },
      });
      this._page = await this.context.newPage();
    }

    // Extract CDP session from Playwright (Chromium only)
    if (this.config.browser === "chromium" && this._page) {
      const session = await this._page.context().newCDPSession(this._page);
      this._cdp.connectViaSession(session);
    }
  }

  /** Disconnect and close browser. */
  async disconnect(): Promise<void> {
    await this._cdp.disconnect();

    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
    this.context = null;
    this._page = null;
    this._directCdp = false;
  }

  /**
   * Evaluate JavaScript in the page context.
   * Uses CDP Runtime.evaluate when available (Chromium), falls back to Playwright.
   */
  async evaluate<T>(expression: string): Promise<T> {
    if (this._cdp.connected) {
      return this._cdp.evaluate<T>(expression);
    }
    return this.page.evaluate(expression) as Promise<T>;
  }

  /** Evaluate a function in the page context (Playwright only). */
  async evaluateHandle<T>(
    fn: (...args: unknown[]) => T,
    ...args: unknown[]
  ): Promise<T> {
    return this.page.evaluate(fn, ...args) as Promise<T>;
  }

  /** Get current page title. */
  async getPageTitle(): Promise<string> {
    if (this._directCdp) {
      return this._cdp.evaluate<string>("document.title");
    }
    return this.page.title();
  }

  /** Get current page URL. */
  getPageUrl(): string {
    if (this._directCdp) {
      // Synchronous access not possible in direct CDP; return empty
      // Callers should use getPageUrlAsync() instead
      return "";
    }
    return this.page.url();
  }

  /** Async page URL — works in all modes. */
  async getPageUrlAsync(): Promise<string> {
    if (this._directCdp) {
      return this._cdp.evaluate<string>("location.href");
    }
    return this.page.url();
  }

  /** Navigate to a URL. */
  async navigate(url: string): Promise<void> {
    if (this._directCdp) {
      await this._cdp.navigate(url);
      // Wait for load event
      await new Promise<void>((resolve) => {
        const handler = () => {
          this._cdp.off("Page.loadEventFired", handler);
          resolve();
        };
        this._cdp.on("Page.loadEventFired", handler);
        setTimeout(() => {
          this._cdp.off("Page.loadEventFired", handler);
          resolve();
        }, 30_000);
      });
      return;
    }
    await this.page.goto(url, { waitUntil: "domcontentloaded" });
  }

  /** Take a screenshot as a Buffer. */
  async screenshot(): Promise<Buffer> {
    if (this._cdp.connected) {
      const base64 = await this._cdp.screenshot("png");
      return Buffer.from(base64, "base64");
    }
    return this.page.screenshot({ type: "png" }) as Promise<Buffer>;
  }

  /** Get all iframe pages for cross-origin extraction. */
  async getIframePages(): Promise<Array<{ page: Page; origin: string }>> {
    if (this._directCdp) return []; // Cross-origin iframes need Playwright's frame API
    const frames = this.page.frames();
    const results: Array<{ page: Page; origin: string }> = [];
    for (const frame of frames) {
      if (frame === this.page.mainFrame()) continue;
      try {
        const url = frame.url();
        if (url && url !== "about:blank") {
          results.push({
            page: this._page!,
            origin: new URL(url).origin,
          });
        }
      } catch {
        // Skip inaccessible frames
      }
    }
    return results;
  }

  private getBrowserType(): BrowserType {
    switch (this.config.browser) {
      case "chromium":
        return chromium;
      case "firefox":
        return firefox;
      case "webkit":
        return webkit;
      default:
        return chromium;
    }
  }
}
