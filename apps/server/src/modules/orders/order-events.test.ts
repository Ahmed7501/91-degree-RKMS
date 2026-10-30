import { describe, expect, it } from 'vitest';
import { OrderEventBus } from './order-events';

const order = { id: 'o1' } as never;

describe('OrderEventBus', () => {
  it('a throwing listener is reported and does not stop the others', () => {
    const errors: unknown[] = [];
    const bus = new OrderEventBus((e) => errors.push(e));
    const seen: string[] = [];
    bus.subscribe(() => {
      throw new Error('broadcast failed');
    });
    bus.subscribe((kind) => seen.push(kind));
    expect(() => bus.publish('created', order)).not.toThrow();
    expect(seen).toEqual(['created']);
    expect(errors).toHaveLength(1);
  });

  it('delivers to every subscriber until it unsubscribes', () => {
    const bus = new OrderEventBus();
    const a: string[] = [];
    const b: string[] = [];
    const unsubscribeA = bus.subscribe((kind) => a.push(kind));
    bus.subscribe((kind) => b.push(kind));
    bus.publish('created', order);
    unsubscribeA();
    unsubscribeA(); // idempotent
    bus.publish('updated', order);
    expect(a).toEqual(['created']);
    expect(b).toEqual(['created', 'updated']);
  });
});
