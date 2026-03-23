import { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import { Cel, saveWorkflow } from "@cellar/agent";
import { PassiveRecorder, ExplicitRecorder } from "@cellar/recorder";

export const trainCommand = new Command("train")
  .description("Enter training mode to create workflows")
  .option("--passive", "Use passive observation mode (detect patterns)")
  .option("--frequency <level>", "Observation frequency (low|medium|high)", "low")
  .option("-o, --output <path>", "Output workflow file path")
  .option("-n, --name <name>", "Workflow name")
  .option("-d, --description <desc>", "Workflow description")
  .action((opts: {
    passive?: boolean;
    frequency: string;
    output?: string;
    name?: string;
    description?: string;
  }) => {
    const cel = new Cel();

    if (opts.passive) {
      runPassiveMode(cel, opts);
    } else {
      runExplicitMode(cel, opts);
    }
  });

function runPassiveMode(
  cel: Cel,
  opts: { frequency: string; output?: string },
): void {
  const freq = opts.frequency as "low" | "medium" | "high";
  const recorder = new PassiveRecorder(freq);

  console.log(`Starting passive observation (frequency: ${freq})...`);
  console.log("CEL is watching silently. Work normally.");
  console.log("Press Ctrl+C to stop and review detected patterns.\n");

  recorder.start();

  const intervalMs = freq === "high" ? 500 : freq === "medium" ? 2000 : 5000;
  let snapshots = 0;

  const timer = setInterval(() => {
    try {
      const ctx = cel.getContext();
      recorder.onContext(ctx);
      snapshots++;
      if (snapshots % 10 === 0) {
        const patterns = recorder.getPatterns();
        process.stdout.write(
          `\r  Observed ${snapshots} snapshots, ${patterns.length} patterns detected...`,
        );
      }
    } catch {
      // Silently continue
    }
  }, intervalMs);

  process.on("SIGINT", () => {
    clearInterval(timer);
    recorder.stop();
    const patterns = recorder.getPatterns();

    console.log(`\n\nPassive observation stopped after ${snapshots} snapshots.`);
    console.log(`Patterns detected: ${patterns.length}\n`);

    if (patterns.length === 0) {
      console.log("No patterns detected. Try working longer or increasing frequency.");
      process.exit(0);
    }

    for (let i = 0; i < patterns.length; i++) {
      const p = patterns[i];
      console.log(`  ${i + 1}. ${p.description}`);
      console.log(`     Occurrences: ${p.occurrences}`);
      console.log(`     Steps: ${p.steps.join(" → ")}`);
    }

    if (opts.output) {
      const drafts = patterns.map((p) => recorder.toWorkflowDraft(p));
      fs.writeFileSync(
        opts.output,
        JSON.stringify(drafts, null, 2),
        "utf-8",
      );
      console.log(`\nPattern drafts saved to ${opts.output}`);
    }

    process.exit(0);
  });
}

function runExplicitMode(
  cel: Cel,
  opts: { output?: string; name?: string; description?: string },
): void {
  const recorder = new ExplicitRecorder();

  console.log("Starting explicit recording mode...");
  console.log("CEL is capturing context at every step.");
  console.log("Work through the task. Press Ctrl+C to stop and save.\n");

  recorder.start();

  const timer = setInterval(() => {
    try {
      const ctx = cel.getContext();
      const actionDesc = ctx.elements.length > 0
        ? `observe:${ctx.app}:${ctx.elements.length} elements`
        : `observe:${ctx.app || "unknown"}`;
      recorder.recordStep(ctx, actionDesc);
      process.stdout.write(
        `\r  Recording step ${recorder.stepCount}: ${ctx.elements.length} elements in ${ctx.app || "(unknown)"}...`,
      );
    } catch {
      // Silently continue
    }
  }, 1000);

  process.on("SIGINT", () => {
    clearInterval(timer);
    recorder.stop();

    const name = opts.name ?? "recorded-workflow";
    const desc = opts.description ?? `Workflow recorded on ${new Date().toISOString().split("T")[0]}`;

    console.log(`\n\nRecording stopped. Captured ${recorder.stepCount} steps.`);

    if (recorder.stepCount === 0) {
      console.log("No steps recorded.");
      process.exit(0);
    }

    const workflow = recorder.toWorkflow(name, desc);

    if (opts.output) {
      const outputPath = path.resolve(opts.output);
      fs.writeFileSync(outputPath, JSON.stringify(workflow, null, 2), "utf-8");
      console.log(`Workflow saved to ${outputPath}`);
    } else {
      const savedPath = saveWorkflow(workflow);
      console.log(`Workflow saved to ${savedPath}`);
    }

    console.log(`\nWorkflow "${name}": ${workflow.steps.length} steps, app: ${workflow.app}`);
    process.exit(0);
  });
}
