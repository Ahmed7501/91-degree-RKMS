import { defineConfig } from 'vitest/config';

// Tests must not depend on the machine's time zone (UNIT_TESTING §1); Karachi logic is explicit.
process.env.TZ = 'UTC';

// Integration tests read TEST_DATABASE_URL from the git-ignored .env in local development.
try {
  process.loadEnvFile('.env');
} catch {
  // CI provides real environment variables.
}

// One root config with a project per test layer (docs/TESTING.md).
// Integration tests run serially against the real `rkds_test` database (docs/INTEGRATION_TESTING.md).
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'shared',
          root: './packages/shared',
          include: ['src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'server-unit',
          root: './apps/server',
          include: ['src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'server-int',
          root: './apps/server',
          include: ['tests/integration/**/*.int.test.ts'],
          environment: 'node',
          fileParallelism: false,
          testTimeout: 15_000,
          hookTimeout: 30_000,
          globalSetup: ['./tests/global-setup.ts'],
        },
      },
      {
        test: {
          name: 'web',
          root: './apps/web',
          include: ['src/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['./src/test-setup.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'text', 'html', 'json-summary'],
      include: [
        'packages/shared/src/**/*.ts',
        'apps/server/src/**/*.ts',
        'apps/web/src/**/*.{ts,tsx}',
      ],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/index.ts',
        'apps/server/src/main.ts',
        // CLI scripts run as child processes in cli.int (not measurable in-process).
        'apps/server/src/cli/**',
        'apps/server/src/generated/**',
        'apps/web/src/main.tsx',
      ],
      // Targets from docs/TESTING.md §2. Other web UI is tracked but not gated (covered by E2E).
      thresholds: {
        'apps/server/src/**': { statements: 80 },
        'packages/shared/src/**': { statements: 80 },
        'apps/server/src/modules/orders/**': { statements: 90, branches: 90 },
        'packages/shared/src/time/**': { statements: 90, branches: 90 },
        'apps/web/src/realtime/order-store.ts': { statements: 90 },
        'apps/web/src/features/owner/use-submit-order.ts': { statements: 90 },
      },
    },
  },
});
