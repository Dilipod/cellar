import { Command } from "commander";

export const mcpCommand = new Command("mcp")
  .description("Start the CEL MCP server for Claude Desktop / Cursor integration")
  .option("--sse", "Use SSE transport instead of stdio")
  .option("--port <port>", "Port for SSE transport", "3100")
  .action(async (opts) => {
    if (opts.sse) {
      console.error(
        `SSE transport not yet implemented. Use stdio (default) for now.`
      );
      process.exit(1);
    }

    // Import dynamically to avoid loading MCP deps at CLI startup
    const { startStdioServer } = await import("@cellar/mcp-server/server.js");
    await startStdioServer();
  })
  .addCommand(
    new Command("install")
      .description("Print Claude Desktop configuration snippet")
      .action(() => {
        const config = {
          mcpServers: {
            cel: {
              command: "npx",
              args: ["@cellar/cli", "mcp"],
            },
          },
        };
        console.log("Add this to your Claude Desktop config:");
        console.log(
          "  macOS: ~/Library/Application Support/Claude/claude_desktop_config.json"
        );
        console.log("  Linux: ~/.config/Claude/claude_desktop_config.json");
        console.log();
        console.log(JSON.stringify(config, null, 2));
      })
  );
