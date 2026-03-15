import { Command } from "commander";
import { Cel } from "@cellar/agent";

export const statusCommand = new Command("status")
  .description("Show CEL runtime status")
  .action(() => {
    const cel = new Cel();
    const nativeStatus = cel.isNativeAvailable ? "loaded" : "not available";

    console.log("CEL Runtime Status");
    console.log("==================");
    console.log(`  Version:    cellar ${cel.version()}`);
    console.log(`  Native:     ${nativeStatus}`);
    console.log(`  Platform:   ${process.platform}`);
    console.log(`  Node.js:    ${process.version}`);

    if (cel.isNativeAvailable) {
      try {
        const monitors = cel.listMonitors();
        console.log(`  Monitors:   ${monitors.length}`);
        for (const m of monitors) {
          const primary = m.is_primary ? " (primary)" : "";
          console.log(`    - ${m.name}: ${m.width}x${m.height}${primary}`);
        }
      } catch {
        console.log("  Monitors:   (query failed)");
      }

      try {
        const windows = cel.listWindows();
        console.log(`  Windows:    ${windows.length} visible`);
      } catch {
        console.log("  Windows:    (query failed)");
      }
    }
  });
