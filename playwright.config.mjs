import { defineConfig, devices } from "@playwright/test";

const port = 8080;

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
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "server", testMatch: /(functions|server)\.spec/ },
    { name: "chromium", testMatch: /render\.spec/, use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", testMatch: /render\.spec/, use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", testMatch: /render\.spec/, use: { ...devices["Desktop Safari"] } },
  ],
});
