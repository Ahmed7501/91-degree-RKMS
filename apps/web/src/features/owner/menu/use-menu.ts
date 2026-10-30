import { MenuResponse, type Menu } from '@rkds/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../../lib/api-client';
import { ApiError, isApiError } from '../../../lib/api-error';

export type MenuStatus = 'loading' | 'ready' | 'error';

export interface MenuState {
  status: MenuStatus;
  menu: Menu | null;
  error: ApiError | null;
}

const defaultFetchMenu = () => apiFetch('/api/menu', { schema: MenuResponse });

/**
 * Loads the owner menu (GET /api/menu). A reload keeps the last good menu on screen, so a failed
 * refresh never empties the picker or the owner's selection.
 */
export function useMenu(fetchMenu: () => Promise<MenuResponse> = defaultFetchMenu) {
  const [state, setState] = useState<MenuState>({ status: 'loading', menu: null, error: null });
  const fetchRef = useRef(fetchMenu);
  const generation = useRef(0);

  /** Fetches and stores the result; state changes only in the async callbacks. */
  const load = useCallback(() => {
    const mine = ++generation.current;
    fetchRef.current().then(
      (res) => {
        if (mine === generation.current) setState({ status: 'ready', menu: res.menu, error: null });
      },
      (error: unknown) => {
        if (mine !== generation.current) return;
        const apiError = isApiError(error)
          ? error
          : new ApiError('BAD_RESPONSE', 'The menu could not be read.');
        setState((s) => ({ ...s, status: 'error', error: apiError }));
      },
    );
  }, []);

  const reload = useCallback(() => {
    setState((s) => ({ ...s, status: 'loading', error: null }));
    load();
  }, [load]);

  // The initial state is already "loading", so the first fetch needs no state change here.
  useEffect(() => {
    load();
    return () => {
      generation.current += 1;
    };
  }, [load]);

  return { ...state, reload };
}
