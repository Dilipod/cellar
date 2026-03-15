import { Command } from "commander";

export const runCommand = new Command("run")
  .description("Execute a workflow")
  .argument("<workflow>", "Workflow name or path")
  .option("--priority <level>", "Queue priority (low|normal|high|critical)", "normal")
  .option("--dry-run", "Validate without executing")
  .action((workflow: string, opts: { priority: string; dryRun?: boolean }) => {
    if (opts.dryRun) {
      console.log(`Dry run: validating workflow '${workflow}'...`);
      // TODO: Load and validate workflow
      return;
    }
    console.log(`Running workflow '${workflow}' with priority ${opts.priority}...`);
    // TODO: Load workflow, submit to WorkflowEngine
  });
