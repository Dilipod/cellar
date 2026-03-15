import { Command } from "commander";
import { Cel } from "@cellar/agent";

export const contextCommand = new Command("context")
  .description("Get the unified screen context")
  .option("--json", "Output raw JSON")
  .option("--watch", "Continuously poll and display context changes")
  .option("--interval <ms>", "Poll interval in milliseconds", "1000")
  .action(async (opts) => {
    const cel = new Cel();

    if (!cel.isNativeAvailable) {
      console.error("Error: CEL native module not available.");
      process.exit(1);
    }

    const printContext = () => {
      const ctx = cel.getContext();
      if (opts.json) {
        console.log(JSON.stringify(ctx, null, 2));
      } else {
        console.log(`App: ${ctx.app || "(unknown)"}`);
        console.log(`Window: ${ctx.window || "(unknown)"}`);
        console.log(`Elements: ${ctx.elements.length}`);
        console.log("---");
        for (const el of ctx.elements.slice(0, 20)) {
          const bounds = el.bounds
            ? `(${el.bounds.x},${el.bounds.y} ${el.bounds.width}x${el.bounds.height})`
            : "";
          const conf = `[${(el.confidence * 100).toFixed(0)}%]`;
          console.log(
            `  ${conf} ${el.element_type}: ${el.label ?? "(no label)"} ${bounds}`
          );
        }
        if (ctx.elements.length > 20) {
          console.log(`  ... and ${ctx.elements.length - 20} more`);
        }
      }
    };

    if (opts.watch) {
      const interval = parseInt(opts.interval, 10);
      console.log(`Watching context (every ${interval}ms). Ctrl+C to stop.\n`);
      const timer = setInterval(() => {
        console.clear();
        printContext();
      }, interval);
      process.on("SIGINT", () => {
        clearInterval(timer);
        process.exit(0);
      });
    } else {
      printContext();
    }
  });
