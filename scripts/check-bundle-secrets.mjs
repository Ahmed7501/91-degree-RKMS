// SECURITY §8: the browser bundle must contain no secrets or connection strings.
// Fails if apps/web/dist contains any forbidden marker. Run after `npm run build`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const dist = path.resolve('apps/web/dist');
const FORBIDDEN = [
  /postgres(ql)?:\/\//i,
  /DATABASE_URL/,
  /POSTGRES_PASSWORD/,
  /RKDS_DB_APP_PASSWORD/,
  /rkds_app_dev|rkds_admin_dev/,
  /BEGIN (RSA |EC )?PRIVATE KEY/,
];

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) yield* files(full);
    else if (/\.(js|css|html|json|webmanifest|map)$/.test(name)) yield full;
  }
}

let checked = 0;
const hits = [];
try {
  for (const file of files(dist)) {
    checked += 1;
    const text = readFileSync(file, 'utf8');
    for (const pattern of FORBIDDEN) {
      if (pattern.test(text)) hits.push(`${path.relative(dist, file)}: ${pattern}`);
    }
  }
} catch {
  console.error(`No build output at ${dist}. Run \`npm run build\` first.`);
  process.exit(1);
}

if (hits.length > 0) {
  console.error(`Secrets check FAILED:\n${hits.join('\n')}`);
  process.exit(1);
}
console.log(`Secrets check passed (${checked} files scanned).`);
