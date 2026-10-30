// Gate G8 (docs/TESTING.md): validate the production compose file with BOTH overlays, plus the
// dev compose file. `config -q` prints nothing on success and never starts anything.
import { execFileSync } from 'node:child_process';

const runs = [
  ['production + traefik', ['-f', 'docker-compose.yml', '-f', 'docker-compose.proxy-traefik.yml']],
  ['production + host', ['-f', 'docker-compose.yml', '-f', 'docker-compose.proxy-host.yml']],
];
let failed = false;
for (const [name, files] of runs) {
  try {
    execFileSync(
      'docker',
      ['compose', '--env-file', '.env.compose-check', ...files, 'config', '-q'],
      {
        stdio: ['ignore', 'inherit', 'inherit'],
      },
    );
    console.log(`compose config OK: ${name}`);
  } catch {
    console.error(`compose config FAILED: ${name}`);
    failed = true;
  }
}
try {
  execFileSync('docker', ['compose', '-f', 'docker-compose.dev.yml', 'config', '-q'], {
    stdio: 'inherit',
  });
  console.log('compose config OK: dev');
} catch {
  console.error('compose config FAILED: dev');
  failed = true;
}
process.exit(failed ? 1 : 0);
