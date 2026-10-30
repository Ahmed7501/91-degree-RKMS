import {
  ActiveOrdersResponse,
  OrderEventPayload,
  ServerHelloPayload,
  type OrderDto,
} from '@rkds/shared';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { apiFetch } from '../lib/api-client';
import { isAuthError } from '../lib/api-error';
import { clockSync } from '../lib/clock-sync';
import { initialOrderState, orderReducer, sortedActive, type OrderStoreState } from './order-store';
import { createSocket, type RkdsSocket } from './socket';

/** REALTIME_FLOW §3. */
export type ConnectionState =
  'connecting' | 'syncing' | 'live' | 'reconnecting' | 'unauthenticated';
export type PillState = 'connecting' | 'live' | 'reconnecting' | 'offline';

export const RECONNECT_GRACE_MS = 2_000;
export const OFFLINE_AFTER_MS = 30_000;
export const PERIODIC_RESYNC_MS = 5 * 60_000;
const PRUNE_EVERY_MS = 30_000;

/** What the connection pill shows, including the 2 s grace before "Reconnecting". */
export function pillState(
  connection: ConnectionState,
  disconnectedAt: number | null,
  now: number,
  online: boolean,
): PillState {
  if (!online) return 'offline';
  if (connection === 'live') return 'live';
  if (connection === 'reconnecting' && disconnectedAt !== null) {
    const down = now - disconnectedAt;
    if (down < RECONNECT_GRACE_MS) return 'live';
    return down < OFFLINE_AFTER_MS ? 'reconnecting' : 'offline';
  }
  return 'connecting';
}

export interface OrderSyncOptions {
  createSocket?: () => RkdsSocket;
  fetchActive?: () => Promise<ActiveOrdersResponse>;
  /** Live `order:created` while connected (sound). Never for snapshot loads. */
  onNewOrder?: (order: OrderDto) => void;
  onUnauthenticated?: () => void;
  now?: () => number;
}

export interface OrderSync {
  orders: OrderDto[];
  store: OrderStoreState;
  connection: ConnectionState;
  disconnectedAt: number | null;
  online: boolean;
  /** Owner-side HTTP results go through the same version check, so the socket echo is a no-op. */
  apply: (order: OrderDto) => void;
  resync: () => void;
}

const defaultFetchActive = () => apiFetch('/api/orders/active', { schema: ActiveOrdersResponse });

export function useOrderSync(options: OrderSyncOptions = {}): OrderSync {
  const [store, dispatch] = useReducer(orderReducer, initialOrderState);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [disconnectedAt, setDisconnectedAt] = useState<number | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine);

  const opts = useRef(options);
  const connectionRef = useRef(connection);
  // Latest values for socket/timer callbacks (refs are written after render, never during).
  useLayoutEffect(() => {
    opts.current = options;
    connectionRef.current = connection;
  });
  const socketRef = useRef<RkdsSocket | null>(null);
  const epoch = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const syncRef = useRef<(attempt?: number) => void>(() => undefined);

  const now = useCallback(() => (opts.current.now ?? (() => clockSync.now()))(), []);

  const goUnauthenticated = useCallback(() => {
    setConnection('unauthenticated');
    socketRef.current?.close();
    opts.current.onUnauthenticated?.();
  }, []);

  const sync = useCallback(
    (attempt = 0) => {
      clearTimeout(retryTimer.current);
      const myEpoch = ++epoch.current;
      dispatch({ type: 'syncStart' });
      if (connectionRef.current !== 'live') setConnection('syncing');
      const fetchActive = opts.current.fetchActive ?? defaultFetchActive;
      fetchActive().then(
        (snapshot) => {
          if (myEpoch !== epoch.current) return;
          dispatch({ type: 'snapshot', orders: snapshot.orders, now: now() });
          setConnection('live');
          setDisconnectedAt(null);
        },
        (error: unknown) => {
          if (myEpoch !== epoch.current) return;
          if (isAuthError(error)) {
            goUnauthenticated();
            return;
          }
          setConnection('reconnecting');
          setDisconnectedAt((at) => at ?? now());
          const delay = Math.min(30_000, 1_000 * 2 ** attempt);
          retryTimer.current = setTimeout(() => {
            if (socketRef.current?.connected) syncRef.current(attempt + 1);
          }, delay);
        },
      );
    },
    [goUnauthenticated, now],
  );
  useLayoutEffect(() => {
    syncRef.current = sync;
  }, [sync]);

  useEffect(() => {
    const socket = (opts.current.createSocket ?? createSocket)();
    socketRef.current = socket;

    let manualRetries = 0;
    let manualTimer: ReturnType<typeof setTimeout> | undefined;
    socket.on('connect', () => {
      manualRetries = 0;
      sync();
    });
    socket.on('connect_error', (error) => {
      if (error.message === 'UNAUTHENTICATED') {
        goUnauthenticated();
        return;
      }
      setConnection((c) => (c === 'unauthenticated' ? c : 'reconnecting'));
      setDisconnectedAt((at) => at ?? now());
      // A rejection by the server's handshake middleware (e.g. SERVICE_UNAVAILABLE during a
      // database blip) stops Socket.IO's own reconnection: retry ourselves with backoff.
      if (!socket.active) {
        clearTimeout(manualTimer);
        const delay = Math.min(30_000, 1_000 * 2 ** manualRetries);
        manualRetries += 1;
        manualTimer = setTimeout(() => socket.connect(), delay);
      }
    });
    socket.on('disconnect', () => {
      setConnection((c) => (c === 'unauthenticated' ? c : 'reconnecting'));
      setDisconnectedAt((at) => at ?? now());
    });
    socket.on('server:hello', (payload) => {
      const hello = ServerHelloPayload.safeParse(payload);
      if (hello.success) clockSync.addHelloSample(hello.data.serverTime);
    });
    const onOrder = (kind: 'created' | 'updated') => (payload: unknown) => {
      const event = OrderEventPayload.safeParse(payload);
      if (!event.success) return;
      const live = connectionRef.current === 'live';
      dispatch({
        type: 'event',
        order: event.data.order,
        now: now(),
        highlight: live && kind === 'created',
      });
      if (live && kind === 'created' && event.data.order.status === 'ACTIVE') {
        opts.current.onNewOrder?.(event.data.order);
      }
    };
    socket.on('order:created', onOrder('created'));
    socket.on('order:updated', onOrder('updated'));
    socket.on('session:revoked', () => goUnauthenticated());

    return () => {
      clearTimeout(retryTimer.current);
      clearTimeout(manualTimer);
      epoch.current += 1;
      socket.removeAllListeners();
      socket.close();
      socketRef.current = null;
    };
  }, [goUnauthenticated, now, sync]);

  // Belt-and-braces resync: when the screen becomes visible again, and every 5 minutes while live.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && socketRef.current?.connected) sync();
    };
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const periodic = setInterval(() => {
      if (connectionRef.current === 'live') sync();
    }, PERIODIC_RESYNC_MS);
    const prune = setInterval(() => dispatch({ type: 'prune', now: now() }), PRUNE_EVERY_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      clearInterval(periodic);
      clearInterval(prune);
    };
  }, [now, sync]);

  const apply = useCallback(
    (order: OrderDto) => dispatch({ type: 'event', order, now: now(), highlight: false }),
    [now],
  );
  const orders = useMemo(() => sortedActive(store), [store]);
  return { orders, store, connection, disconnectedAt, online, apply, resync: sync };
}
