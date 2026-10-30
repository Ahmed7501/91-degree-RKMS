import { describe, expect, it } from 'vitest';
import {
  getDummyHash,
  hashPassword,
  needsRehash,
  passwordPolicyProblem,
  verifyPassword,
} from './password';

describe('password hashing (Argon2id)', () => {
  it('hashes with the documented parameters and verifies', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await verifyPassword(hash, 'correct horse battery staple')).toBe(true);
    expect(await verifyPassword(hash, 'correct horse battery stapl')).toBe(false);
  });

  it('salts every hash', async () => {
    expect(await hashPassword('same password here')).not.toBe(
      await hashPassword('same password here'),
    );
  });

  it('returns false instead of throwing on a malformed hash', async () => {
    expect(await verifyPassword('not-a-hash', 'anything')).toBe(false);
  });

  it('flags hashes made with other parameters for rehash', async () => {
    expect(needsRehash(await hashPassword('correct horse battery staple'))).toBe(false);
    expect(needsRehash('$argon2id$v=19$m=4096,t=3,p=1$c2FsdA$aGFzaA')).toBe(true);
    expect(needsRehash('$2b$10$bcrypthash')).toBe(true);
  });

  it('provides a real dummy hash for timing equalization', async () => {
    const dummy = await getDummyHash();
    expect(dummy).toMatch(/^\$argon2id\$/);
    expect(await getDummyHash()).toBe(dummy);
    expect(await verifyPassword(dummy, '')).toBe(false);
  });
});

describe('password policy (SECURITY §1)', () => {
  it.each([
    ['short1234!', 'at least 12'],
    ['x'.repeat(201), 'at most 200'],
    ['password1234', 'too common'],
    ['Pakistan1234', 'too common'],
    ['aaaaaaaaaaaaaa', 'too common'],
    ['ahmed-kitchen-2026', 'must not contain the username'],
  ])('rejects %j', (password, reason) => {
    expect(passwordPolicyProblem(password, 'ahmed')).toContain(reason);
  });

  it('accepts a long uncommon password without composition rules', () => {
    expect(passwordPolicyProblem('tandoor grill evening shift', 'ahmed')).toBeNull();
    expect(passwordPolicyProblem('x'.repeat(11) + 'y')).toBeNull();
  });
});
