import { createPrisma, type Db } from '../db/prisma';
import { passwordPolicyProblem } from '../modules/auth/password';
import type { Prompter } from './prompt';

/** The CLI needs only DATABASE_URL. Local development reads the repo-root .env. */
export async function runCli(task: (prisma: Db) => Promise<void>): Promise<void> {
  if (process.env.NODE_ENV !== 'production') {
    try {
      process.loadEnvFile('../../.env');
    } catch {
      // Use the environment as-is.
    }
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }
  const prisma = createPrisma(url);
  try {
    await task(prisma);
  } catch (error) {
    // Show the message only: never stacks, SQL or connection strings.
    console.error(
      error instanceof CliError ? error.message : 'Failed. Check the database connection.',
    );
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

/** An expected failure with a message that is safe to print. */
export class CliError extends Error {}

const USERNAME = /^[a-z0-9._-]{3,32}$/;

export function normalizeUsername(raw: string): string {
  const username = raw.trim().toLowerCase();
  if (!USERNAME.test(username)) {
    throw new CliError('Username must be 3–32 characters: a–z, 0–9, dot, underscore or dash.');
  }
  return username;
}

/** Asks twice; enforces the password policy (≥ 12 characters, not common, not the username). */
export async function askNewPassword(prompt: Prompter, username: string): Promise<string> {
  const password = await prompt.askHidden('New password (min 12 characters): ');
  const problem = passwordPolicyProblem(password, username);
  if (problem) throw new CliError(problem);
  const confirm = await prompt.askHidden('Repeat the password: ');
  if (confirm !== password) throw new CliError('Passwords do not match.');
  return password;
}

/** Revokes every session of the owner. Their sockets are disconnected by the sweeper (≤ 60 s). */
export async function revokeOwnerSessions(prisma: Db, userId: string): Promise<number> {
  const result = await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}
