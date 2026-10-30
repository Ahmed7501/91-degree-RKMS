import { createHash, randomBytes, randomInt } from 'node:crypto';

/** URL-safe random token (session cookies). 32 bytes = 256 bits. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Hex SHA-256. Only hashes of session tokens and pairing codes are stored. */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Uniformly random string from `alphabet` (CSPRNG, no modulo bias). */
export function randomFromAlphabet(alphabet: string, length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += alphabet[randomInt(alphabet.length)];
  return out;
}
