/**
 * CEL Real Extraction Test Harness
 *
 * Uses Playwright-managed Chromium for reliable lifecycle, plus
 * Xvfb + D-Bus + AT-SPI2 for the accessibility pipeline.
 */

import { execSync, spawn, ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { chromium, type Browser, type Page } from "@playwright/test";

export interface CelBounds {
  x: number; y: number; width: number; height: number;
}

export interface CelElement {
  id: string;
  label: string | null;
  element_type: string;
  value: string | null;
  bounds: CelBounds | null;
  confidence: number;
  source: string;
}

export interface CelContext {
  app: string;
  window: string;
  elements: CelElement[];
  network_events: unknown[];
  timestamp_ms: number;
}

export class CelTestHarness {
  private display = ":99";
  private celBinary: string;
  private chromePath: string;

  private xvfbProc: ChildProcess | null = null;
  private dbusAddress = "";
  private openboxProc: ChildProcess | null = null;
  private atspiProc: ChildProcess | null = null;
  private env: Record<string, string> = {};
  private tempFiles: string[] = [];

  private browser: Browser | null = null;
  private page: Page | null = null;

  constructor() {
    this.celBinary = path.resolve(__dirname, "../../target/release/examples/context_snapshot");
    this.chromePath = `${os.homedir()}/.cache/ms-playwright/chromium-1194/chrome-linux/chrome`;
  }

  async start(): Promise<void> {
    this.stopProcesses();

    // Xvfb
    this.xvfbProc = spawn("Xvfb", [this.display, "-screen", "0", "1920x1080x24", "-ac"], {
      stdio: "ignore", detached: true,
    });
    this.xvfbProc.unref();
    await sleep(1000);

    // D-Bus
    const dbusOut = execSync("dbus-launch --sh-syntax", {
      env: { ...process.env, DISPLAY: this.display },
    }).toString();
    const match = dbusOut.match(/DBUS_SESSION_BUS_ADDRESS='([^']+)'/);
    if (!match) throw new Error("dbus-launch failed");
    this.dbusAddress = match[1];

    this.env = {
      ...process.env as Record<string, string>,
      DISPLAY: this.display,
      DBUS_SESSION_BUS_ADDRESS: this.dbusAddress,
      GTK_MODULES: "gail:atk-bridge",
      ACCESSIBILITY_ENABLED: "1",
    };

    // Set env vars for Playwright
    process.env.DISPLAY = this.display;
    process.env.DBUS_SESSION_BUS_ADDRESS = this.dbusAddress;
    process.env.GTK_MODULES = "gail:atk-bridge";
    process.env.ACCESSIBILITY_ENABLED = "1";

    // AT-SPI2 registry
    this.atspiProc = spawn("/usr/libexec/at-spi2-registryd", [], {
      stdio: "ignore", detached: true, env: this.env,
    });
    this.atspiProc.unref();
    await sleep(1000);

    // Window manager
    this.openboxProc = spawn("openbox", [], {
      stdio: "ignore", detached: true, env: this.env,
    });
    this.openboxProc.unref();
    await sleep(500);

    // Launch browser
    await this.launchBrowser();
  }

  private async launchBrowser(): Promise<void> {
    this.browser = await chromium.launch({
      executablePath: this.chromePath,
      args: [
        "--no-sandbox", "--disable-gpu",
        "--force-renderer-accessibility", "--enable-accessibility",
        "--disable-extensions", "--disable-sync", "--disable-translate",
      ],
      headless: false,
    });
    const ctx = await this.browser.newContext();
    this.page = await ctx.newPage();
    await sleep(3000);  // Wait for AT-SPI2 registration
  }

  async extractContext(htmlContent: string): Promise<CelContext> {
    // Write temp file
    const tmpFile = path.join(os.tmpdir(), `cel-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
    fs.writeFileSync(tmpFile, htmlContent);
    this.tempFiles.push(tmpFile);

    // Navigate — restart browser if needed
    let navigated = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (!this.page || !this.browser?.isConnected()) {
          await this.launchBrowser();
        }
        await this.page!.goto(`file://${tmpFile}`, { waitUntil: "load", timeout: 10000 });
        navigated = true;
        break;
      } catch {
        // Browser crashed — restart
        try { await this.browser?.close(); } catch {}
        this.browser = null;
        this.page = null;
        await sleep(1000);
      }
    }
    if (!navigated) throw new Error("Failed to navigate after 3 attempts");

    // Get the expected page title for validation
    const titleMatch = htmlContent.match(/<title>([^<]*)<\/title>/);
    const expectedTitle = titleMatch ? titleMatch[1] : "";

    // Poll CEL extraction — wait for tree to update with new page content
    let bestCtx: CelContext | null = null;
    for (let poll = 0; poll < 6; poll++) {
      await sleep(1500);
      try {
        const output = execSync(`${this.celBinary} --json`, {
          env: this.env, timeout: 8000, maxBuffer: 10 * 1024 * 1024,
        }).toString();
        const ctx = JSON.parse(output) as CelContext;

        // Check if the tree reflects the current page (not stale)
        const hasCurrentPage = expectedTitle === "" || ctx.elements.some(e =>
          (e.label || "").includes(expectedTitle) ||
          ctx.window.includes(expectedTitle)
        );

        if (hasCurrentPage && (!bestCtx || ctx.elements.length > bestCtx.elements.length)) {
          bestCtx = ctx;
        }
        if (hasCurrentPage && ctx.elements.length > 20) break;
      } catch { /* keep polling */ }
    }

    if (!bestCtx || bestCtx.elements.length <= 1) {
      throw new Error(`CEL extraction failed: got ${bestCtx?.elements.length ?? 0} elements`);
    }
    return bestCtx;
  }

  stop(): void {
    try { this.browser?.close(); } catch {}
    this.browser = null;
    this.page = null;
    this.stopProcesses();
    for (const f of this.tempFiles) { try { fs.unlinkSync(f); } catch {} }
    this.tempFiles = [];
  }

  private stopProcesses(): void {
    try { execSync("pkill -9 -f 'chrome.*force-renderer' 2>/dev/null || true", { timeout: 3000 }); } catch {}
    for (const proc of [this.openboxProc, this.atspiProc, this.xvfbProc]) {
      if (proc?.pid) { try { process.kill(-proc.pid, "SIGKILL"); } catch {} }
    }
    this.openboxProc = null;
    this.atspiProc = null;
    this.xvfbProc = null;
    try { execSync("pkill -9 Xvfb 2>/dev/null; pkill -9 openbox 2>/dev/null", { timeout: 3000 }); } catch {}
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Validation ───

export interface ExpectedElement {
  type: string;
  label?: string;
  labelPattern?: string;
  hasBounds?: boolean;
  hasValue?: boolean;
}

export interface ValidationResult {
  passed: boolean;
  scenarioId: string;
  scenarioName: string;
  totalElements: number;
  matchedExpected: number;
  totalExpected: number;
  failures: string[];
  warnings: string[];
}

export function validateExtraction(
  ctx: CelContext,
  expected: ExpectedElement[],
  minElements: number,
  maxElements?: number,
  scenarioId = "",
  scenarioName = "",
): ValidationResult {
  const failures: string[] = [];
  const warnings: string[] = [];

  if (ctx.elements.length < minElements) {
    failures.push(`Expected at least ${minElements} elements, got ${ctx.elements.length}`);
  }

  let matchedCount = 0;
  for (const exp of expected) {
    const matches = ctx.elements.filter(e => {
      if (e.element_type !== exp.type) return false;
      if (exp.label) {
        const combined = `${e.label || ""} ${e.value || ""}`;
        if (!combined.includes(exp.label)) return false;
      }
      if (exp.labelPattern) {
        const combined = `${e.label || ""} ${e.value || ""}`;
        if (!new RegExp(exp.labelPattern).test(combined)) return false;
      }
      return true;
    });

    if (matches.length === 0) {
      failures.push(`Missing: type=${exp.type}${exp.label ? ` label="${exp.label}"` : ""}`);
    } else {
      matchedCount++;
      if (exp.hasBounds && !matches[0].bounds) {
        warnings.push(`${exp.type} "${exp.label}" missing bounds`);
      }
    }
  }

  for (const e of ctx.elements) {
    if (e.confidence < 0 || e.confidence > 1) {
      failures.push(`Element ${e.id} invalid confidence: ${e.confidence}`);
    }
    if (e.bounds && (e.bounds.width < 0 || e.bounds.height < 0)) {
      failures.push(`Element ${e.id} negative bounds`);
    }
  }

  return {
    passed: failures.length === 0,
    scenarioId, scenarioName,
    totalElements: ctx.elements.length,
    matchedExpected: matchedCount,
    totalExpected: expected.length,
    failures, warnings,
  };
}
