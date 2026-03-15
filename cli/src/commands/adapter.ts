import { Command } from "commander";

export const adapterCommand = new Command("adapter")
  .description("Manage CEL adapters");

adapterCommand
  .command("install <name>")
  .description("Install an adapter from the registry")
  .action((name: string) => {
    console.log(`Installing adapter: ${name}...`);
    // TODO: RegistryClient.download + install
  });

adapterCommand
  .command("list")
  .description("List installed adapters")
  .action(() => {
    console.log("Installed adapters:");
    console.log("  (none installed yet)");
    // TODO: Scan adapters directory
  });

adapterCommand
  .command("search <query>")
  .description("Search the adapter registry")
  .action((query: string) => {
    console.log(`Searching adapters for: ${query}...`);
    // TODO: RegistryClient.search
  });
