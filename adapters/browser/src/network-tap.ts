/**
 * Network Tap — captures HTTP request/response events via Playwright.
 *
 * Provides the network context stream that DOM and vision can't:
 * "POST /api/submit returned 422", "XHR in-flight", etc.
 *
 * License: MIT
 */

import type { Page, Request, Response } from "playwright";
import type { NetworkEvent } from "@cellar/agent";

/** Maximum buffered events. */
const MAX_EVENTS = 50;

/** URL patterns to filter out (noise). */
const NOISE_PATTERNS = [
  /^data:/,
  /^chrome-extension:/,
  /^moz-extension:/,
  /^about:/,
  /^blob:/,
  /\.(js|css|woff2?|ttf|eot|ico|svg|png|jpg|jpeg|gif|webp)(\?|$)/,
];

export class NetworkTap {
  private events: NetworkEvent[] = [];
  private pendingRequests: Map<string, { url: string; method: string; timestamp: number }> = new Map();
  private attached = false;

  /** Start capturing network events from the page. */
  attach(page: Page): void {
    if (this.attached) return;

    page.on("request", (request: Request) => {
      this.onRequest(request);
    });

    page.on("response", (response: Response) => {
      this.onResponse(response);
    });

    page.on("requestfailed", (request: Request) => {
      this.onRequestFailed(request);
    });

    this.attached = true;
  }

  /** Get buffered network events. */
  getEvents(): NetworkEvent[] {
    return [...this.events];
  }

  /** Clear buffered events. */
  clear(): void {
    this.events = [];
    this.pendingRequests.clear();
  }

  private onRequest(request: Request): void {
    const url = request.url();
    if (this.isNoise(url)) return;

    // Track as pending
    this.pendingRequests.set(url, {
      url,
      method: request.method(),
      timestamp: Date.now(),
    });
  }

  private onResponse(response: Response): void {
    const url = response.url();
    if (this.isNoise(url) && response.status() < 400) return;

    this.pendingRequests.delete(url);

    const contentType =
      response.headers()["content-type"] || undefined;

    this.addEvent({
      url: this.truncateUrl(url),
      method: response.request().method(),
      status: response.status(),
      content_type: contentType,
      timestamp_ms: Date.now(),
    });
  }

  private onRequestFailed(request: Request): void {
    const url = request.url();
    this.pendingRequests.delete(url);

    // Always capture failed requests — they're actionable context
    this.addEvent({
      url: this.truncateUrl(url),
      method: request.method(),
      status: 0, // Network error
      content_type: undefined,
      timestamp_ms: Date.now(),
    });
  }

  private addEvent(event: NetworkEvent): void {
    this.events.push(event);
    if (this.events.length > MAX_EVENTS) {
      this.events = this.events.slice(-MAX_EVENTS);
    }
  }

  private isNoise(url: string): boolean {
    return NOISE_PATTERNS.some((pattern) => pattern.test(url));
  }

  /** Truncate URLs to avoid flooding context with query params. */
  private truncateUrl(url: string): string {
    try {
      const parsed = new URL(url);
      const path = parsed.pathname;
      // Keep search params but truncate long values
      const search = parsed.search.length > 100
        ? parsed.search.slice(0, 100) + "..."
        : parsed.search;
      return `${parsed.origin}${path}${search}`;
    } catch {
      return url.slice(0, 200);
    }
  }
}
