import { Command } from "commander";

export const statusCommand = new Command("status")
  .description("Show CEL runtime status")
  .action(() => {
    console.log("CEL Runtime Status");
    console.log("==================");
    console.log("  Runtime:    cellar v0.1.0");
    console.log("  Status:     idle");
    console.log("  Active:     (none)");
    console.log("  Queue:      0 workflows");
    console.log("  Platform:   " + process.platform);
    console.log("  Live View:  not running");
    // TODO: Query actual runtime state
  });
