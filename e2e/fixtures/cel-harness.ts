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
  // Quality metrics
  boundsRate: number;       // Fraction of elements with valid bounds
  avgConfidence: number;    // Mean confidence across all elements
  sourceConsistency: boolean; // All sources are valid strings
  uniqueIdRate: number;     // Fraction of unique IDs
  labelRate: number;        // Fraction of elements with a label or value
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

  // ── 1. Element count checks ──
  if (ctx.elements.length < minElements) {
    failures.push(`Expected at least ${minElements} elements, got ${ctx.elements.length}`);
  }
  if (maxElements !== undefined && ctx.elements.length > maxElements) {
    warnings.push(`Expected at most ${maxElements} elements, got ${ctx.elements.length}`);
  }

  // ── 2. Expected element matching ──
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
      if (exp.hasBounds !== false) {
        // By default, matched elements should have bounds
        const withBounds = matches.filter(m => m.bounds !== null);
        if (withBounds.length === 0) {
          warnings.push(`${exp.type} "${exp.label || "(any)"}" — none have bounds`);
        }
      }
    }
  }

  // ── 3. Per-element invariants (hard failures) ──
  const validSources = ["accessibility_tree", "native_api", "vision", "merged"];
  const seenIds = new Set<string>();
  let duplicateIds = 0;
  let boundsCount = 0;
  let labelCount = 0;
  let totalConfidence = 0;
  let invalidConfidenceCount = 0;

  for (const e of ctx.elements) {
    // Confidence must be in [0, 1]
    if (e.confidence < 0 || e.confidence > 1 || Number.isNaN(e.confidence)) {
      failures.push(`Element "${e.id}" invalid confidence: ${e.confidence}`);
      invalidConfidenceCount++;
    }
    totalConfidence += e.confidence;

    // Bounds must be non-negative when present
    if (e.bounds) {
      boundsCount++;
      if (e.bounds.width < 0 || e.bounds.height < 0) {
        failures.push(`Element "${e.id}" negative bounds: ${e.bounds.width}x${e.bounds.height}`);
      }
      // Bounds should be reasonable (not absurdly large)
      if (e.bounds.width > 10000 || e.bounds.height > 10000) {
        warnings.push(`Element "${e.id}" unreasonably large bounds: ${e.bounds.width}x${e.bounds.height}`);
      }
      // Bounds should not be zero-area for interactive elements
      if (e.bounds.width === 0 && e.bounds.height === 0 && isActionable(e.element_type)) {
        warnings.push(`Actionable element "${e.id}" has zero-area bounds`);
      }
    }

    // Source must be a known value
    if (!validSources.includes(e.source)) {
      failures.push(`Element "${e.id}" unknown source: "${e.source}"`);
    }

    // ID must be non-empty
    if (!e.id || e.id.trim() === "") {
      failures.push(`Element has empty ID`);
    }

    // element_type must be non-empty
    if (!e.element_type || e.element_type.trim() === "") {
      failures.push(`Element "${e.id}" has empty element_type`);
    }

    // Track uniqueness
    if (seenIds.has(e.id)) {
      duplicateIds++;
    }
    seenIds.add(e.id);

    // Track label coverage
    if (e.label || e.value) {
      labelCount++;
    }
  }

  // ── 4. Quality metrics ──
  const boundsRate = ctx.elements.length > 0 ? boundsCount / ctx.elements.length : 0;
  const avgConfidence = ctx.elements.length > 0 ? totalConfidence / ctx.elements.length : 0;
  const uniqueIdRate = ctx.elements.length > 0 ? seenIds.size / ctx.elements.length : 1;
  const labelRate = ctx.elements.length > 0 ? labelCount / ctx.elements.length : 0;

  // ── 5. Quality gates (failures for bad quality) ──

  // At least 30% of elements should have bounds (real extraction always has bounds)
  if (ctx.elements.length > 3 && boundsRate < 0.3) {
    failures.push(`Low bounds coverage: ${(boundsRate * 100).toFixed(0)}% (need ≥30%)`);
  }

  // Average confidence should be reasonable
  if (ctx.elements.length > 0 && avgConfidence < 0.3) {
    failures.push(`Average confidence too low: ${avgConfidence.toFixed(2)} (need ≥0.3)`);
  }

  // Excessive duplicate IDs indicate extraction bugs
  if (ctx.elements.length > 3 && duplicateIds > ctx.elements.length * 0.5) {
    failures.push(`Too many duplicate IDs: ${duplicateIds}/${ctx.elements.length}`);
  }

  // At least some elements should have labels (not all unlabeled)
  if (ctx.elements.length > 5 && labelRate < 0.1) {
    failures.push(`Almost no elements have labels: ${(labelRate * 100).toFixed(0)}% (need ≥10%)`);
  }

  // Timestamp must be recent (within last 60s)
  const now = Date.now();
  if (ctx.timestamp_ms < now - 60_000 || ctx.timestamp_ms > now + 5_000) {
    warnings.push(`Timestamp seems stale or future: ${ctx.timestamp_ms} vs now ${now}`);
  }

  return {
    passed: failures.length === 0,
    scenarioId, scenarioName,
    totalElements: ctx.elements.length,
    matchedExpected: matchedCount,
    totalExpected: expected.length,
    failures, warnings,
    boundsRate,
    avgConfidence,
    sourceConsistency: failures.filter(f => f.includes("unknown source")).length === 0,
    uniqueIdRate,
    labelRate,
  };
}

function isActionable(elementType: string): boolean {
  return ["button", "input", "link", "checkbox", "radio_button", "combobox",
    "menu_item", "tab_item", "slider", "list_item", "tree_item"].includes(elementType);
}

// ─── Regression Baseline ───

export interface BaselineResult {
  scenarioId: string;
  totalElements: number;
  matchedExpected: number;
  totalExpected: number;
  boundsRate: number;
  avgConfidence: number;
  labelRate: number;
  timestamp: number;
}

export interface BaselineReport {
  results: BaselineResult[];
  summary: {
    totalScenarios: number;
    passedScenarios: number;
    overallMatchRate: number;
    avgBoundsRate: number;
    avgConfidence: number;
    avgLabelRate: number;
  };
}

export function buildBaselineReport(results: ValidationResult[]): BaselineReport {
  const baselineResults: BaselineResult[] = results.map(r => ({
    scenarioId: r.scenarioId,
    totalElements: r.totalElements,
    matchedExpected: r.matchedExpected,
    totalExpected: r.totalExpected,
    boundsRate: r.boundsRate,
    avgConfidence: r.avgConfidence,
    labelRate: r.labelRate,
    timestamp: Date.now(),
  }));

  const passedCount = results.filter(r => r.passed).length;
  const totalMatched = results.reduce((s, r) => s + r.matchedExpected, 0);
  const totalExpected = results.reduce((s, r) => s + r.totalExpected, 0);
  const avgBounds = results.reduce((s, r) => s + r.boundsRate, 0) / (results.length || 1);
  const avgConf = results.reduce((s, r) => s + r.avgConfidence, 0) / (results.length || 1);
  const avgLabel = results.reduce((s, r) => s + r.labelRate, 0) / (results.length || 1);

  return {
    results: baselineResults,
    summary: {
      totalScenarios: results.length,
      passedScenarios: passedCount,
      overallMatchRate: totalExpected > 0 ? totalMatched / totalExpected : 0,
      avgBoundsRate: avgBounds,
      avgConfidence: avgConf,
      avgLabelRate: avgLabel,
    },
  };
}
