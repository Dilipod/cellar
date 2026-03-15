import { Command } from "commander";
import { Cel } from "@cellar/agent";

export const trainCommand = new Command("train")
  .description("Enter training mode")
  .option("--passive", "Use passive observation mode")
  .option("--frequency <level>", "Observation frequency (low|medium|high)", "low")
  .option("-o, --output <path>", "Output workflow file path")
  .action((opts: { passive?: boolean; frequency: string; output?: string }) => {
    const cel = new Cel();

    if (opts.passive) {
      console.log(`Starting passive observation (frequency: ${opts.frequency})...`);
      console.log("CEL is watching silently. Work normally.");
      console.log("Press Ctrl+C to stop and review detected patterns.\n");

      // Poll context at the configured frequency
      const intervalMs =
        opts.frequency === "high" ? 500 : opts.frequency === "medium" ? 2000 : 5000;

      let snapshots = 0;
      const timer = setInterval(() => {
        try {
          const ctx = cel.getContext();
          snapshots++;
          if (snapshots % 10 === 0) {
            process.stdout.write(
              `\r  Observed ${snapshots} context snapshots, ${ctx.elements.length} elements visible...`
            );
          }
        } catch {
          // Silently continue
        }
      }, intervalMs);

      process.on("SIGINT", () => {
        clearInterval(timer);
        console.log(`\n\nPassive observation stopped after ${snapshots} snapshots.`);
        console.log("Pattern detection not yet implemented — coming soon.");
        process.exit(0);
      });
    } else {
      console.log("Starting explicit recording mode...");
      console.log("CEL is capturing all context streams.");
      console.log("Work through the task. Press Ctrl+C to stop and save.\n");

      const steps: Array<{ timestamp: number; elements: number; app: string }> = [];

      const timer = setInterval(() => {
        try {
          const ctx = cel.getContext();
          steps.push({
            timestamp: ctx.timestamp_ms,
            elements: ctx.elements.length,
            app: ctx.app,
          });
          process.stdout.write(
            `\r  Recording step ${steps.length}: ${ctx.elements.length} elements in ${ctx.app || "(unknown)"}...`
          );
        } catch {
          // Silently continue
        }
      }, 1000);

      process.on("SIGINT", () => {
        clearInterval(timer);
        console.log(`\n\nRecording stopped. Captured ${steps.length} snapshots.`);
        if (opts.output) {
          console.log(`Workflow would be saved to: ${opts.output}`);
        }
        console.log("Full recording-to-workflow conversion coming soon.");
        process.exit(0);
      });
    }
  });
