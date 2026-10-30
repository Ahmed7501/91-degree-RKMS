import { hash, verify, type Algorithm } from '@node-rs/argon2';
import { randomToken } from '../../lib/crypto';

/** Argon2id parameters (SECURITY §1). Changing them makes `needsRehash` true for old hashes. */
export const ARGON2_PARAMS = {
  algorithm: 2 as Algorithm, // Algorithm.Argon2id (a const enum, not importable as a value)
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 200;

/** A small embedded list of the most common long passwords (no composition rules, SECURITY §1). */
const COMMON_PASSWORDS = new Set([
  '123456789012',
  '1234567890123',
  '12345678901234',
  '123123123123',
  '111111111111',
  '000000000000',
  'qwertyuiop12',
  'qwertyuiopas',
  'qwerty123456',
  'password1234',
  'password12345',
  'password123!',
  'passwordpassword',
  'iloveyou1234',
  'admin1234567',
  'administrator',
  'welcome12345',
  'letmein12345',
  'abcdefghijkl',
  'abc123abc123',
  'monkey123456',
  'football1234',
  'pakistan1234',
  'pakistan123456',
  'karachi12345',
  'restaurant123',
  '91degree1234',
  '91degreebbq123',
]);

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_PARAMS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/** True when the stored hash used other parameters than the current ones. */
export function needsRehash(passwordHash: string): boolean {
  const expected = `$argon2id$v=19$m=${ARGON2_PARAMS.memoryCost},t=${ARGON2_PARAMS.timeCost},p=${ARGON2_PARAMS.parallelism}$`;
  return !passwordHash.startsWith(expected);
}

/** Returns a reason when the password is not acceptable, otherwise null. */
export function passwordPolicyProblem(password: string, username?: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`;
  }
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower) || /^(.)\1+$/.test(password)) {
    return 'That password is too common. Choose a longer, less predictable one.';
  }
  if (username && lower.includes(username.toLowerCase())) {
    return 'Password must not contain the username.';
  }
  return null;
}

let dummyHash: Promise<string> | undefined;

/**
 * A real Argon2id hash of a random secret. Unknown usernames are verified against it so a login
 * takes the same time whether or not the user exists (SECURITY §1).
 */
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomToken());
  return dummyHash;
}
