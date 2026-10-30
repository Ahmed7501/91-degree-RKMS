import type { CreateOrderBody } from '@rkds/shared';
import { sha256Hex } from '../../lib/crypto';

/**
 * SHA-256 of the normalized payload (ADR-006). The fields are hashed in a fixed order, so the
 * hash does not depend on the key order of the JSON the client sent. A text order without notes
 * hashes exactly as before ADR-027, so keys issued before that change still replay.
 */
export function requestHash(body: CreateOrderBody): string {
  const notes = body.notes ?? null;
  if (body.kind === 'MENU') {
    const lines = body.items.map((line) => [line.itemId, line.variantId, line.quantity]);
    return sha256Hex(JSON.stringify(['MENU', lines, body.source, body.prepMinutes, notes]));
  }
  const fields = [body.text, body.source, body.prepMinutes];
  return sha256Hex(JSON.stringify(notes === null ? fields : [...fields, notes]));
}

export type IdempotencyDecision = 'replay' | 'reuse';

/** Same key + same payload → replay the original order; same key + different payload → 422. */
export function idempotencyDecision(storedHash: string, incomingHash: string): IdempotencyDecision {
  return storedHash === incomingHash ? 'replay' : 'reuse';
}
