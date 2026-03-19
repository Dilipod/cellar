import { z } from "zod";
import type { Cel, ScreenContext } from "@cellar/agent";

const inputSchema = z.object({
  mode: z
    .enum(["full", "windows", "monitors", "make_reference", "focused"])
    .default("full")
    .describe(
      "What to return: full screen context, window list, monitor list, make_reference (stable ref from element ID), or focused (high-fidelity data for one element)"
    ),
  element_id: z
    .string()
    .optional()
    .describe("Element ID from a previous context snapshot (required for make_reference mode)"),
  filter: z
    .object({
      element_types: z
        .array(z.string())
        .optional()
        .describe("Only include elements of these types (e.g. button, input, link)"),
      min_confidence: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Minimum confidence threshold (0.0-1.0)"),
      detail: z
        .enum(["full", "compact", "actionable_only", "summary"])
        .optional()
        .default("full")
        .describe(
          "Detail level: full (all fields), compact (id+type+label+actions only, ~40% fewer tokens), " +
          "actionable_only (only enabled+visible elements with actions, compact format), " +
          "summary (element counts by type — use to decide if full fetch is needed)"
        ),
    })
    .optional()
    .describe("Filter elements in full mode"),
});

type Input = z.infer<typeof inputSchema>;

/** Strip an element down to compact fields only. */
function compactElement(el: ScreenContext["elements"][0]) {
  return {
    id: el.id,
    element_type: el.element_type,
    label: el.label,
    actions: el.actions,
  };
}

/** Redact password field values from element. */
function sanitizeElement(el: ScreenContext["elements"][0]) {
  if (el.element_type === "password" || el.element_type?.includes("password")) {
    return { ...el, value: undefined };
  }
  return el;
}

async function handleCelContext(cel: Cel, args: Input) {
  switch (args.mode) {
    case "windows": {
      const windows = cel.listWindows();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(windows, null, 2) }],
      };
    }
    case "monitors": {
      const monitors = cel.listMonitors();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(monitors, null, 2) }],
      };
    }
    case "focused": {
      if (!args.element_id) {
        return {
          content: [{ type: "text" as const, text: "Error: element_id is required for focused mode" }],
          isError: true,
        };
      }
      const focused = cel.getContextFocused(args.element_id);
      if (!focused) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: element "${args.element_id}" not found in current context`,
            },
          ],
          isError: true,
        };
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify(focused, null, 2) }],
      };
    }
    case "make_reference": {
      if (!args.element_id) {
        return {
          content: [{ type: "text" as const, text: "Error: element_id is required for make_reference mode" }],
          isError: true,
        };
      }
      const ctx = cel.getContext();
      const element = ctx.elements.find((el) => el.id === args.element_id);
      if (!element) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: element "${args.element_id}" not found in current context. ` +
                `Available IDs: ${ctx.elements.slice(0, 10).map((e) => e.id).join(", ")}`,
            },
          ],
          isError: true,
        };
      }
      const ref = cel.makeReference(element);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(ref, null, 2) }],
      };
    }
    case "full":
    default: {
      const ctx = cel.getContext();
      const detail = args.filter?.detail ?? "full";

      // Summary mode — just return counts
      if (detail === "summary") {
        const typeCounts: Record<string, number> = {};
        let actionableCount = 0;
        for (const el of ctx.elements) {
          typeCounts[el.element_type] = (typeCounts[el.element_type] || 0) + 1;
          if (el.state?.enabled && el.state?.visible && (el.actions?.length ?? 0) > 0) {
            actionableCount++;
          }
        }
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              app: ctx.app,
              window: ctx.window,
              element_count: ctx.elements.length,
              actionable_count: actionableCount,
              element_types: typeCounts,
              timestamp_ms: ctx.timestamp_ms,
            }, null, 2),
          }],
        };
      }

      // Filter elements by type and confidence
      let elements = ctx.elements;
      if (args.filter) {
        elements = elements.filter((el) => {
          if (
            args.filter!.element_types &&
            !args.filter!.element_types.includes(el.element_type)
          ) {
            return false;
          }
          if (
            args.filter!.min_confidence !== undefined &&
            el.confidence < args.filter!.min_confidence
          ) {
            return false;
          }
          return true;
        });
      }

      // Actionable-only: filter to enabled + visible + has actions
      if (detail === "actionable_only") {
        elements = elements.filter(
          (el) => el.state?.enabled && el.state?.visible && (el.actions?.length ?? 0) > 0
        );
      }

      // Apply detail level formatting
      if (detail === "compact" || detail === "actionable_only") {
        const compactCtx = {
          app: ctx.app,
          window: ctx.window,
          elements: elements.map(compactElement),
          timestamp_ms: ctx.timestamp_ms,
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(compactCtx, null, 2) }],
        };
      }

      // Full detail — sanitize password fields
      const result: ScreenContext & { page_content?: any } = {
        ...ctx,
        elements: elements.map(sanitizeElement),
      };

      // Enrich with CDP page content if available
      try {
        const pageContent = await cel.getCdpPageContent();
        if (pageContent) {
          result.page_content = {
            title: pageContent.title,
            url: pageContent.url,
            body_text: pageContent.body_text.length > 3000
              ? pageContent.body_text.slice(0, 3000) + "..."
              : pageContent.body_text,
            text_blocks: pageContent.text_blocks.slice(0, 50),
            interactive_elements: pageContent.interactive_elements.slice(0, 50),
          };
        }
      } catch {
        // CDP not available — that's fine, AX data is sufficient
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  }
}

export { inputSchema as celContextSchema, handleCelContext };
