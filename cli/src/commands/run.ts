import { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  Cel,
  WorkflowEngine,
  loadWorkflow,
  importWorkflow,
  executeAction,
  type EngineCallbacks,
  type ScreenContext,
} from "@cellar/agent";

export const runCommand = new Command("run")
  .description("Execute a workflow")
  .argument("<workflow>", "Workflow name, JSON file path, or .dilipod file")
  .option("--priority <level>", "Queue priority (low|normal|high|critical)", "normal")
  .option("--dry-run", "Validate without executing")
  .action((workflowArg: string, opts: { priority: string; dryRun?: boolean }) => {
    // Resolve workflow source
    let workflowPath = workflowArg;
    if (!fs.existsSync(workflowPath)) {
      // Try default workflows directory
      const home = process.env.HOME ?? ".";
      const defaultPath = path.join(home, ".cellar", "workflows", `${workflowArg}.json`);
      if (fs.existsSync(defaultPath)) {
        workflowPath = defaultPath;
      } else {
        console.error(`Workflow not found: ${workflowArg}`);
        console.error("Provide a file path or a workflow name in ~/.cellar/workflows/");
        process.exit(1);
      }
    }

    const workflow = workflowPath.endsWith(".dilipod")
      ? importWorkflow(workflowPath)
      : loadWorkflow(workflowPath);

    console.log(`Workflow: ${workflow.name}`);
    console.log(`  Steps: ${workflow.steps.length}`);
    console.log(`  App: ${workflow.app}`);

    if (opts.dryRun) {
      console.log("\nDry run — workflow validated successfully.");
      return;
    }

    const cel = new Cel();
    if (!cel.isNativeAvailable) {
      console.error("Error: CEL native module not available.");
      process.exit(1);
    }

    const runId = cel.startRun(workflow.name, workflow.steps.length);
    console.log(`\nStarting run #${runId} with priority ${opts.priority}...`);

    let lastContext: ScreenContext = { app: "", window: "", elements: [], timestamp_ms: 0 };

    const callbacks: EngineCallbacks = {
      getContext: async () => {
        lastContext = cel.getContext();
        return lastContext;
      },
      executeAction: async (step) => {
        console.log(`  [${step.id}] ${step.description}`);
        const maxConf = lastContext.elements.length > 0
          ? Math.max(...lastContext.elements.map((e) => e.confidence))
          : 0;
        try {
          const success = await executeAction(cel, step, lastContext);
          cel.logStep(
            runId,
            workflow.steps.indexOf(step),
            step.id,
            JSON.stringify(step.action),
            success,
            maxConf,
            JSON.stringify({ app: lastContext.app, window: lastContext.window, elementCount: lastContext.elements.length }),
          );
          return success;
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          cel.logStep(
            runId,
            workflow.steps.indexOf(step),
            step.id,
            JSON.stringify(step.action),
            false,
            maxConf,
            undefined,
            errMsg,
          );
          throw err;
        }
      },
      onPause: async (step, ctx) => {
        console.log(`  PAUSED at step ${step.id}: low confidence`);
        console.log("  Waiting 3s before retrying (Ctrl+C to abort)...");
        await new Promise((resolve) => setTimeout(resolve, 3000));
      },
      onStepComplete: (step, idx) => {
        console.log(`  Step ${idx + 1}/${workflow.steps.length}: ${step.description}`);
      },
      onComplete: (wf, status) => {
        cel.finishRun(runId, status as "completed" | "failed");
        console.log(`\nWorkflow "${wf.name}" ${status}.`);
        engine.stop();
      },
      onLog: (level, msg) => {
        if (level === "error") console.error(`  [ERROR] ${msg}`);
        else if (level === "warn") console.warn(`  [WARN] ${msg}`);
      },
    };

    const engine = new WorkflowEngine(callbacks);
    engine.submit(workflow, opts.priority as "low" | "normal" | "high" | "critical");
    engine.start().catch((err) => {
      console.error(`Engine error: ${err}`);
      process.exit(1);
    });
  });
