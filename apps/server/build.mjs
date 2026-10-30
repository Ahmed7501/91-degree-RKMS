// Bundles the server (and the CLI scripts) into dist/ with esbuild.
// @rkds/shared and the generated Prisma client are bundled; npm dependencies stay external
// and are installed in the production image (prisma CLI included, DATABASE §5).
import { build } from 'esbuild';
import { globSync, readFileSync, rmSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const external = Object.keys(pkg.dependencies ?? {}).filter((name) => name !== '@rkds/shared');

rmSync(new URL('./dist', import.meta.url), { recursive: true, force: true });

await build({
  entryPoints: ['src/main.ts', ...globSync('src/cli/*.ts').filter((f) => !f.endsWith('.test.ts'))],
  outdir: 'dist',
  outbase: 'src',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: true,
  external,
  logLevel: 'info',
  // Some bundled code may call require(); give ESM output a CommonJS-compatible require.
  banner: {
    js: "import { createRequire as __rkdsCreateRequire } from 'node:module'; const require = __rkdsCreateRequire(import.meta.url);",
  },
});
