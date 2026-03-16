import * as fs from "node:fs";
import * as path from "node:path";
import { RegistryClient } from "./client.js";

/** Install a workflow or adapter from the registry. */
export async function install(
  name: string,
  type: "workflow" | "adapter",
  targetDir: string,
): Promise<string> {
  const client = new RegistryClient();

  // Fetch metadata
  const entry = await client.get(name);
  if (!entry) {
    throw new Error(`Not found in registry: ${name}`);
  }

  if (entry.type !== type) {
    throw new Error(`"${name}" is a ${entry.type}, not a ${type}`);
  }

  // Download the package
  const data = await client.download(name, entry.version);

  // Determine install path
  const subdir = type === "workflow" ? "workflows" : "adapters";
  const installDir = path.join(targetDir, subdir);
  fs.mkdirSync(installDir, { recursive: true });

  const filename = `${name}.${type === "workflow" ? "json" : "tar.gz"}`;
  const filePath = path.join(installDir, filename);

  fs.writeFileSync(filePath, data);

  return filePath;
}

/** Export a workflow to a portable .dilipod archive. */
export function exportWorkflow(
  workflowPath: string,
  outputPath: string,
): void {
  if (!fs.existsSync(workflowPath)) {
    throw new Error(`Workflow file not found: ${workflowPath}`);
  }

  // Read the workflow JSON
  const content = fs.readFileSync(workflowPath, "utf-8");
  const workflow = JSON.parse(content);

  // Create the .dilipod package (JSON with metadata wrapper)
  const pkg = {
    format: "dilipod-workflow",
    version: 1,
    exported_at: new Date().toISOString(),
    workflow,
  };

  fs.writeFileSync(outputPath, JSON.stringify(pkg, null, 2), "utf-8");
}

/** Import a workflow from a .dilipod file. */
export function importWorkflow(
  filePath: string,
  targetDir: string,
): string {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const pkg = JSON.parse(content);

  if (pkg.format !== "dilipod-workflow") {
    throw new Error(`Invalid .dilipod file: missing format header`);
  }

  const workflow = pkg.workflow;
  if (!workflow?.name) {
    throw new Error(`Invalid .dilipod file: missing workflow name`);
  }

  // Save to target directory
  const outputDir = path.join(targetDir, "workflows");
  fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, `${workflow.name}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(workflow, null, 2), "utf-8");

  return outputPath;
}
