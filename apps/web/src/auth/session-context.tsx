import {
  LoginResponse,
  OkResponse,
  SessionResponse,
  type SessionDto,
  type SessionRole,
} from '@rkds/shared';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { apiFetch, setUnauthenticatedHandler } from '../lib/api-client';
import { removeKey, STORAGE_KEYS } from '../lib/storage';

export type SessionStatus = 'loading' | 'ready' | 'error';

export interface SessionContextValue {
  status: SessionStatus;
  session: SessionDto | null;
  hasRole: (...roles: SessionRole[]) => boolean;
  login: (username: string, password: string) => Promise<void>;
  pair: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Called when any request answers 401: this device is signed out (draft kept). */
  markSignedOut: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [session, setSession] = useState<SessionDto | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch('/api/auth/session', { schema: SessionResponse });
      setSession(res.session);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  // Initial load: state is set only in the promise callbacks, never synchronously in the effect.
  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/auth/session', { schema: SessionResponse }).then(
      (res) => {
        if (cancelled) return;
        setSession(res.session);
        setStatus('ready');
      },
      () => {
        if (!cancelled) setStatus('error');
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const markSignedOut = useCallback(() => setSession(null), []);

  useEffect(() => {
    setUnauthenticatedHandler(markSignedOut);
    return () => setUnauthenticatedHandler(undefined);
  }, [markSignedOut]);

  const login = useCallback(async (username: string, password: string) => {
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: { username, password },
      schema: LoginResponse,
    });
    setSession(res.session);
    setStatus('ready');
  }, []);

  const pair = useCallback(async (code: string) => {
    const res = await apiFetch('/api/kitchen/pair', {
      method: 'POST',
      body: { code },
      schema: LoginResponse,
    });
    setSession(res.session);
    setStatus('ready');
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST', body: {}, schema: OkResponse });
    } finally {
      // The unsent draft belongs to this owner session (FR-OWN-16).
      removeKey(STORAGE_KEYS.draft);
      setSession(null);
    }
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      status,
      session,
      hasRole: (...roles) => session !== null && roles.includes(session.role),
      login,
      pair,
      logout,
      refresh,
      markSignedOut,
    }),
    [status, session, login, pair, logout, refresh, markSignedOut],
  );

  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession(): SessionContextValue {
  const value = use(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}
