const fs = require('node:fs');
const { defineConfig } = require('@playwright/test');

// The sandbox ships Chromium 1194 at a fixed path; a freshly installed
// @playwright/test expects a newer build and fails to launch without an
// explicit executablePath. On CI (GitHub runners) that path does not exist
// and `npx playwright install chromium` provides the matching build, so the
// override is skipped. Set PLAYWRIGHT_CHROMIUM_EXECUTABLE to force one.
const PREINSTALLED_CHROMIUM = '/opt/pw-browsers/chromium';
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
  (fs.existsSync(PREINSTALLED_CHROMIUM) ? PREINSTALLED_CHROMIUM : undefined);

const PORT = Number(process.env.PORT || 8099);

module.exports = defineConfig({
  testDir: './tests',
  // Browser specs only. The node:test unit suite lives in tests/unit/*.test.mjs
  // and is run by `npm run test:unit`; without this pattern Playwright's default
  // testMatch would also pick those files up and fail to run them.
  testMatch: '**/*.spec.js',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // Blocked so every non-PWA spec sees the network, not a cache: since Phase 6
    // the worker precaches the whole app including data/*.json, and a stale
    // cached roster would make data-driven assertions lie. The PWA spec opts
    // back in with test.use({ serviceWorkers: 'allow' }).
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // iPhone-class portrait — the same viewport BEHAVIOR_SNAPSHOT.md was captured at.
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
  },

  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium', launchOptions: { executablePath } },
    },
  ],

  // Plain static server from the repo root — the app has no build step.
  webServer: {
    command: `python3 -m http.server ${PORT}`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
