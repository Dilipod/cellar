import { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";

/** Known built-in adapters with their metadata. */
const BUILTIN_ADAPTERS = [
  { name: "excel", display: "Microsoft Excel", platforms: "windows", versions: "2016, 2019, 2021, 365" },
  { name: "sap-gui", display: "SAP GUI", platforms: "windows", versions: "7.x+" },
  { name: "metatrader", display: "MetaTrader 4/5", platforms: "windows", versions: "MT4, MT5" },
  { name: "bloomberg", display: "Bloomberg Terminal", platforms: "windows", versions: "BLPAPI 3.x" },
];

export const adapterCommand = new Command("adapter")
  .description("Manage CEL adapters");

adapterCommand
  .command("install <name>")
  .description("Install an adapter from the registry")
  .action(async (name: string) => {
    const builtin = BUILTIN_ADAPTERS.find((a) => a.name === name);
    if (builtin) {
      console.log(`"${name}" is a built-in adapter (${builtin.display}).`);
      console.log(`Platforms: ${builtin.platforms}`);
      console.log(`It's already included in the CEL runtime — no installation needed.`);
      return;
    }

    console.log(`Searching registry for adapter "${name}"...`);
    try {
      const { RegistryClient } = await import("@cellar/registry");
      const client = new RegistryClient();
      const entry = await client.get(name);
      if (!entry) {
        console.error(`Adapter "${name}" not found in the registry.`);
        console.error(`Use "dilipod adapter list" to see available adapters.`);
        process.exit(1);
      }
      console.log(`Found: ${entry.name} v${entry.version} by ${entry.author}`);
      console.log(`Description: ${entry.description}`);
      // Download would happen here
    } catch {
      console.error("Registry not reachable. Check your connection.");
      process.exit(1);
    }
  });

adapterCommand
  .command("list")
  .description("List available adapters")
  .action(() => {
    console.log("\nBuilt-in adapters:\n");
    console.log("  Name           Display Name         Platforms   Versions");
    console.log("  " + "-".repeat(70));
    for (const a of BUILTIN_ADAPTERS) {
      console.log(
        `  ${a.name.padEnd(14)} ${a.display.padEnd(20)} ${a.platforms.padEnd(11)} ${a.versions}`,
      );
    }

    // Check for community-installed adapters
    const home = process.env.HOME ?? ".";
    const adapterDir = path.join(home, ".cellar", "adapters");
    if (fs.existsSync(adapterDir)) {
      const installed = fs.readdirSync(adapterDir).filter((f) => !f.startsWith("."));
      if (installed.length > 0) {
        console.log("\nCommunity adapters:");
        for (const name of installed) {
          console.log(`  ${name}`);
        }
      }
    }
  });

adapterCommand
  .command("search <query>")
  .description("Search the adapter registry")
  .action(async (query: string) => {
    console.log(`Searching adapters for "${query}"...`);

    // Check builtins first
    const matches = BUILTIN_ADAPTERS.filter(
      (a) =>
        a.name.includes(query.toLowerCase()) ||
        a.display.toLowerCase().includes(query.toLowerCase()),
    );
    if (matches.length > 0) {
      console.log("\nBuilt-in matches:");
      for (const a of matches) {
        console.log(`  ${a.name} — ${a.display} (${a.platforms})`);
      }
    }

    // Search registry
    try {
      const { RegistryClient } = await import("@cellar/registry");
      const client = new RegistryClient();
      const results = await client.search(query, "adapter");
      if (results.entries.length > 0) {
        console.log("\nRegistry results:");
        for (const e of results.entries) {
          console.log(`  ${e.name} v${e.version} — ${e.description} (${e.downloads} downloads)`);
        }
      } else if (matches.length === 0) {
        console.log("No adapters found.");
      }
    } catch {
      if (matches.length === 0) {
        console.log("Registry not reachable. Showing built-in adapters only.");
      }
    }
  });

adapterCommand
  .command("info <name>")
  .description("Show detailed adapter information")
  .action((name: string) => {
    const builtin = BUILTIN_ADAPTERS.find((a) => a.name === name);
    if (builtin) {
      console.log(`\n${builtin.display} (${builtin.name})`);
      console.log(`  Platforms: ${builtin.platforms}`);
      console.log(`  Versions:  ${builtin.versions}`);
      console.log(`  Type:      built-in`);
      console.log(`  Status:    ${builtin.platforms === process.platform ? "available" : "not available on this platform"}`);
    } else {
      console.log(`Adapter "${name}" not found. Use "dilipod adapter list" to see available adapters.`);
    }
  });
