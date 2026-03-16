/**
 * Real CEL Extraction Tests — 100+ scenarios
 *
 * Launches real Chromium pages on Xvfb, runs the actual CEL context
 * extraction pipeline (AT-SPI2 + display capture), validates extracted
 * elements match what's on screen.
 *
 * Run: make test-real-extraction
 *   or: npx playwright test --project=real-extraction
 */

import { test, expect } from "@playwright/test";
import { CelTestHarness, validateExtraction } from "./fixtures/cel-harness";
import { ALL_SCENARIOS } from "./fixtures/html/generate-scenarios";

let harness: CelTestHarness;

test.beforeAll(async () => {
  harness = new CelTestHarness();
  await harness.start();
});

test.afterAll(async () => {
  harness.stop();
});

// Each scenario gets 30s (includes Chrome launch + AT-SPI2 registration + extraction)
test.setTimeout(30_000);

// ─── Generate a test for each scenario ───

for (const scenario of ALL_SCENARIOS) {
  test(`[${scenario.category}] ${scenario.id}: ${scenario.name}`, async () => {
    const ctx = await harness.extractContext(scenario.html);

    expect(ctx).toBeDefined();
    expect(ctx.elements).toBeDefined();
    expect(ctx.timestamp_ms).toBeGreaterThan(0);

    const result = validateExtraction(
      ctx, scenario.expected, scenario.minElements,
      scenario.maxElements, scenario.id, scenario.name,
    );

    // Log details for debugging failures
    if (!result.passed || result.warnings.length > 0) {
      const lines = [
        `${scenario.id}: ${result.totalElements} elements, ${result.matchedExpected}/${result.totalExpected} matched`,
      ];
      if (result.failures.length > 0) {
        lines.push("Failures:", ...result.failures.map(f => `  - ${f}`));
        lines.push("Elements (first 20):");
        for (const e of ctx.elements.slice(0, 20)) {
          const l = e.label ? `"${e.label.slice(0, 35)}"` : "(none)";
          lines.push(`  ${e.element_type.padEnd(12)} ${l}`);
        }
      }
      console.log(lines.join("\n"));
    }

    // Core assertion: at least 50% of expected elements found
    if (result.totalExpected > 0) {
      const matchRate = result.matchedExpected / result.totalExpected;
      expect(
        matchRate,
        `${result.matchedExpected}/${result.totalExpected} expected elements. ${result.failures.join("; ")}`
      ).toBeGreaterThanOrEqual(0.5);
    }

    // Must extract real content (not just Desktop root)
    if (scenario.minElements > 0) {
      expect(result.totalElements).toBeGreaterThan(1);
    }
  });
}
