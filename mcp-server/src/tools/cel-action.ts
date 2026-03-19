import { z } from "zod";
import type { Cel, ContextReference } from "@cellar/agent";

const singleActionSchema = z.object({
  action: z.enum([
    "click",
    "right_click",
    "double_click",
    "type",
    "key_press",
    "key_combo",
    "scroll",
    "mouse_move",
  ]),
  x: z.number().optional().describe("X coordinate (for click/move actions). Not needed if target_ref is provided."),
  y: z.number().optional().describe("Y coordinate (for click/move actions). Not needed if target_ref is provided."),
  target_ref: z
    .object({
      element_type: z.string(),
      label: z.string().optional(),
      ancestor_path: z.array(z.string()).optional(),
      bounds_region: z
        .object({
          quadrant: z.string(),
          relative_x: z.number(),
          relative_y: z.number(),
        })
        .optional(),
      value_pattern: z.string().optional(),
    })
    .optional()
    .describe(
      "A ContextReference to target. If provided, CEL resolves the element and clicks its center. " +
      "Get references from cel_context tool with mode 'make_reference'."
    ),
  text: z.string().optional().describe("Text to type (for type action)"),
  key: z.string().optional().describe("Key name (for key_press action, e.g. Enter, Tab)"),
  keys: z
    .array(z.string())
    .optional()
    .describe("Key names (for key_combo action, e.g. ['Ctrl', 'C'])"),
  dx: z.number().optional().describe("Horizontal scroll amount (for scroll action)"),
  dy: z.number().optional().describe("Vertical scroll amount (for scroll action)"),
});

const inputSchema = z.union([
  singleActionSchema.describe("Execute a single action"),
  z.object({
    actions: z
      .array(singleActionSchema)
      .min(1)
      .max(4)
      .describe(
        "Array of 1-4 actions to execute sequentially. " +
        "Max 4 per batch — larger batches miss intermediate state changes. " +
        "Re-observe with cel_context between batches."
      ),
    delay_between_ms: z
      .number()
      .default(100)
      .describe("Delay between actions in milliseconds"),
  }),
]);

type SingleAction = z.infer<typeof singleActionSchema>;
type Input = z.infer<typeof inputSchema>;

/** Resolve coordinates: use target_ref if provided, otherwise use explicit x/y. */
function resolveCoords(
  cel: Cel,
  action: SingleAction,
): { x: number; y: number; label: string } {
  if (action.target_ref) {
    const ctx = cel.getContext();
    const resolved = cel.resolveReference(ctx, action.target_ref as ContextReference);
    if (!resolved) {
      throw new Error(
        `Could not find element matching reference: ${JSON.stringify(action.target_ref)}`
      );
    }
    if (!resolved.bounds) {
      throw new Error(
        `Resolved element "${resolved.label ?? resolved.id}" has no bounds`
      );
    }
    const x = resolved.bounds.x + Math.floor(resolved.bounds.width / 2);
    const y = resolved.bounds.y + Math.floor(resolved.bounds.height / 2);
    return { x, y, label: resolved.label ?? resolved.id };
  }
  if (action.x === undefined || action.y === undefined) {
    throw new Error(`${action.action} requires x and y, or target_ref`);
  }
  return { x: action.x, y: action.y, label: `(${action.x}, ${action.y})` };
}

function executeSingle(cel: Cel, action: SingleAction): string {
  switch (action.action) {
    case "click": {
      const { x, y, label } = resolveCoords(cel, action);
      cel.click(x, y);
      return `Clicked ${label} at (${x}, ${y})`;
    }

    case "right_click": {
      const { x, y, label } = resolveCoords(cel, action);
      cel.rightClick(x, y);
      return `Right-clicked ${label} at (${x}, ${y})`;
    }

    case "double_click": {
      const { x, y, label } = resolveCoords(cel, action);
      cel.doubleClick(x, y);
      return `Double-clicked ${label} at (${x}, ${y})`;
    }

    case "type":
      if (!action.text) throw new Error("type requires text");
      cel.typeText(action.text);
      return `Typed "${action.text}"`;

    case "key_press":
      if (!action.key) throw new Error("key_press requires key");
      cel.keyPress(action.key);
      return `Pressed key: ${action.key}`;

    case "key_combo":
      if (!action.keys || action.keys.length === 0)
        throw new Error("key_combo requires keys array");
      cel.keyCombo(action.keys);
      return `Pressed combo: ${action.keys.join("+")}`;

    case "scroll":
      cel.scroll(action.dx ?? 0, action.dy ?? 0);
      return `Scrolled (${action.dx ?? 0}, ${action.dy ?? 0})`;

    case "mouse_move": {
      const { x, y, label } = resolveCoords(cel, action);
      cel.mouseMove(x, y);
      return `Moved mouse to ${label} at (${x}, ${y})`;
    }

    default:
      throw new Error(`Unknown action: ${action.action}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function handleCelAction(cel: Cel, args: Input) {
  try {
    if ("actions" in args) {
      const results: string[] = [];
      const delay = args.delay_between_ms ?? 100;
      for (let i = 0; i < args.actions.length; i++) {
        results.push(executeSingle(cel, args.actions[i]));
        if (i < args.actions.length - 1 && delay > 0) {
          await sleep(delay);
        }
      }
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ success: true, results }, null, 2),
          },
        ],
      };
    } else {
      const result = executeSingle(cel, args);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ success: true, result }, null, 2),
          },
        ],
      };
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

export { inputSchema as celActionSchema, handleCelAction };
