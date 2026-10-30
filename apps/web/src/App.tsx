import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { ErrorBoundary } from './app/ErrorBoundary';
import { NotFoundPage } from './app/NotFoundPage';
import { RequireSession } from './auth/require-session';
import { SessionProvider } from './auth/session-context';
import { Spinner } from './components/ui/Spinner';
import { ToastProvider } from './components/ui/Toast';

// Each screen loads only its own code: the kitchen TV never downloads the owner panel.
const OwnerPage = lazy(() =>
  import('./features/owner/OwnerPage').then((m) => ({ default: m.OwnerPage })),
);
const OwnerLoginPage = lazy(() =>
  import('./features/owner/OwnerLoginPage').then((m) => ({ default: m.OwnerLoginPage })),
);
const KitchenPage = lazy(() =>
  import('./features/kitchen/KitchenPage').then((m) => ({ default: m.KitchenPage })),
);
const KitchenPairPage = lazy(() =>
  import('./features/kitchen/KitchenPairPage').then((m) => ({ default: m.KitchenPairPage })),
);

function Page({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-dvh place-items-center text-muted">
          <Spinner label="Loading…" />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/owner" replace /> },
  {
    path: '/owner/login',
    element: (
      <Page>
        <OwnerLoginPage />
      </Page>
    ),
  },
  {
    path: '/owner',
    element: (
      <ErrorBoundary>
        <RequireSession roles={['OWNER']} redirectTo="/owner/login">
          <Page>
            <OwnerPage />
          </Page>
        </RequireSession>
      </ErrorBoundary>
    ),
  },
  {
    path: '/kitchen/pair',
    element: (
      <Page>
        <KitchenPairPage />
      </Page>
    ),
  },
  {
    path: '/kitchen',
    element: (
      <ErrorBoundary autoReloadMs={30_000}>
        {/* The owner may also open the kitchen view; neither role gets controls there (ADR-021). */}
        <RequireSession roles={['KITCHEN', 'OWNER']} redirectTo="/kitchen/pair">
          <Page>
            <KitchenPage />
          </Page>
        </RequireSession>
      </ErrorBoundary>
    ),
  },
  { path: '*', element: <NotFoundPage /> },
]);

export function App() {
  return (
    <SessionProvider>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </SessionProvider>
  );
}
