/**
 * Browser Adapter (stub)
 *
 * DOM-based context provider for web applications.
 * Uses the browser's DOM as a native API — giving structured element access
 * similar to what the accessibility tree provides for native apps.
 *
 * License: MIT
 */

import type { ContextElement } from "@cellar/agent";

export interface BrowserAdapterConfig {
  /** Browser to control (chrome, firefox, edge). */
  browser: string;
  /** Whether to use CDP (Chrome DevTools Protocol). */
  useCdp: boolean;
}

export class BrowserAdapter {
  private connected = false;

  constructor(private config: BrowserAdapterConfig) {}

  async connect(): Promise<void> {
    // TODO: Connect to browser via CDP or WebDriver
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  /** Get DOM elements as ContextElements — highest confidence for web apps. */
  async getElements(): Promise<ContextElement[]> {
    if (!this.connected) return [];
    // TODO: Query DOM via CDP, convert to ContextElements
    return [];
  }

  /** Execute JavaScript in the browser context. */
  async evaluate(_script: string): Promise<unknown> {
    // TODO: CDP Runtime.evaluate
    return null;
  }

  /** Navigate to a URL. */
  async navigate(_url: string): Promise<void> {
    // TODO: CDP Page.navigate
  }
}
