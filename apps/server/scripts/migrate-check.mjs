// G9 (docs/TESTING.md): apply all migrations to rkds_test as rkds_app, then fail if the
// database differs from database/schema.prisma (drift). Never touches dev or production data.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  process.loadEnvFile(path.resolve(serverDir, '../../.env'));
} catch {
  // Use the existing environment.
}

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test')) {
  console.error('TEST_DATABASE_URL must be set and point at a database ending in _test.');
  process.exit(1);
}

const prisma = path.resolve(serverDir, '../../node_modules/prisma/build/index.js');
const run = (args) =>
  execFileSync(process.execPath, [prisma, ...args], {
    cwd: serverDir,
    env: { ...process.env, DATABASE_URL: url, SHADOW_DATABASE_URL: '' },
    stdio: 'inherit',
  });

run(['migrate', 'deploy']);
try {
  run([
    'migrate',
    'diff',
    '--from-config-datasource',
    '--to-schema',
    '../../database/schema.prisma',
    '--exit-code',
  ]);
  console.log('Migration check: no drift.');
} catch (error) {
  console.error(
    'Migration check FAILED: the database differs from schema.prisma (exit code 2 = drift).',
  );
  process.exit(error.status ?? 1);
}
