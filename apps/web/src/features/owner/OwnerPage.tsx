import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useSession } from '../../auth/session-context';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { useNow } from '../../hooks/use-now';
import { cx } from '../../lib/cx';
import { pillState, useOrderSync } from '../../realtime/use-order-sync';
import { ActiveOrdersList } from './ActiveOrdersList';
import { HistoryPanel } from './HistoryPanel';
import { OrderComposer } from './OrderComposer';
import { OwnerHeader } from './OwnerHeader';
import { SettingsSheet } from './SettingsSheet';

type Tab = 'active' | 'history';

/** The owner panel (DESIGN_SYSTEM §4): composer left, active orders / history right. */
export function OwnerPage() {
  const { session, logout, markSignedOut } = useSession();
  const navigate = useNavigate();
  const now = useNow();
  const [tab, setTab] = useState<Tab>('active');
  const [settings, setSettings] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const sync = useOrderSync({ onUnauthenticated: markSignedOut });
  // `now` (corrected time, ticking each second) advances the pill's reconnect grace period.
  const pill = pillState(sync.connection, sync.disconnectedAt, now, sync.online);

  const signOut = async () => {
    await logout().catch(() => undefined);
    void navigate('/owner/login', { replace: true });
  };

  return (
    <div className="min-h-dvh">
      <OwnerHeader
        activeCount={sync.orders.length}
        pill={pill}
        onSettings={() => setSettings(true)}
        onLogout={() => void signOut()}
      />
      {pill === 'offline' ? (
        <ErrorBanner>Offline — orders can&apos;t be sent until the connection returns.</ErrorBanner>
      ) : null}
      <main className="mx-auto grid max-w-7xl gap-6 p-4 lg:grid-cols-[minmax(380px,5fr)_7fr] lg:p-6">
        <OrderComposer
          offline={!sync.online}
          onSaved={(order) => {
            sync.apply(order);
            setHistoryKey((k) => k + 1);
          }}
        />
        <section aria-label="Orders" className="flex flex-col gap-3">
          <div
            role="tablist"
            aria-label="Order lists"
            className="flex gap-1 self-start rounded-md bg-surface-2 p-1"
          >
            {(['active', 'history'] as const).map((value) => (
              <button
                key={value}
                role="tab"
                type="button"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={cx(
                  'h-10 rounded-sm px-4 text-sm font-semibold',
                  tab === value ? 'bg-red text-white' : 'text-muted hover:text-white',
                )}
              >
                {value === 'active' ? `Active (${sync.orders.length})` : 'History'}
              </button>
            ))}
          </div>
          {tab === 'active' ? (
            <ActiveOrdersList
              orders={sync.orders}
              loading={sync.connection === 'connecting' || sync.connection === 'syncing'}
              onClosed={(order) => {
                sync.apply(order);
                setHistoryKey((k) => k + 1);
              }}
            />
          ) : (
            <HistoryPanel refreshKey={historyKey} />
          )}
        </section>
      </main>
      <SettingsSheet
        open={settings}
        onClose={() => setSettings(false)}
        username={session?.user?.username ?? ''}
      />
    </div>
  );
}
