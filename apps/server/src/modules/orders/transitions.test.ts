import { describe, expect, it } from 'vitest';
import { transitionOutcome } from './transitions';

describe('transitionOutcome (FR-ORD-04/05)', () => {
  it.each([
    ['ACTIVE', 'COMPLETED', 'apply'],
    ['ACTIVE', 'CANCELLED', 'apply'],
    ['COMPLETED', 'COMPLETED', 'alreadyApplied'],
    ['CANCELLED', 'CANCELLED', 'alreadyApplied'],
    ['CANCELLED', 'COMPLETED', 'conflict'],
    ['COMPLETED', 'CANCELLED', 'conflict'],
  ] as const)('%s → %s = %s', (current, target, outcome) => {
    expect(transitionOutcome(current, target)).toBe(outcome);
  });
});
