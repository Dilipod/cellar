import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RegistryClient, type RegistryEntry, type SearchResults } from "./client.js";
import { exportWorkflow, importWorkflow } from "./install.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// Mock global fetch for registry tests
const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RegistryClient", () => {
  it("should create with default URL", () => {
    const client = new RegistryClient();
    expect(client).toBeDefined();
  });

  it("should create with custom URL", () => {
    const client = new RegistryClient("https://custom-registry.example.com/api/v1");
    expect(client).toBeDefined();
  });

  it("should return empty search results when registry unreachable", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503 });
    const client = new RegistryClient();
    const results = await client.search("excel");
    expect(results.entries).toEqual([]);
    expect(results.total).toBe(0);
  });

  it("should parse search results", async () => {
    const mockResults: SearchResults = {
      entries: [{
        name: "excel-report",
        type: "workflow",
        description: "Monthly report",
        version: "1.0.0",
        author: "test",
        downloads: 100,
        tags: ["excel"],
        publishedAt: "2024-01-01",
      }],
      total: 1,
      page: 1,
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockResults,
    });

    const client = new RegistryClient();
    const results = await client.search("excel");
    expect(results.entries).toHaveLength(1);
    expect(results.entries[0].name).toBe("excel-report");
  });

  it("should return null for get when not found", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    const client = new RegistryClient();
    const entry = await client.get("nonexistent");
    expect(entry).toBeNull();
  });

  it("should parse get result", async () => {
    const mockEntry: RegistryEntry = {
      name: "excel-adapter",
      type: "adapter",
      description: "Excel integration",
      version: "1.0.0",
      author: "test",
      downloads: 50,
      tags: ["excel"],
      publishedAt: "2024-01-01",
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockEntry,
    });

    const client = new RegistryClient();
    const entry = await client.get("excel-adapter");
    expect(entry).not.toBeNull();
    expect(entry!.name).toBe("excel-adapter");
  });

  it("should throw on download failure", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    const client = new RegistryClient();
    await expect(client.download("nonexistent")).rejects.toThrow("Download failed");
  });

  it("should download package data", async () => {
    const content = Buffer.from("package-data");
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength),
    });

    const client = new RegistryClient();
    const data = await client.download("test-pkg", "1.0.0");
    expect(data).toBeInstanceOf(Buffer);
  });

  it("should search with type filter", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503 });
    const client = new RegistryClient();
    const results = await client.search("report", "workflow");
    expect(results.entries).toEqual([]);

    // Verify the URL includes type param
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("type=workflow"),
      expect.anything(),
    );
  });

  it("should ping and return false when unreachable", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));
    const client = new RegistryClient();
    const result = await client.ping();
    expect(result).toBe(false);
  });

  it("should ping and return true when reachable", async () => {
    mockFetch.mockResolvedValue({ ok: true });
    const client = new RegistryClient();
    const result = await client.ping();
    expect(result).toBe(true);
  });
});

describe("exportWorkflow / importWorkflow", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cellar-reg-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("should export and import a workflow", () => {
    // Create a mock workflow file
    const workflow = {
      name: "test-wf",
      description: "Test workflow",
      app: "TestApp",
      version: "1.0.0",
      steps: [{ id: "s1", description: "Click", action: { type: "click", target: "btn" } }],
      created_at: "2024-01-01",
      updated_at: "2024-01-01",
    };
    const srcPath = path.join(tempDir, "test-wf.json");
    fs.writeFileSync(srcPath, JSON.stringify(workflow));

    // Export
    const exportPath = path.join(tempDir, "test-wf.dilipod");
    exportWorkflow(srcPath, exportPath);
    expect(fs.existsSync(exportPath)).toBe(true);

    const exported = JSON.parse(fs.readFileSync(exportPath, "utf-8"));
    expect(exported.format).toBe("dilipod-workflow");
    expect(exported.workflow.name).toBe("test-wf");

    // Import
    const importDir = path.join(tempDir, "imported");
    const importedPath = importWorkflow(exportPath, importDir);
    expect(fs.existsSync(importedPath)).toBe(true);

    const imported = JSON.parse(fs.readFileSync(importedPath, "utf-8"));
    expect(imported.name).toBe("test-wf");
  });

  it("should throw for non-existent export source", () => {
    expect(() => exportWorkflow("/nonexistent", "/out")).toThrow("not found");
  });

  it("should throw for non-existent import source", () => {
    expect(() => importWorkflow("/nonexistent", "/out")).toThrow("not found");
  });

  it("should throw for invalid dilipod file", () => {
    const bad = path.join(tempDir, "bad.dilipod");
    fs.writeFileSync(bad, JSON.stringify({ wrong: "format" }));
    expect(() => importWorkflow(bad, tempDir)).toThrow("missing format");
  });
});

describe("RegistryEntry type", () => {
  it("should define valid entry structure", () => {
    const entry: RegistryEntry = {
      name: "excel-report",
      type: "workflow",
      description: "Monthly Excel report automation",
      version: "1.2.0",
      author: "dilipod",
      downloads: 1500,
      tags: ["excel", "reporting", "finance"],
      publishedAt: "2024-06-15T12:00:00Z",
    };
    expect(entry.name).toBe("excel-report");
    expect(entry.tags.length).toBe(3);
  });
});
