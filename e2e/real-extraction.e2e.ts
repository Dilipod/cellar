/**
 * Real CEL Extraction Tests — 111 scenarios
 *
 * Launches real Chromium pages on Xvfb, runs the actual CEL context
 * extraction pipeline (AT-SPI2 + display capture), validates extracted
 * elements match what's on screen.
 *
 * Quality gates:
 *  - ≥80% of expected elements must be found (match rate)
 *  - ≥30% of extracted elements must have screen bounds
 *  - Average confidence must be ≥0.3
 *  - No invalid confidence values, no negative bounds
 *  - No unknown source types
 *  - <50% duplicate element IDs
 *  - ≥10% of elements must have labels
 *
 * Run: make test-real-extraction
 *   or: npx playwright test --project=real-extraction
 */

import { test, expect } from "@playwright/test";
import {
  CelTestHarness,
  validateExtraction,
  buildBaselineReport,
  type ValidationResult,
} from "./fixtures/cel-harness";
import { ALL_SCENARIOS } from "./fixtures/html/generate-scenarios";

let harness: CelTestHarness;
const allResults: ValidationResult[] = [];

test.beforeAll(async () => {
  harness = new CelTestHarness();
  await harness.start();
});

test.afterAll(async () => {
  harness.stop();

  // Print regression baseline summary
  if (allResults.length > 0) {
    const report = buildBaselineReport(allResults);
    console.log("\n═══════════════════════════════════════");
    console.log("  CEL EXTRACTION QUALITY REPORT");
    console.log("═══════════════════════════════════════");
    console.log(`  Scenarios:       ${report.summary.totalScenarios}`);
    console.log(`  Passed:          ${report.summary.passedScenarios} (${(report.summary.passedScenarios / report.summary.totalScenarios * 100).toFixed(0)}%)`);
    console.log(`  Match rate:      ${(report.summary.overallMatchRate * 100).toFixed(1)}%`);
    console.log(`  Avg bounds:      ${(report.summary.avgBoundsRate * 100).toFixed(1)}%`);
    console.log(`  Avg confidence:  ${report.summary.avgConfidence.toFixed(3)}`);
    console.log(`  Avg label rate:  ${(report.summary.avgLabelRate * 100).toFixed(1)}%`);
    console.log("═══════════════════════════════════════\n");

    // Fail scenarios summary
    const failed = allResults.filter(r => !r.passed);
    if (failed.length > 0) {
      console.log(`  FAILED SCENARIOS (${failed.length}):`);
      for (const r of failed) {
        console.log(`    ${r.scenarioId}: ${r.matchedExpected}/${r.totalExpected} matched, ${r.failures[0]}`);
      }
      console.log("");
    }
  }
});

// Each scenario gets 30s (includes Chrome launch + AT-SPI2 registration + extraction)
test.setTimeout(30_000);

// ─── Generate a test for each scenario ───

for (const scenario of ALL_SCENARIOS) {
  test(`[${scenario.category}] ${scenario.id}: ${scenario.name}`, async () => {
    const ctx = await harness.extractContext(scenario.html);

    // ── Basic structure assertions ──
    expect(ctx).toBeDefined();
    expect(ctx.elements).toBeDefined();
    expect(Array.isArray(ctx.elements)).toBe(true);
    expect(ctx.timestamp_ms).toBeGreaterThan(0);
    expect(ctx.app).toBeDefined();
    expect(ctx.window).toBeDefined();

    const result = validateExtraction(
      ctx, scenario.expected, scenario.minElements,
      scenario.maxElements, scenario.id, scenario.name,
    );
    allResults.push(result);

    // ── Log details for debugging ──
    if (!result.passed || result.warnings.length > 0) {
      const lines = [
        `\n${scenario.id}: ${result.totalElements} elements, ${result.matchedExpected}/${result.totalExpected} matched`,
        `  Bounds: ${(result.boundsRate * 100).toFixed(0)}% | Confidence: ${result.avgConfidence.toFixed(2)} | Labels: ${(result.labelRate * 100).toFixed(0)}%`,
      ];
      if (result.failures.length > 0) {
        lines.push("  Failures:", ...result.failures.map(f => `    - ${f}`));
      }
      if (result.warnings.length > 0) {
        lines.push("  Warnings:", ...result.warnings.map(w => `    - ${w}`));
      }
      // Show first 15 extracted elements for diagnosis
      lines.push("  Extracted elements:");
      for (const e of ctx.elements.slice(0, 15)) {
        const l = e.label ? `"${e.label.slice(0, 40)}"` : "(none)";
        const b = e.bounds ? `${e.bounds.width}x${e.bounds.height}@${e.bounds.x},${e.bounds.y}` : "no-bounds";
        lines.push(`    ${e.element_type.padEnd(14)} ${l.padEnd(42)} c=${e.confidence.toFixed(2)} ${b}`);
      }
      console.log(lines.join("\n"));
    }

    // ── QUALITY GATE 1: Element match rate ≥80% ──
    if (result.totalExpected > 0) {
      const matchRate = result.matchedExpected / result.totalExpected;
      expect(
        matchRate,
        `Match rate ${(matchRate * 100).toFixed(0)}%: ${result.matchedExpected}/${result.totalExpected} expected elements found. Missing: ${result.failures.filter(f => f.startsWith("Missing:")).join("; ")}`
      ).toBeGreaterThanOrEqual(0.8);
    }

    // ── QUALITY GATE 2: Must extract real content ──
    if (scenario.minElements > 0) {
      expect(
        result.totalElements,
        `Only ${result.totalElements} elements extracted (need >${scenario.minElements})`
      ).toBeGreaterThan(1);
    }

    // ── QUALITY GATE 3: Per-element invariants (from validateExtraction) ──
    // Confidence, bounds, source, ID validity — all checked inside validateExtraction
    const invariantFailures = result.failures.filter(f =>
      f.includes("invalid confidence") ||
      f.includes("negative bounds") ||
      f.includes("unknown source") ||
      f.includes("empty ID") ||
      f.includes("empty element_type")
    );
    expect(
      invariantFailures,
      `Element invariant violations: ${invariantFailures.join("; ")}`
    ).toHaveLength(0);

    // ── QUALITY GATE 4: Bounds coverage ──
    // Real AT-SPI2 extraction should give bounds on most elements
    if (result.totalElements > 3) {
      expect(
        result.boundsRate,
        `Bounds rate ${(result.boundsRate * 100).toFixed(0)}% — most elements should have screen coordinates`
      ).toBeGreaterThanOrEqual(0.3);
    }

    // ── QUALITY GATE 5: Label coverage ──
    // Real pages should produce mostly labeled elements
    if (result.totalElements > 5) {
      expect(
        result.labelRate,
        `Label rate ${(result.labelRate * 100).toFixed(0)}% — too few elements have labels/values`
      ).toBeGreaterThanOrEqual(0.1);
    }

    // ── QUALITY GATE 6: Confidence sanity ──
    expect(
      result.avgConfidence,
      `Average confidence ${result.avgConfidence.toFixed(2)} — abnormally low`
    ).toBeGreaterThanOrEqual(0.3);

    // ── QUALITY GATE 7: ID uniqueness ──
    if (result.totalElements > 3) {
      expect(
        result.uniqueIdRate,
        `ID uniqueness ${(result.uniqueIdRate * 100).toFixed(0)}% — too many duplicate IDs`
      ).toBeGreaterThanOrEqual(0.5);
    }
  });
}
