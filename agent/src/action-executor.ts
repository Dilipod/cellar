/**
 * Action Executor — maps WorkflowStep actions to CEL input calls.
 *
 * This is the "glue" that translates declarative workflow actions
 * into real desktop input via the Cel native bindings.
 */

import type { Cel } from "./cel-bindings.js";
import type { WorkflowStep, WorkflowAction, ScreenContext } from "./types.js";

/**
 * Find the screen coordinates for a target element by searching the context.
 * Returns the center point of the element's bounds if found.
 */
function resolveTarget(
  target: string,
  context: ScreenContext,
): { x: number; y: number } | null {
  // Search by ID first, then by label
  const el =
    context.elements.find((e) => e.id === target) ??
    context.elements.find(
      (e) => e.label?.toLowerCase() === target.toLowerCase(),
    );

  if (!el?.bounds) return null;

  return {
    x: el.bounds.x + Math.floor(el.bounds.width / 2),
    y: el.bounds.y + Math.floor(el.bounds.height / 2),
  };
}

/**
 * Execute a single workflow action using the Cel native bindings.
 * Returns true on success, throws on failure.
 */
export async function executeAction(
  cel: Cel,
  step: WorkflowStep,
  context: ScreenContext,
): Promise<boolean> {
  const action = step.action;

  switch (action.type) {
    case "click": {
      const pos = resolveTarget(action.target, context);
      if (!pos) {
        throw new Error(
          `Target element not found: "${action.target}" for step "${step.id}"`,
        );
      }
      if (action.button === "right") {
        cel.rightClick(pos.x, pos.y);
      } else {
        cel.click(pos.x, pos.y);
      }
      return true;
    }

    case "type": {
      const pos = resolveTarget(action.target, context);
      if (!pos) {
        throw new Error(
          `Target element not found: "${action.target}" for step "${step.id}"`,
        );
      }
      // Click the target field first, then type
      cel.click(pos.x, pos.y);
      await sleep(100); // Brief pause for focus
      cel.typeText(action.text);
      return true;
    }

    case "key": {
      cel.keyPress(action.key);
      return true;
    }

    case "key_combo": {
      cel.keyCombo(action.keys);
      return true;
    }

    case "wait": {
      await sleep(action.ms);
      return true;
    }

    case "scroll": {
      cel.scroll(action.dx, action.dy);
      return true;
    }

    case "custom": {
      // Custom actions are adapter-specific — log and skip for now
      console.warn(
        `Custom action "${action.action}" on adapter "${action.adapter}" — not yet wired to adapters`,
      );
      return true;
    }

    default: {
      const _exhaustive: never = action;
      throw new Error(`Unknown action type: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
