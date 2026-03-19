import { z } from "zod";
import type { Cel } from "@cellar/agent";

const inputSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("search"),
    query: z.string().describe("Full-text search query"),
    workflow_scope: z
      .string()
      .optional()
      .describe("Limit to a specific workflow scope (omit for global)"),
    limit: z.number().default(10).describe("Max results"),
  }),
  z.object({
    mode: z.literal("store"),
    content: z.string().describe("Knowledge content to store"),
    source: z.string().describe("Source description (e.g. 'user', 'observation')"),
    workflow_scope: z
      .string()
      .optional()
      .describe("Workflow scope (omit for global knowledge)"),
    tags: z.string().optional().describe("Comma-separated tags"),
  }),
  z.object({
    mode: z.literal("history"),
    limit: z.number().default(10).describe("Number of recent runs to return"),
  }),
  z.object({
    mode: z.literal("memory"),
    workflow_name: z.string().describe("Workflow name to get/set working memory for"),
    content: z
      .string()
      .optional()
      .describe("If provided, updates working memory. If omitted, reads it."),
  }),
]);

type Input = z.infer<typeof inputSchema>;

function handleCelKnowledge(cel: Cel, args: Input) {
  try {
    switch (args.mode) {
      case "search": {
        const results = cel.searchKnowledge(
          args.query,
          args.workflow_scope,
          args.limit
        );
        return {
          content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
        };
      }
      case "store": {
        const id = cel.addScopedKnowledge(
          args.content,
          args.source,
          args.workflow_scope,
          args.tags
        );
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ success: true, knowledge_id: id }, null, 2),
            },
          ],
        };
      }
      case "history": {
        const runs = cel.getRunHistory(args.limit);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(runs, null, 2) }],
        };
      }
      case "memory": {
        if (args.content !== undefined) {
          cel.updateWorkingMemory(args.workflow_name, args.content);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ success: true, action: "updated" }, null, 2),
              },
            ],
          };
        } else {
          const memory = cel.getWorkingMemory(args.workflow_name);
          return {
            content: [{ type: "text" as const, text: memory || "(empty)" }],
          };
        }
      }
    }
  } catch (err) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      isError: true,
    };
  }
}

export { inputSchema as celKnowledgeSchema, handleCelKnowledge };
