import { defineConfig } from 'prisma/config';

// Local development reads the repo-root .env. Containers receive real environment variables,
// and loadEnvFile never overrides variables that are already set.
try {
  process.loadEnvFile('../../.env');
} catch {
  // No .env file: rely on the environment.
}

const url = process.env.DATABASE_URL;
const shadowDatabaseUrl = process.env.SHADOW_DATABASE_URL;

// The datasource is only needed by migrate/diff commands; `prisma generate` runs without it
// (for example during the Docker build).
export default defineConfig({
  schema: '../../database/schema.prisma',
  migrations: { path: '../../database/migrations' },
  ...(url ? { datasource: { url, ...(shadowDatabaseUrl ? { shadowDatabaseUrl } : {}) } } : {}),
});
