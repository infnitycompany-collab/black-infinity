import { defineConfig } from "@playwright/test";
process.env.BI_E2E_DIR ||= `.data/e2e-${crypto.randomUUID()}`;
export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  timeout: 300000,
  expect: { timeout: 15000 },
  use: {
    baseURL: "http://localhost:3100",
    headless: true,
    actionTimeout: 20000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { channel: "chromium-headless-shell", args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--auto-select-desktop-capture-source=Entire screen", "--enable-usermedia-screen-capturing"] },
  },
  globalSetup: "./tests/e2e/setup.ts",
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      DATA_DIR: process.env.BI_E2E_DIR,
      APP_ORIGIN: "http://localhost:3100",
      RP_ID: "localhost",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
