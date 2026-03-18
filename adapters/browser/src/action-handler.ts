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
}
