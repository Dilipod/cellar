import { describe, it, expect } from "vitest";
import { LiveViewServer } from "./server.js";

describe("LiveViewServer", () => {
  it("should create with default config", () => {
    const server = new LiveViewServer();
    expect(server).toBeDefined();
  });

  it("should create with custom config", () => {
    const server = new LiveViewServer({
      port: 9999,
      host: "0.0.0.0",
      captureIntervalMs: 500,
    });
    expect(server).toBeDefined();
  });

  it("should create with partial config", () => {
    const server = new LiveViewServer({ port: 7000 });
    expect(server).toBeDefined();
  });

  it("should start and stop without callbacks", () => {
    const server = new LiveViewServer({ port: 0 }); // port 0 = random
    server.start();
    server.stop();
    // Should not throw
  });

  it("should stop cleanly when not started", () => {
    const server = new LiveViewServer();
    server.stop(); // Should not throw
  });

  it("should stop cleanly when called multiple times", () => {
    const server = new LiveViewServer({ port: 0 });
    server.start();
    server.stop();
    server.stop(); // Second stop should be safe
  });
});
