import { Command } from "commander";

export const trainCommand = new Command("train")
  .description("Enter training mode")
  .option("--passive", "Use passive observation mode")
  .option("--frequency <level>", "Observation frequency (low|medium|high)", "low")
  .action((opts: { passive?: boolean; frequency: string }) => {
    if (opts.passive) {
      console.log(`Starting passive observation (frequency: ${opts.frequency})...`);
      console.log("CEL is watching silently. Work normally.");
      console.log("Press Ctrl+C to stop and review detected patterns.");
      // TODO: Start PassiveRecorder
    } else {
      console.log("Starting explicit recording mode...");
      console.log("CEL is capturing all context streams.");
      console.log("Work through the task. Press Ctrl+C to stop.");
      // TODO: Start ExplicitRecorder
    }
  });
