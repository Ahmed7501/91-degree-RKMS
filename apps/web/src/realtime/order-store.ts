import type { OrderDto } from '@rkds/shared';

/**
 * Race-safe merge of snapshots and socket events (REALTIME_FLOW §4). Versions decide everything:
 * duplicates and stale events are ignored, and tombstones stop a late `order:created` from
 * bringing back a card that already left the board.
 */

export const TOMBSTONE_TTL_MS = 24 * 60 * 60_000;
export const NEW_HIGHLIGHT_MS = 8_000;

export interface OrderStoreState {
  active: ReadonlyMap<string, OrderDto>;
  tombstones: ReadonlyMap<string, { version: number; at: number }>;
  /** Receive time of orders that arrived live (NEW highlight, FR-KIT-05). */
  arrivedAt: ReadonlyMap<string, number>;
  syncing: boolean;
  buffer: readonly OrderDto[];
}

export type OrderStoreAction =
  | { type: 'syncStart' }
  | { type: 'snapshot'; orders: readonly OrderDto[]; now: number }
  | { type: 'event'; order: OrderDto; now: number; highlight: boolean }
  | { type: 'prune'; now: number }
  | { type: 'reset' };

export const initialOrderState: OrderStoreState = {
  active: new Map(),
  tombstones: new Map(),
  arrivedAt: new Map(),
  syncing: false,
  buffer: [],
};

interface Draft {
  active: Map<string, OrderDto>;
  tombstones: Map<string, { version: number; at: number }>;
  arrivedAt: Map<string, number>;
}

function knownVersion(draft: Draft, id: string): number | undefined {
  const a = draft.active.get(id)?.version;
  const t = draft.tombstones.get(id)?.version;
  if (a === undefined) return t;
  if (t === undefined) return a;
  return Math.max(a, t);
}

function apply(draft: Draft, order: OrderDto, now: number, highlight: boolean): void {
  const known = knownVersion(draft, order.id);
  if (known !== undefined && known >= order.version) return;
  if (order.status === 'ACTIVE') {
    if (highlight && !draft.active.has(order.id)) draft.arrivedAt.set(order.id, now);
    draft.active.set(order.id, order);
  } else {
    draft.active.delete(order.id);
    draft.arrivedAt.delete(order.id);
    draft.tombstones.set(order.id, { version: order.version, at: now });
  }
}

function toDraft(state: OrderStoreState): Draft {
  return {
    active: new Map(state.active),
    tombstones: new Map(state.tombstones),
    arrivedAt: new Map(state.arrivedAt),
  };
}

export function orderReducer(state: OrderStoreState, action: OrderStoreAction): OrderStoreState {
  switch (action.type) {
    case 'syncStart':
      return { ...state, syncing: true, buffer: [] };

    case 'snapshot': {
      // Authoritative: ACTIVE cards missing from the snapshot are dropped.
      const draft = toDraft(state);
      const next = new Map<string, OrderDto>();
      for (const order of action.orders) {
        if (order.status !== 'ACTIVE') continue;
        const tomb = draft.tombstones.get(order.id);
        if (tomb && tomb.version >= order.version) continue;
        const current = draft.active.get(order.id);
        next.set(order.id, current && current.version > order.version ? current : order);
      }
      draft.active = next;
      for (const event of state.buffer) apply(draft, event, action.now, false);
      for (const id of draft.arrivedAt.keys())
        if (!draft.active.has(id)) draft.arrivedAt.delete(id);
      return { ...draft, syncing: false, buffer: [] };
    }

    case 'event': {
      if (state.syncing) return { ...state, buffer: [...state.buffer, action.order] };
      const draft = toDraft(state);
      apply(draft, action.order, action.now, action.highlight);
      return { ...state, ...draft };
    }

    case 'prune': {
      const tombstones = new Map(
        [...state.tombstones].filter(([, t]) => action.now - t.at < TOMBSTONE_TTL_MS),
      );
      const arrivedAt = new Map(
        [...state.arrivedAt].filter(([, at]) => action.now - at < NEW_HIGHLIGHT_MS),
      );
      if (tombstones.size === state.tombstones.size && arrivedAt.size === state.arrivedAt.size) {
        return state;
      }
      return { ...state, tombstones, arrivedAt };
    }

    case 'reset':
      return initialOrderState;
  }
}

/** Oldest first, with an id tie-break (FR-KIT-02). */
export function sortedActive(state: OrderStoreState): OrderDto[] {
  return [...state.active.values()].sort((a, b) =>
    a.createdAt === b.createdAt ? (a.id < b.id ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1,
  );
}

export function isNew(state: OrderStoreState, id: string, now: number): boolean {
  const at = state.arrivedAt.get(id);
  return at !== undefined && now - at < NEW_HIGHLIGHT_MS;
}
