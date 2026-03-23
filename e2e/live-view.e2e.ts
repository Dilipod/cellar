/**
 * Live View E2E Tests
 *
 * Tests the full live-view server lifecycle:
 * - HTTP server serves the web UI
 * - WebSocket streams PNG frames to connected browsers
 * - WebSocket streams context updates as JSON
 * - Control messages (pause, resume, takeover, stop) are broadcast as intents
 * - Multiple clients receive the same stream
 * - Graceful server shutdown cleans up all connections
 */
import { test, expect, type Page } from "@playwright/test";
import { LiveViewServer } from "@cellar/live-view";
import { WebSocket } from "ws";
import {
  createTestPng,
  editorContext,
  browserContext,
  sparseContext,
} from "./fixtures/mock-context.js";

// Use a random port to avoid collisions when running tests in parallel
let port: number;
let server: LiveViewServer;

function serverUrl() {
  return `http://127.0.0.1:${port}`;
}

function wsUrl() {
  return `ws://127.0.0.1:${port}`;
}

test.beforeEach(async () => {
  port = 10000 + Math.floor(Math.random() * 50000);
  server = new LiveViewServer({ port, host: "127.0.0.1", captureIntervalMs: 50 });
});

test.afterEach(async () => {
  server.stop();
  // Give sockets time to close
  await new Promise((r) => setTimeout(r, 100));
});

// ---------------------------------------------------------------------------
// HTTP Server
// ---------------------------------------------------------------------------

