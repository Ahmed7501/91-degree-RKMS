import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Kitchen screens reload themselves; the owner sees a Reload button. */
  autoReloadMs?: number;
}

interface State {
  failed: boolean;
}

/** Route-level safety net (ERROR_HANDLING §4). Never shows stack traces. */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false };
  private timer: ReturnType<typeof setTimeout> | undefined;

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(_error: unknown, _info: ErrorInfo): void {
    if (this.props.autoReloadMs) {
      this.timer = setTimeout(() => window.location.reload(), this.props.autoReloadMs);
    }
  }

  override componentWillUnmount(): void {
    clearTimeout(this.timer);
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="grid min-h-dvh place-items-center p-6 text-center">
        <div className="flex max-w-sm flex-col items-center gap-4">
          <p className="font-display text-3xl font-bold">Something went wrong</p>
          <p className="text-muted">
            {this.props.autoReloadMs
              ? 'This screen will reload by itself in a moment.'
              : 'Your unsent order text is kept. Reload to continue.'}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="h-11 rounded-md bg-red px-5 font-semibold text-white hover:bg-red-deep"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
