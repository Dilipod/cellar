import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "*.e2e.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "html",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "live-view",
      testMatch: "live-view.e2e.ts",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "agent-engine",
      testMatch: "agent-engine.e2e.ts",
    },
    {
      name: "recorder",
      testMatch: "recorder.e2e.ts",
    },
    {
      name: "context-pipeline",
      testMatch: "context-pipeline.e2e.ts",
    },
  ],
});
