import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useSession } from '../../auth/session-context';
import { BrandMark } from '../../components/ui/BrandMark';
import { Button } from '../../components/ui/Button';
import { isApiError } from '../../lib/api-error';

/** A kitchen screen enters the one-time code the owner generated (ADR-008). */
export function KitchenPairPage() {
  const { pair, session } = useSession();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to="/kitchen" replace />;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await pair(code);
      void navigate('/kitchen', { replace: true });
    } catch (e) {
      setError(isApiError(e) ? e.message : 'Pairing failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <form
        onSubmit={(e) => void onSubmit(e)}
        className="flex w-full max-w-md flex-col items-center gap-6 rounded-xl border border-border bg-surface p-8 text-center shadow-2"
      >
        <BrandMark size="lg" />
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-3xl font-bold tracking-wide">
            Connect this kitchen screen
          </h1>
          <p className="text-muted">
            On the owner panel open{' '}
            <strong className="text-white">Settings → Kitchen screens</strong> and enter the
            8-character code here.
          </p>
        </div>
        <label className="sr-only" htmlFor="pairing-code">
          Pairing code
        </label>
        <input
          id="pairing-code"
          className="h-16 w-full rounded-lg border border-border bg-bg text-center font-display text-4xl font-bold tracking-[0.3em] uppercase text-white focus:border-gold focus:outline-none"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          inputMode="text"
          placeholder="ABCD-EF23"
          maxLength={11}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
        {error ? (
          <p role="alert" className="w-full rounded-md bg-danger-bg p-3 text-danger">
            {error}
          </p>
        ) : null}
        <Button
          type="submit"
          size="lg"
          className="w-full justify-center"
          loading={busy}
          loadingLabel="Connecting…"
        >
          Connect screen
        </Button>
      </form>
    </main>
  );
}
