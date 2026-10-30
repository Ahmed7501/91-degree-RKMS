import type { OrderStatus } from '@rkds/shared';

export type TerminalStatus = Exclude<OrderStatus, 'ACTIVE'>;

export type TransitionOutcome = 'apply' | 'alreadyApplied' | 'conflict';

/**
 * The only transitions are ACTIVE→COMPLETED and ACTIVE→CANCELLED (FR-ORD-04). Repeating the
 * same transition is idempotent; the other terminal status is a conflict (FR-ORD-05).
 * The database enforces the same rule with `WHERE status = 'ACTIVE'`.
 */
export function transitionOutcome(current: OrderStatus, target: TerminalStatus): TransitionOutcome {
  if (current === 'ACTIVE') return 'apply';
  return current === target ? 'alreadyApplied' : 'conflict';
}
