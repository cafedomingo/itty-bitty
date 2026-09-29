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
    command: "node tests/server.mjs",
    url: `http://localhost:${port}/edit`,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "functions", testMatch: /functions\.spec/ },
    { name: "chromium", testMatch: /render\.spec/, use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", testMatch: /render\.spec/, use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", testMatch: /render\.spec/, use: { ...devices["Desktop Safari"] } },
  ],
});
