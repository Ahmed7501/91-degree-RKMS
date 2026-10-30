// E2E stack, step 1 (docs/E2E_TESTING.md): reset the guarded rkds_test database, create the E2E
// owner with the BUILT CLI, then run the BUILT server against rkds_test. Started by Playwright's
// webServer, so every E2E run starts from an empty database.
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const serverDir = path.join(root, 'apps/server');
try {
  process.loadEnvFile(path.join(root, '.env'));
} catch {
  // CI supplies the variables.
}

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test')) {
  console.error('E2E refuses to run: TEST_DATABASE_URL must point at a database ending in _test.');
  process.exit(1);
}

const E2E_OWNER = { username: 'e2e-owner', password: 'kitchen display e2e pass' };
const env = { ...process.env, DATABASE_URL: url, SHADOW_DATABASE_URL: '' };

const client = new pg.Client({ connectionString: url });
await client.connect();
await client.query('DROP SCHEMA IF EXISTS public CASCADE');
await client.query('CREATE SCHEMA public');
await client.end();

execFileSync(
  process.execPath,
  [path.join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
  {
    cwd: serverDir,
    env,
    stdio: 'inherit',
  },
);
execFileSync(process.execPath, ['dist/cli/create-owner.js'], {
  cwd: serverDir,
  env: { ...env, NODE_ENV: 'test' },
  input: `${E2E_OWNER.username}\n${E2E_OWNER.password}\n${E2E_OWNER.password}\n`,
  stdio: ['pipe', 'inherit', 'inherit'],
});

const server = spawn(process.execPath, ['dist/main.js'], {
  cwd: serverDir,
  stdio: 'inherit',
  env: {
    ...env,
    NODE_ENV: 'test',
    PORT: process.env.E2E_API_PORT ?? '3100',
    APP_ORIGIN: process.env.E2E_ORIGIN ?? 'http://localhost:4173',
    TRUST_PROXY: '1',
    LOG_LEVEL: 'warn',
    RATE_LIMIT_MULTIPLIER: '100',
  },
});
const stop = () => server.kill('SIGTERM');
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
server.on('exit', (code) => process.exit(code ?? 0));
