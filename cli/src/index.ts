#!/usr/bin/env node

import { Command } from "commander";
import { adapterCommand } from "./commands/adapter.js";
import { workflowCommand } from "./commands/workflow.js";
import { runCommand } from "./commands/run.js";
import { statusCommand } from "./commands/status.js";
import { trainCommand } from "./commands/train.js";
import { captureCommand } from "./commands/capture.js";
import { contextCommand } from "./commands/context.js";

const program = new Command();

program
  .name("dilipod")
  .description("cellar CLI — desktop agent runtime powered by CEL")
  .version("0.1.0");

program.addCommand(adapterCommand);
program.addCommand(workflowCommand);
program.addCommand(runCommand);
program.addCommand(statusCommand);
program.addCommand(trainCommand);
program.addCommand(captureCommand);
program.addCommand(contextCommand);

program
  .command("live-view")
  .description("Start the local live view server")
  .option("-p, --port <port>", "Server port", "6080")
  .option("--host <host>", "Bind address", "127.0.0.1")
  .action((opts) => {
    console.log(`Starting live view at ws://${opts.host}:${opts.port}...`);
    console.log("Open a browser to see the agent's screen and context feed.");
    console.log("Press Ctrl+C to stop.");
    // TODO: Start LiveViewServer with real screen streaming
  });

program.parse();