test.describe("HTTP Server", () => {
  test("serves the live view HTML page", async ({ page }) => {
    server.start(() => createTestPng(), () => editorContext());
    await page.goto(serverUrl());

    await expect(page.locator("h1")).toHaveText("Dilipod Live View");
    await expect(page.locator("#status")).toBeVisible();
  });

  test("has control buttons (pause, resume, take over, stop)", async ({ page }) => {
    server.start();
    await page.goto(serverUrl());

    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Take Over" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  });

  test("shows 'Connected' status after WebSocket connects", async ({ page }) => {
    server.start();
    await page.goto(serverUrl());

    await expect(page.locator("#status")).toHaveText("Connected", { timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// WebSocket Screen Streaming
// ---------------------------------------------------------------------------

test.describe("Screen Streaming", () => {
  test("streams PNG frames to connected browser", async ({ page }) => {
    let frameCount = 0;
    server.start(() => createTestPng(), () => editorContext());
    await page.goto(serverUrl());

    // Wait for the screen image to update — it should have a blob: src
    await expect(page.locator("#screen")).toHaveAttribute("src", /blob:/, {
      timeout: 5000,
    });
  });

  test("streams PNG frames over raw WebSocket", async () => {
    server.start(() => createTestPng(), () => editorContext());

    const frames: Buffer[] = [];
    const ws = new WebSocket(wsUrl());

    await new Promise<void>((resolve, reject) => {
      ws.on("open", () => {});
      ws.on("message", (data) => {
        if (Buffer.isBuffer(data)) {
          frames.push(data);
          if (frames.length >= 3) {
            ws.close();
            resolve();
          }
        }
      });
      ws.on("error", reject);
      setTimeout(() => {
        ws.close();
        resolve();
      }, 5000);
    });

    expect(frames.length).toBeGreaterThanOrEqual(3);
    // Each frame should start with PNG magic bytes
    for (const frame of frames) {
      expect(frame[0]).toBe(0x89);
      expect(frame[1]).toBe(0x50); // 'P'
      expect(frame[2]).toBe(0x4e); // 'N'
      expect(frame[3]).toBe(0x47); // 'G'
    }
  });

  test("streams context updates as JSON", async () => {
    server.start(() => createTestPng(), () => editorContext());

    const contextMessages: Array<{ type: string; data: unknown }> = [];
    const ws = new WebSocket(wsUrl());

    await new Promise<void>((resolve) => {
      ws.on("message", (data) => {
        if (typeof data === "string" || (Buffer.isBuffer(data) && data[0] === 0x7b)) {
          try {
            const msg = JSON.parse(data.toString());
            if (msg.type === "context") {
              contextMessages.push(msg);
              if (contextMessages.length >= 2) {
                ws.close();
                resolve();
              }
            }
          } catch {
            // Binary frame, skip
          }
        }
      });
      setTimeout(() => { ws.close(); resolve(); }, 5000);
    });

    expect(contextMessages.length).toBeGreaterThanOrEqual(1);
    const ctx = contextMessages[0].data as { app: string; elements: unknown[] };
    expect(ctx.app).toBe("VS Code");
    expect(ctx.elements.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Control Messages
// ---------------------------------------------------------------------------

test.describe("Control Messages", () => {
  test("pause button broadcasts 'paused' intent to all clients", async ({ page }) => {
    server.start();
    await page.goto(serverUrl());
    await expect(page.locator("#status")).toHaveText("Connected", { timeout: 5000 });

    // Connect a second WebSocket to observe the intent broadcast
    const intents: string[] = [];
    const observer = new WebSocket(wsUrl());
    await new Promise<void>((resolve) => {
      observer.on("open", resolve);
    });
    observer.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "intent") intents.push(msg.data.intent);
      } catch {}
    });

    // Click pause in the browser
    await page.getByRole("button", { name: "Pause" }).click();
    await page.waitForTimeout(300);

    expect(intents).toContain("paused");
    observer.close();
  });

  test("stop button broadcasts 'stopped' intent", async ({ page }) => {
    server.start();
    await page.goto(serverUrl());
    await expect(page.locator("#status")).toHaveText("Connected", { timeout: 5000 });

    const intents: string[] = [];
    const observer = new WebSocket(wsUrl());
    await new Promise<void>((resolve) => {
      observer.on("open", resolve);
    });
    observer.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "intent") intents.push(msg.data.intent);
      } catch {}
    });

    await page.getByRole("button", { name: "Stop" }).click();
    await page.waitForTimeout(300);

    expect(intents).toContain("stopped");
    observer.close();
  });

  test("takeover button broadcasts 'takeover' intent", async ({ page }) => {
    server.start();
    await page.goto(serverUrl());
    await expect(page.locator("#status")).toHaveText("Connected", { timeout: 5000 });

    const intents: string[] = [];
    const observer = new WebSocket(wsUrl());
    await new Promise<void>((resolve) => {
      observer.on("open", resolve);
    });
    observer.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "intent") intents.push(msg.data.intent);
      } catch {}
    });

    await page.getByRole("button", { name: "Take Over" }).click();
    await page.waitForTimeout(300);

    expect(intents).toContain("takeover");
    observer.close();
  });
});

// ---------------------------------------------------------------------------
// Multi-Client
// ---------------------------------------------------------------------------

test.describe("Multi-Client", () => {
  test("multiple WebSocket clients receive the same frames", async () => {
    server.start(() => createTestPng(), () => editorContext());

    const client1Frames: number[] = [];
    const client2Frames: number[] = [];

    const ws1 = new WebSocket(wsUrl());
    const ws2 = new WebSocket(wsUrl());

    const done = new Promise<void>((resolve) => {
      let resolved = false;
      const check = () => {
        if (!resolved && client1Frames.length >= 2 && client2Frames.length >= 2) {
          resolved = true;
          ws1.close();
          ws2.close();
          resolve();
        }
      };

      ws1.on("message", (data) => {
        if (Buffer.isBuffer(data)) { client1Frames.push(data.length); check(); }
      });
      ws2.on("message", (data) => {
        if (Buffer.isBuffer(data)) { client2Frames.push(data.length); check(); }
      });

      setTimeout(() => { ws1.close(); ws2.close(); resolve(); }, 5000);
    });

    await done;

    expect(client1Frames.length).toBeGreaterThanOrEqual(2);
    expect(client2Frames.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Context Feed Display
// ---------------------------------------------------------------------------

test.describe("Context Feed", () => {
  test("context updates appear in the feed panel", async ({ page }) => {
    server.start(() => createTestPng(), () => editorContext());
    await page.goto(serverUrl());

    // Wait for context entries to appear in the feed
    await expect(page.locator(".context-feed .entry")).toHaveCount(1, {
      timeout: 5000,
    });

    // The entry should show element count and app name
    const firstEntry = page.locator(".context-feed .entry").first();
    await expect(firstEntry).toContainText("VS Code");
  });

  test("intent broadcasts appear in the feed as styled entries", async ({ page }) => {
    server.start(() => createTestPng(), () => editorContext());
    await page.goto(serverUrl());
    await expect(page.locator("#status")).toHaveText("Connected", { timeout: 5000 });

    // Send a pause to trigger an intent entry
    await page.getByRole("button", { name: "Pause" }).click();
    await page.waitForTimeout(500);

    // Intent entries have the .intent class
    const intentEntry = page.locator(".context-feed .entry.intent");
    await expect(intentEntry).toHaveCount(1, { timeout: 3000 });
    await expect(intentEntry).toContainText("paused");
  });
});

// ---------------------------------------------------------------------------
// Server Lifecycle
// ---------------------------------------------------------------------------

test.describe("Server Lifecycle", () => {
  test("stop() cleanly closes all connections", async () => {
    server.start(() => createTestPng(), () => editorContext());

    const ws = new WebSocket(wsUrl());
    const closed = new Promise<void>((resolve) => {
      ws.on("close", () => resolve());
    });
    await new Promise<void>((resolve) => {
      ws.on("open", resolve);
    });

    server.stop();
    await closed;
  });

  test("server works without capture callback", async ({ page }) => {
    server.start(); // No callbacks — UI only
    await page.goto(serverUrl());

    await expect(page.locator("h1")).toHaveText("Dilipod Live View");
    // Screen image should exist but have no src (no frames streamed)
    const src = await page.locator("#screen").getAttribute("src");
    expect(src).toBeFalsy();
  });

  test("broadcastContext sends context without capture callback", async () => {
    server.start(); // No capture

    const messages: unknown[] = [];
    const ws = new WebSocket(wsUrl());
    await new Promise<void>((resolve) => {
      ws.on("open", resolve);
    });

    ws.on("message", (data) => {
      try {
        messages.push(JSON.parse(data.toString()));
      } catch {}
    });

    // Manually broadcast context
    server.broadcastContext(browserContext());
    await new Promise((r) => setTimeout(r, 200));

    expect(messages.length).toBe(1);
    const msg = messages[0] as { type: string; data: { app: string } };
    expect(msg.type).toBe("context");
    expect(msg.data.app).toBe("Firefox");

    ws.close();
  });
});
