/**
 * Action Handler — browser-specific actions executed via CDP/Playwright.
 *
 * These map to the `custom` action type in WorkflowAction
 * when adapter === "browser".
 *
 * License: MIT
 */

import type { Page } from "playwright";

export interface ActionResult {
  success: boolean;
  error?: string;
  data?: unknown;
}

export class ActionHandler {
  constructor(private page: Page) {}

  /** Dispatch a browser action by name. */
  async execute(
    action: string,
    params: Record<string, unknown>,
  ): Promise<ActionResult> {
    switch (action) {
      case "navigate":
        return this.navigate(params.url as string);

      case "scroll_to":
        return this.scrollTo(params.selector as string);

      case "hover":
        return this.hover(params.selector as string);

      case "focus":
        return this.focus(params.selector as string);

      case "select":
        return this.select(
          params.selector as string,
          params.value as string,
        );

      case "fill":
        return this.fill(
          params.selector as string,
          params.value as string,
        );

      case "check":
        return this.check(
          params.selector as string,
          params.checked as boolean | undefined,
        );

      case "wait_for":
        return this.waitFor(
          params.selector as string,
          params.timeout as number | undefined,
        );

      case "screenshot":
        return this.screenshot();

      case "go_back":
        return this.goBack();

      case "go_forward":
        return this.goForward();

      case "reload":
        return this.reload();

      case "click":
        return this.click(params.selector as string);

      case "dismiss_cookies":
        return this.dismissCookieConsent();

      default:
        return { success: false, error: `Unknown browser action: ${action}` };
    }
  }

  private async navigate(url: string): Promise<ActionResult> {
    try {
      await this.page.goto(url, { waitUntil: "domcontentloaded" });
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  private async scrollTo(selector: string): Promise<ActionResult> {
    try {
      await this.page.locator(selector).first().scrollIntoViewIfNeeded();
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  private async hover(selector: string): Promise<ActionResult> {
    try {
      await this.page.locator(selector).first().hover();
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  private async focus(selector: string): Promise<ActionResult> {
    try {
      await this.page.locator(selector).first().focus();
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  private async select(
    selector: string,
    value: string,
  ): Promise<ActionResult> {
    try {
      await this.page.locator(selector).first().selectOption(value);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  private async fill(
    selector: string,
    value: string,
  ): Promise<ActionResult> {
    try {
      await this.page.locator(selector).first().fill(value);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  private async check(
    selector: string,
    checked?: boolean,
  ): Promise<ActionResult> {
    try {
      const locator = this.page.locator(selector).first();
      if (checked === false) {
        await locator.uncheck();
      } else {
        await locator.check();
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  private async waitFor(
    selector: string,
    timeout?: number,
  ): Promise<ActionResult> {
    try {
      await this.page
        .locator(selector)
        .first()
        .waitFor({ state: "visible", timeout: timeout ?? 10000 });
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  private async screenshot(): Promise<ActionResult> {
    try {
      const buffer = await this.page.screenshot({ type: "png" });
      return { success: true, data: buffer.toString("base64") };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  private async goBack(): Promise<ActionResult> {
    try {
      await this.page.goBack({ waitUntil: "domcontentloaded" });
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  private async goForward(): Promise<ActionResult> {
    try {
      await this.page.goForward({ waitUntil: "domcontentloaded" });
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  private async reload(): Promise<ActionResult> {
    try {
      await this.page.reload({ waitUntil: "domcontentloaded" });
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  private async click(selector: string): Promise<ActionResult> {
    try {
      await this.page.locator(selector).first().click({ timeout: 5000 });
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Dismiss cookie consent banners using common patterns.
   * Tries multiple selectors in priority order. No-ops if no banner found.
   */
  async dismissCookieConsent(): Promise<ActionResult> {
    const selectors = [
      // Common cookie consent buttons (accept/agree/OK)
      '[id*="cookie"] button[id*="accept"]',
      '[id*="cookie"] button[id*="agree"]',
      '[class*="cookie"] button[class*="accept"]',
      '[class*="cookie"] button[class*="agree"]',
      '[id*="consent"] button[id*="accept"]',
      '[id*="consent"] button[class*="accept"]',
      '[class*="consent"] button[class*="accept"]',
      // Data attribute patterns
      '[data-testid*="cookie-accept"]',
      '[data-testid*="accept-cookies"]',
      '[data-action="accept-cookies"]',
      '[data-cookiebanner] button:first-of-type',
      // Aria label patterns
      'button[aria-label*="accept" i]',
      'button[aria-label*="agree" i]',
      'button[aria-label*="cookie" i][aria-label*="accept" i]',
      // CMP (Consent Management Platform) patterns
      '#onetrust-accept-btn-handler',
      '.cc-accept',
      '.cc-btn.cc-dismiss',
      '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
      '#didomi-notice-agree-button',
      '.sp_choice_type_11',
      // Generic patterns (less specific, tried last)
      '[class*="cookie-banner"] button:not([class*="reject"]):not([class*="decline"]):first-of-type',
      '[class*="cookie-notice"] button:not([class*="reject"]):not([class*="decline"]):first-of-type',
      '[role="dialog"] button:not([class*="reject"]):not([class*="decline"]):first-of-type',
    ];

    for (const selector of selectors) {
      try {
        const el = this.page.locator(selector).first();
        if (await el.isVisible({ timeout: 500 })) {
          await el.click({ timeout: 2000 });
          // Wait a moment for the banner to dismiss
          await this.page.waitForTimeout(500);
          return { success: true, data: { selector } };
        }
      } catch {
        // Selector not found or not clickable — try next
      }
    }

    // No cookie banner found — that's OK
    return { success: true, data: { noBannerFound: true } };
  }
}
