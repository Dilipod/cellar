import { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  Cel,
  WorkflowEngine,
  loadWorkflow,
  importWorkflow,
  type EngineCallbacks,
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

    const callbacks: EngineCallbacks = {
      getContext: async () => cel.getContext(),
      executeAction: async (step) => {
        console.log(`  [${step.id}] ${step.description}`);
        // TODO: Map step.action to cel input calls
        return true;
      },
      onPause: async (step, ctx) => {
        console.log(`  PAUSED at step ${step.id}: low confidence`);
        console.log("  Press Enter to continue or Ctrl+C to abort...");
        // TODO: Wait for user input
      },
      onStepComplete: (step, idx) => {
        console.log(`  ✓ Step ${idx + 1}/${workflow.steps.length}: ${step.description}`);
      },
      onComplete: (wf, status) => {
        cel.finishRun(runId, status as "completed" | "failed");
        console.log(`\nWorkflow "${wf.name}" ${status}.`);
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
