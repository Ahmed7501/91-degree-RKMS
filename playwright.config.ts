import { defineConfig, devices } from '@playwright/test';

// docs/E2E_TESTING.md. The stack is the BUILT server (against rkds_test, reset on every run) plus
// `vite preview` of the BUILT web app, proxying /api and /socket.io: same origin, like production.
const API_PORT = 3100;
// E2E_BASE_URL: run (usually only @smoke) against an already running stack, e.g. the prod-like
// Docker run (DEPLOYMENT §1). Then no local servers are started.
const EXTERNAL = process.env.E2E_BASE_URL;
const WEB = EXTERNAL ?? 'http://localhost:4173';

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1, // specs share one database
  timeout: 45_000,
  expect: { timeout: 7_000 },
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: WEB,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    timezoneId: 'Asia/Karachi',
  },
  webServer: EXTERNAL
    ? []
    : [
        {
          command: 'node tests/e2e/start-server.mjs',
          url: `http://127.0.0.1:${API_PORT}/api/health/ready`,
          env: { E2E_API_PORT: String(API_PORT), E2E_ORIGIN: WEB },
          reuseExistingServer: false,
          timeout: 120_000,
        },
        {
          command: 'npm run preview -w @rkds/web',
          url: `${WEB}/owner/login`,
          env: { RKDS_API_TARGET: `http://127.0.0.1:${API_PORT}` },
          reuseExistingServer: false,
          timeout: 60_000,
        },
      ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    // Owner smoke subset on the other engines (E2E_TESTING): Firefox and Safari's WebKit.
    {
      name: 'firefox-smoke',
      grep: /@smoke/,
      use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'webkit-smoke',
      grep: /@smoke/,
      use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } },
    },
  ],
});
