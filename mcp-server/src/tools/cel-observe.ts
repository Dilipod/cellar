import { z } from "zod";
import type { Cel, ScreenContext, ContextElement, CelEvent } from "@cellar/agent";

const inputSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("snapshot"),
  }),
  z.object({
    mode: z.literal("wait_for_element"),
    element_type: z.string().optional().describe("Required element type (e.g. button, input)"),
    label_contains: z.string().optional().describe("Element label must contain this text"),
    timeout_ms: z.number().default(10000).describe("Max wait time in milliseconds"),
    poll_interval_ms: z.number().default(500).describe("Poll interval in milliseconds"),
  }),
  z.object({
    mode: z.literal("wait_for_idle"),
    timeout_ms: z.number().default(10000).describe("Max wait time in milliseconds"),
    poll_interval_ms: z.number().default(500).describe("Poll interval in milliseconds"),
  }),
  z.object({
    mode: z.literal("watch"),
    events: z
      .array(z.enum(["tree_changed", "network_idle", "focus_changed"]))
      .describe("Event types to watch for"),
    timeout_ms: z.number().default(30000).describe("Max wait time in milliseconds"),
    poll_interval_ms: z.number().default(200).describe("Poll interval in milliseconds"),
  }),
]);

type Input = z.infer<typeof inputSchema>;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function elementMatches(
  el: ContextElement,
  elementType?: string,
  labelContains?: string
): boolean {
  if (elementType && el.element_type !== elementType) return false;
  if (labelContains) {
    const label = (el.label ?? "").toLowerCase();
    if (!label.includes(labelContains.toLowerCase())) return false;
  }
  return true;
}

function contextFingerprint(ctx: ScreenContext): string {
  return ctx.elements
    .map((el) => `${el.id}:${el.label ?? ""}:${el.element_type}`)
    .join("|");
}

async function handleCelObserve(cel: Cel, args: Input) {
  try {
    switch (args.mode) {
      case "snapshot": {
        const ctx = cel.getContext();
        return {
          content: [{ type: "text" as const, text: JSON.stringify(ctx, null, 2) }],
        };
      }

      case "wait_for_element": {
        const deadline = Date.now() + args.timeout_ms;
        while (Date.now() < deadline) {
          const ctx = cel.getContext();
          const match = ctx.elements.find((el) =>
            elementMatches(el, args.element_type, args.label_contains)
          );
          if (match) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      found: true,
                      element: match,
                      context_summary: {
                        app: ctx.app,
                        window: ctx.window,
                        total_elements: ctx.elements.length,
                      },
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }
          await sleep(args.poll_interval_ms);
        }
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  found: false,
                  reason: `No matching element found within ${args.timeout_ms}ms`,
                  criteria: {
                    element_type: args.element_type,
                    label_contains: args.label_contains,
                  },
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }

      case "wait_for_idle": {
        const deadline = Date.now() + args.timeout_ms;
        let lastFingerprint = "";

        while (Date.now() < deadline) {
          const ctx = cel.getContext();
          const fp = contextFingerprint(ctx);
          if (fp === lastFingerprint && lastFingerprint !== "") {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      idle: true,
                      context: ctx,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }
          lastFingerprint = fp;
          await sleep(args.poll_interval_ms);
        }
        // Return last context even on timeout
        const ctx = cel.getContext();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  idle: false,
                  reason: `Context still changing after ${args.timeout_ms}ms`,
                  context: ctx,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "watch": {
        cel.startWatchdog();
        const deadline = Date.now() + args.timeout_ms;
        const wantedTypes = new Set(args.events.map((e: string) => {
          switch (e) {
            case "tree_changed": return "TreeChanged";
            case "network_idle": return "NetworkIdle";
            case "focus_changed": return "FocusChanged";
            default: return e;
          }
        }));

        while (Date.now() < deadline) {
          const events = cel.pollEvents();
          const matching = events.filter((e: CelEvent) => wantedTypes.has(e.type));
          if (matching.length > 0) {
            const ctx = cel.getContext();
            cel.stopWatchdog();
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    { events: matching, context: ctx },
                    null,
                    2
                  ),
                },
              ],
            };
          }
          await sleep(args.poll_interval_ms);
        }
        cel.stopWatchdog();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  events: [],
                  reason: `No matching events within ${args.timeout_ms}ms`,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
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

export { inputSchema as celObserveSchema, handleCelObserve };
