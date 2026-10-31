import { defineConfig, devices } from "@playwright/test";

// A dedicated port, and never reuse a running server: the tests need their own environment (UA_ARRAY).
const port = 8181;

export default defineConfig({
  testDir: "tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL: `http://localhost:${port}` },
  webServer: {
    command: "node server/index.mjs",
    url: `http://localhost:${port}/edit`,
    env: { PORT: String(port), REQUEST_LOG: "silent", UA_ARRAY: "BlockedBot" },
    reuseExistingServer: false,
  },
  projects: [
    { name: "server", testMatch: /(functions|server)\.spec/ },
    { name: "chromium", testMatch: /render\.spec/, use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", testMatch: /render\.spec/, use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", testMatch: /render\.spec/, use: { ...devices["Desktop Safari"] } },
  ],
});
