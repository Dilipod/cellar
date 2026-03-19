import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Cel } from "@cellar/agent";
import { celContextSchema, handleCelContext } from "./tools/cel-context.js";
import { celActionSchema, handleCelAction } from "./tools/cel-action.js";
import { celKnowledgeSchema, handleCelKnowledge } from "./tools/cel-knowledge.js";
import { celObserveSchema, handleCelObserve } from "./tools/cel-observe.js";

export function createCelMcpServer(cel?: Cel): McpServer {
  const instance = cel ?? new Cel();

  if (!instance.isNativeAvailable) {
    throw new Error(
      "CEL native module not available. Make sure the cel-napi binary is built."
    );
  }

  const server = new McpServer({
    name: "cel",
    version: "0.1.0",
  });

  server.registerTool(
    "cel_context",
    {
      title: "CEL Screen Context",
      description:
        "Read the current screen context — fused from accessibility tree, vision, network, and native APIs. " +
        "Returns structured UI elements with types, labels, bounds, states, and confidence scores. " +
        'Use mode "full" (default) for screen context, "windows" for window list, "monitors" for monitor list.',
      inputSchema: celContextSchema,
    },
    async (args) => handleCelContext(instance, args)
  );

  server.registerTool(
    "cel_action",
    {
      title: "CEL Action",
      description:
        "Execute mouse/keyboard actions on the screen. " +
        "Supports: click, right_click, double_click, type, key_press, key_combo, scroll, mouse_move. " +
        "Pass a single action or an array of actions for batch execution.",
      inputSchema: celActionSchema,
    },
    async (args) => handleCelAction(instance, args)
  );

  server.registerTool(
    "cel_knowledge",
    {
      title: "CEL Knowledge",
      description:
        "Search, store, and retrieve knowledge from CEL's persistent store. " +
        'Modes: "search" (full-text search), "store" (save new knowledge), ' +
        '"history" (recent workflow runs), "memory" (get/set working memory).',
      inputSchema: celKnowledgeSchema,
    },
    async (args) => handleCelKnowledge(instance, args)
  );

  server.registerTool(
    "cel_observe",
    {
      title: "CEL Observe",
      description:
        "Observe and wait for screen state changes. " +
        'Modes: "snapshot" (single context capture), ' +
        '"wait_for_element" (poll until a matching element appears), ' +
        '"wait_for_idle" (poll until the screen stops changing).',
      inputSchema: celObserveSchema,
    },
    async (args) => handleCelObserve(instance, args)
  );

  return server;
}

export async function startStdioServer(cel?: Cel): Promise<void> {
  const server = createCelMcpServer(cel);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("CEL MCP server started (stdio transport)");
}
