/**
 * CDP Client — Playwright wrapper for Chrome DevTools Protocol access.
 *
 * Handles browser lifecycle and exposes CDP session methods
 * for DOM extraction, input, and network monitoring.
 *
 * License: MIT
 */

import { chromium, firefox, webkit } from "playwright";
import type {
  Browser,
  BrowserContext,
  Page,
  CDPSession,
  BrowserType,
} from "playwright";

export interface CdpClientConfig {
  browser: "chromium" | "firefox" | "webkit";
  /** WebSocket endpoint to connect to an existing browser. */
  wsEndpoint?: string;
  headless?: boolean;
  viewport?: { width: number; height: number };
}

export class CdpClient {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private _page: Page | null = null;
  private _cdp: CDPSession | null = null;
  private config: CdpClientConfig;

  constructor(config: CdpClientConfig) {
    this.config = config;
  }

  get page(): Page {
    if (!this._page) throw new Error("CdpClient not connected");
    return this._page;
  }

  get cdp(): CDPSession {
    if (!this._cdp) throw new Error("CDP session not available");
    return this._cdp;
  }

  get isConnected(): boolean {
    return this._page !== null && !this._page.isClosed();
  }

  /** Connect to an existing browser or launch a new one. */
  async connect(): Promise<void> {
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

    // Create CDP session (Chromium only for full CDP; Firefox/WebKit use Playwright's API)
    if (this.config.browser === "chromium") {
      this._cdp = await this._page.context().newCDPSession(this._page);
    }
  }

  /** Disconnect and close browser. */
  async disconnect(): Promise<void> {
    if (this._cdp) {
      await this._cdp.detach().catch(() => {});
      this._cdp = null;
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
    this.context = null;
    this._page = null;
  }

  /** Evaluate JavaScript in the page context. */
  async evaluate<T>(expression: string): Promise<T> {
    return this.page.evaluate(expression) as Promise<T>;
  }

  /** Evaluate a function in the page context. */
  async evaluateHandle<T>(
    fn: (...args: unknown[]) => T,
    ...args: unknown[]
  ): Promise<T> {
    return this.page.evaluate(fn, ...args) as Promise<T>;
  }

  /** Get current page title. */
  async getPageTitle(): Promise<string> {
    return this.page.title();
  }

  /** Get current page URL. */
  getPageUrl(): string {
    return this.page.url();
  }

  /** Navigate to a URL. */
  async navigate(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: "domcontentloaded" });
  }

  /** Take a screenshot as a Buffer. */
  async screenshot(): Promise<Buffer> {
    return this.page.screenshot({ type: "png" }) as Promise<Buffer>;
  }

  /** Get all iframe pages for cross-origin extraction. */
  async getIframePages(): Promise<Array<{ page: Page; origin: string }>> {
    const frames = this.page.frames();
    const results: Array<{ page: Page; origin: string }> = [];
    for (const frame of frames) {
      if (frame === this.page.mainFrame()) continue;
      try {
        const url = frame.url();
        if (url && url !== "about:blank") {
          // Frames share the same page object; we access them via frame
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
