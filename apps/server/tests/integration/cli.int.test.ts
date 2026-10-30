import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { verifyPassword } from '../../src/modules/auth/password';
import { createTestApp } from '../helpers/app-harness';
import { createOwner, loginOwner } from '../helpers/factories';
import { testDatabaseUrl, truncateAll } from '../helpers/test-db';

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const t = createTestApp();
afterAll(() => t.close());
beforeEach(() => truncateAll());

/** Runs a CLI script non-interactively: answers are piped to stdin, one per line. */
function cli(script: string, answers: string[]) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', `src/cli/${script}.ts`], {
    cwd: SERVER_DIR,
    input: answers.join('\n') + '\n',
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: testDatabaseUrl() },
    timeout: 60_000,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const STRONG = 'tandoor-grill-2026-strong';

describe('owner CLI', () => {
  it('create-owner stores an Argon2id hash, never the password', async () => {
    const run = cli('create-owner', ['  Ahmed ', STRONG, STRONG]);
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('Owner "ahmed" created');
    expect(run.stdout).not.toContain(STRONG);
    const user = await t.prisma.user.findUniqueOrThrow({ where: { username: 'ahmed' } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await verifyPassword(user.passwordHash, STRONG)).toBe(true);
  });

  it.each([
    ['a duplicate username', ['owner', STRONG, STRONG], 'already exists'],
    ['a short password', ['newowner', 'short-pass', 'short-pass'], 'at least 12'],
    ['a common password', ['newowner', 'password1234', 'password1234'], 'too common'],
    ['mismatched confirmation', ['newowner', STRONG, `${STRONG}x`], 'do not match'],
    ['an invalid username', ['no spaces allowed', STRONG, STRONG], 'Username must be'],
  ])('create-owner refuses %s', async (_name, answers, message) => {
    await createOwner(t.prisma, 'owner');
    const run = cli('create-owner', answers);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain(message);
    expect(await t.prisma.user.count()).toBe(1);
  });

  it('reset-owner-password changes the hash and signs the owner out everywhere', async () => {
    await createOwner(t.prisma, 'owner');
    await loginOwner(t.app);
    const run = cli('reset-owner-password', ['owner', STRONG, STRONG]);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('Signed out of 1 session(s)');
    const user = await t.prisma.user.findUniqueOrThrow({ where: { username: 'owner' } });
    expect(await verifyPassword(user.passwordHash, STRONG)).toBe(true);
    expect(await t.prisma.session.count({ where: { revokedAt: null } })).toBe(0);
  });

  it('disable-owner needs confirmation, then disables and revokes sessions', async () => {
    await createOwner(t.prisma, 'owner');
    await loginOwner(t.app);
    const refused = cli('disable-owner', ['owner', 'nope']);
    expect(refused.status).toBe(1);
    expect((await t.prisma.user.findFirstOrThrow()).disabledAt).toBeNull();

    const run = cli('disable-owner', ['owner', 'owner']);
    expect(run.status).toBe(0);
    expect((await t.prisma.user.findFirstOrThrow()).disabledAt).not.toBeNull();
    expect(await t.prisma.session.count({ where: { revokedAt: null } })).toBe(0);
  });

  it('list-owners prints usernames and state without hashes', async () => {
    await createOwner(t.prisma, 'owner');
    const run = cli('list-owners', []);
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/^owner\tcreated .+\tactive$/m);
    expect(run.stdout).not.toContain('argon2');
  });
});
