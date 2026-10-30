import type { OrderDto } from '@rkds/shared';

export type OrderEventKind = 'created' | 'updated';
export type OrderEventListener = (kind: OrderEventKind, order: OrderDto) => void;

/**
 * In-process notifications that the realtime broadcaster subscribes to (P6). The orders service
 * publishes only after the database transaction has committed (CLAUDE.md rule 1), never for an
 * idempotent replay or an already-applied transition.
 */
export class OrderEventBus {
  private readonly listeners: OrderEventListener[] = [];

  /** Called when a listener throws: the order is already committed, so the request still succeeds. */
  constructor(private readonly onListenerError: (error: unknown) => void = () => undefined) {}

  subscribe(listener: OrderEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index !== -1) this.listeners.splice(index, 1);
    };
  }

  publish(kind: OrderEventKind, order: OrderDto): void {
    for (const listener of this.listeners) {
      try {
        listener(kind, order);
      } catch (error) {
        this.onListenerError(error);
      }
    }
  }
}
