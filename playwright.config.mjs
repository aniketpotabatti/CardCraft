import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./browser-tests",
  testMatch: "**/*.e2e.mjs",
  use: {
    baseURL: "http://127.0.0.1:5173",
    channel: process.env.CARDCRAFT_BROWSER_CHANNEL || undefined,
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5173 --strictPort",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
  },
});
