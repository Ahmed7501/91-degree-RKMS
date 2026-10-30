import { describe, expect, it } from 'vitest';
import { PAIRING_CODE_ALPHABET } from '../constants';
import { LoginBody } from './auth';
import {
  CreatePairingCodeBody,
  formatPairingCode,
  isWellFormedPairingCode,
  normalizePairingCode,
} from './kitchen';

describe('pairing codes', () => {
  it('uses a 31-character alphabet without look-alike characters', () => {
    expect(PAIRING_CODE_ALPHABET).toHaveLength(31);
    expect(new Set(PAIRING_CODE_ALPHABET).size).toBe(31);
    for (const ambiguous of ['I', 'L', 'O', '0', '1']) {
      expect(PAIRING_CODE_ALPHABET).not.toContain(ambiguous);
    }
  });

  it('normalizes case, dashes and spaces', () => {
    expect(normalizePairingCode(' abcd-ef23 ')).toBe('ABCDEF23');
    expect(normalizePairingCode('ab cd ef 23')).toBe('ABCDEF23');
  });

  it.each([
    ['ABCDEF23', true],
    ['ABCDEF2', false],
    ['ABCDEF234', false],
    ['ABCDEF2O', false],
    ['ABCDEF21', false],
    ['abcdef23', false],
  ])('%s well-formed: %s', (code, expected) => {
    expect(isWellFormedPairingCode(code)).toBe(expected);
  });

  it('formats as XXXX-XXXX', () => {
    expect(formatPairingCode('ABCDEF23')).toBe('ABCD-EF23');
  });

  it('device labels are trimmed and limited to 40 characters', () => {
    expect(CreatePairingCodeBody.parse({ deviceLabel: '  Grill TV ' })).toEqual({
      deviceLabel: 'Grill TV',
    });
    expect(CreatePairingCodeBody.safeParse({ deviceLabel: '   ' }).success).toBe(false);
    expect(CreatePairingCodeBody.safeParse({ deviceLabel: 'x'.repeat(41) }).success).toBe(false);
  });
});

describe('LoginBody', () => {
  it('trims and lowercases the username', () => {
    expect(LoginBody.parse({ username: '  Owner ', password: 'p' }).username).toBe('owner');
  });

  it('rejects unknown keys and an empty password', () => {
    expect(LoginBody.safeParse({ username: 'owner', password: 'p', role: 'OWNER' }).success).toBe(
      false,
    );
    expect(LoginBody.safeParse({ username: 'owner', password: '' }).success).toBe(false);
  });
});
