import { RegistryClient } from "./client.js";

/** Install an adapter or workflow from the registry. */
export async function install(
  name: string,
  type: "workflow" | "adapter",
  targetDir: string
): Promise<void> {
  const client = new RegistryClient();
  const entry = await client.get(name);
  if (!entry) {
    throw new Error(`Not found in registry: ${name}`);
  }
  // TODO: Download, verify, extract to targetDir
  console.log(`Installing ${type} '${name}' to ${targetDir}...`);
}

/** Export a workflow to a portable .dilipod file. */
export async function exportWorkflow(
  workflowPath: string,
  outputPath: string
): Promise<void> {
  // TODO: Package workflow + context map into .dilipod archive
  console.log(`Exporting workflow from ${workflowPath} to ${outputPath}...`);
}

/** Import a workflow from a .dilipod file. */
export async function importWorkflow(
  filePath: string,
  targetDir: string
): Promise<void> {
  // TODO: Extract .dilipod archive, validate, install
  console.log(`Importing workflow from ${filePath} to ${targetDir}...`);
}
