import { Command } from "commander";

export const workflowCommand = new Command("workflow")
  .description("Manage workflows");

workflowCommand
  .command("install <name>")
  .description("Install a workflow from the registry")
  .action((name: string) => {
    console.log(`Installing workflow: ${name}...`);
    // TODO: RegistryClient.download + install
  });

workflowCommand
  .command("export <name>")
  .description("Export a workflow to a portable .dilipod file")
  .option("-o, --output <path>", "Output file path")
  .action((name: string, opts: { output?: string }) => {
    const output = opts.output ?? `./${name}.dilipod`;
    console.log(`Exporting workflow '${name}' to ${output}...`);
    // TODO: exportWorkflow
  });

workflowCommand
  .command("import <file>")
  .description("Import a workflow from a .dilipod file")
  .action((file: string) => {
    console.log(`Importing workflow from ${file}...`);
    // TODO: importWorkflow
  });

workflowCommand
  .command("list")
  .description("List installed workflows")
  .action(() => {
    console.log("Installed workflows:");
    console.log("  (none installed yet)");
    // TODO: Scan workflows directory
  });
