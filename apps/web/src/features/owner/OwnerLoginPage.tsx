import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { useSession } from '../../auth/session-context';
import { BrandMark } from '../../components/ui/BrandMark';
import { Button } from '../../components/ui/Button';
import { isApiError } from '../../lib/api-error';

/** Only same-app paths are allowed as a post-login destination (no open redirects). */
export function safeNext(next: string | null, fallback: string): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : fallback;
}

export function OwnerLoginPage() {
  const { login, session } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'), '/owner');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session?.role === 'OWNER') return <Navigate to={next} replace />;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
      void navigate(next, { replace: true });
    } catch (e) {
      setError(isApiError(e) ? e.message : 'Sign-in failed. Please try again.');
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <form
        onSubmit={(e) => void onSubmit(e)}
        className="flex w-full max-w-sm flex-col gap-5 rounded-xl border border-border bg-surface p-6 shadow-2"
        aria-describedby={error ? 'login-error' : undefined}
      >
        <div className="flex flex-col items-center gap-2">
          <BrandMark size="lg" />
          <h1 className="font-display text-2xl font-bold tracking-wide">Owner sign in</h1>
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-muted">
          Username
          <input
            className="h-12 rounded-md border border-border bg-bg px-3 text-base text-white focus:border-gold focus:outline-none"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            minLength={3}
            maxLength={32}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-muted">
          Password
          <input
            className="h-12 rounded-md border border-border bg-bg px-3 text-base text-white focus:border-gold focus:outline-none"
            type="password"
            autoComplete="current-password"
            required
            maxLength={200}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error ? (
          <p
            id="login-error"
            role="alert"
            className="rounded-md bg-danger-bg p-3 text-sm text-danger"
          >
            {error}
          </p>
        ) : null}
        <Button type="submit" size="lg" loading={busy} loadingLabel="Signing in…">
          Sign in
        </Button>
      </form>
    </main>
  );
}
