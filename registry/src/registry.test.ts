import { describe, it, expect } from "vitest";
import { RegistryClient, type RegistryEntry, type SearchResults } from "./client.js";
import { install } from "./install.js";

describe("RegistryClient", () => {
  it("should create with default URL", () => {
    const client = new RegistryClient();
    expect(client).toBeDefined();
  });

  it("should create with custom URL", () => {
    const client = new RegistryClient("https://custom-registry.example.com/api/v1");
    expect(client).toBeDefined();
  });

  it("should return empty search results (stub)", async () => {
    const client = new RegistryClient();
    const results = await client.search("excel");
    expect(results.entries).toEqual([]);
    expect(results.total).toBe(0);
    expect(results.page).toBe(1);
  });

  it("should return null for get (stub)", async () => {
    const client = new RegistryClient();
    const entry = await client.get("excel-adapter");
    expect(entry).toBeNull();
  });

  it("should throw on download (not implemented)", async () => {
    const client = new RegistryClient();
    await expect(client.download("test-wf")).rejects.toThrow("not yet implemented");
  });

  it("should search with type filter", async () => {
    const client = new RegistryClient();
    const results = await client.search("report", "workflow");
    expect(results.entries).toEqual([]);
  });
});

describe("install", () => {
  it("should throw for non-existent registry entry", async () => {
    await expect(install("nonexistent", "workflow", "/tmp")).rejects.toThrow(
      "Not found in registry"
    );
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
