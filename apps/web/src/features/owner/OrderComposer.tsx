import {
  normalizeOrderText,
  ORDER_NOTES_MAX_CHARS,
  ORDER_TEXT_MAX_CHARS,
  PREP_MINUTES,
  type MenuResponse,
  type OrderDto,
  type OrderSource,
  type PrepMinutes,
} from '@rkds/shared';
import { ClipboardPaste, RotateCw, Send, UtensilsCrossed } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { SOURCE_META } from '../../components/orders/SourceBadge';
import { Button } from '../../components/ui/Button';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Spinner } from '../../components/ui/Spinner';
import { Textarea } from '../../components/ui/Textarea';
import { useToast } from '../../components/ui/Toast';
import { readClipboardText } from '../../lib/clipboard';
import { cx } from '../../lib/cx';
import { changeQuantity, itemCount, removeLine, summarize } from './menu/cart';
import { CartSummary } from './menu/CartSummary';
import { MenuPicker } from './menu/MenuPicker';
import { useMenu } from './menu/use-menu';
import { NotesField } from './NotesField';
import { useSubmitOrder, type ComposerMode, type SubmitDeps } from './use-submit-order';

const SOURCES = (Object.keys(SOURCE_META) as OrderSource[]).map((value) => ({
  value,
  label: SOURCE_META[value].label,
}));
const TARGETS = PREP_MINUTES.map((value) => ({ value, label: `${value} min` }));
const COUNTER_FROM = 4_000;
export const PASTE_HINT = 'Press Ctrl+V (or long-press → Paste) to paste the order.';

const MODES: { value: ComposerMode; label: string; icon: typeof Send }[] = [
  { value: 'menu', label: 'Menu', icon: UtensilsCrossed },
  { value: 'text', label: 'Paste / Type', icon: ClipboardPaste },
];

interface Props {
  onSaved: (order: OrderDto) => void;
  offline?: boolean;
  deps?: SubmitDeps;
  readClipboard?: typeof readClipboardText;
  fetchMenu?: () => Promise<MenuResponse>;
}

/**
 * New order, two ways (ADR-027): pick items from the menu with + / −, or paste / type the text
 * (owner decision Q-02: pasting never sends). Both carry optional kitchen notes and use the same
 * submission pipeline. Nothing is cleared until the server confirms; Ctrl/Cmd+Enter also sends.
 */
export function OrderComposer({
  onSaved,
  offline = false,
  deps,
  readClipboard = readClipboardText,
  fetchMenu,
}: Props) {
  const toast = useToast();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [hint, setHint] = useState<string | null>(null);
  const menu = useMenu(fetchMenu);
  const { draft, state, update, updateCart, submit, sendAsNew, discard } = useSubmitOrder(
    (order) => {
      onSaved(order);
      toast.show(`Order #${order.displayNumber} sent to kitchen`, 'success');
    },
    deps,
  );

  // The menu changed under the owner: reload it; the summary then flags the stale lines.
  const errorCode = state.error?.code;
  const reloadMenu = menu.reload;
  useEffect(() => {
    if (errorCode === 'MENU_ITEM_UNAVAILABLE') reloadMenu();
  }, [errorCode, reloadMenu]);

  const busy = state.phase === 'sending' || state.phase === 'checking';
  const isMenu = draft.mode === 'menu';
  const lines = summarize(draft.cart, menu.menu);
  const empty = isMenu ? draft.cart.length === 0 : draft.text.trim().length === 0;
  const notesOver = normalizeOrderText(draft.notes).length > ORDER_NOTES_MAX_CHARS;
  const length = draft.text.length;

  const changeLine = (itemId: string, variantId: string, delta: number) =>
    updateCart((cart) => changeQuantity(cart, itemId, variantId, delta));

  const paste = async () => {
    const result = await readClipboard();
    if (!result.ok || result.text.trim().length === 0) {
      setHint(result.ok ? 'The clipboard is empty. Copy the order first.' : PASTE_HINT);
      textarea.current?.focus();
      return;
    }
    setHint(null);
    const previous = draft.text;
    update({ text: result.text });
    textarea.current?.focus();
    if (previous.trim().length > 0) {
      toast.show('Replaced the text with the clipboard.', 'info', {
        label: 'Undo',
        onClick: () => update({ text: previous }),
      });
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      if (!busy && !empty && !notesOver) void submit();
    }
  };

  return (
    <section aria-labelledby="composer-title" className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="composer-title" className="font-display text-xl font-bold tracking-wide uppercase">
          New order
        </h2>
        {state.phase === 'saved' && state.saved ? (
          <p
            role="status"
            aria-live="polite"
            className="font-display text-3xl font-extrabold text-gold"
          >
            #{state.saved.displayNumber} sent
          </p>
        ) : null}
      </div>

      <div
        role="tablist"
        aria-label="How to enter the order"
        className="grid grid-cols-2 gap-1 rounded-md bg-surface-2 p-1"
      >
        {MODES.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            id={`mode-${value}`}
            type="button"
            role="tab"
            aria-selected={draft.mode === value}
            aria-controls={`panel-${value}`}
            disabled={busy}
            onClick={() => update({ mode: value })}
            className={cx(
              'inline-flex h-11 items-center justify-center gap-2 rounded-sm text-sm font-semibold',
              draft.mode === value ? 'bg-red text-white' : 'text-muted hover:text-white',
            )}
          >
            <Icon aria-hidden="true" className="size-4" />
            {label}
            {value === 'menu' && draft.cart.length > 0 ? (
              <span className="tabular rounded-full bg-gold px-1.5 text-xs font-bold text-bg">
                {itemCount(draft.cart)}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {isMenu ? (
        <div
          id="panel-menu"
          role="tabpanel"
          aria-labelledby="mode-menu"
          className="flex flex-col gap-3"
        >
          {menu.menu ? (
            <MenuPicker menu={menu.menu} cart={draft.cart} onChange={changeLine} disabled={busy} />
          ) : menu.status === 'loading' ? (
            <p className="rounded-lg border border-border p-6 text-center text-muted">
              <Spinner label="Loading the menu…" />
            </p>
          ) : null}
          {menu.status === 'error' ? (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-danger-bg p-3 text-sm text-danger"
            >
              <span>
                {menu.menu
                  ? 'The menu could not be refreshed. Showing the last loaded menu.'
                  : 'The menu could not be loaded. You can still use Paste / Type.'}
              </span>
              <Button
                variant="secondary"
                icon={<RotateCw aria-hidden="true" className="size-4" />}
                onClick={menu.reload}
              >
                Retry
              </Button>
            </div>
          ) : null}
          <CartSummary
            lines={lines}
            onChange={changeLine}
            onRemove={(itemId, variantId) =>
              updateCart((cart) => removeLine(cart, itemId, variantId))
            }
            disabled={busy}
          />
        </div>
      ) : (
        <div id="panel-text" role="tabpanel" aria-labelledby="mode-text" className="flex flex-col">
          <div className="relative">
            <label htmlFor="order-text" className="sr-only">
              Order text
            </label>
            <Textarea
              id="order-text"
              ref={textarea}
              value={draft.text}
              readOnly={busy}
              rows={10}
              placeholder="Paste or type the full order…"
              className="min-h-[40vh]"
              onChange={(e) => {
                setHint(null);
                update({ text: e.target.value });
              }}
              onKeyDown={onKeyDown}
              aria-describedby="composer-hint composer-status"
            />
            {length >= COUNTER_FROM ? (
              <span
                className={cx(
                  'tabular absolute right-3 bottom-3 text-xs font-semibold',
                  length > ORDER_TEXT_MAX_CHARS ? 'text-danger' : 'text-warning',
                )}
              >
                {length.toLocaleString()} / {ORDER_TEXT_MAX_CHARS.toLocaleString()}
              </span>
            ) : null}
          </div>
          <p id="composer-hint" className={cx('mt-2 text-sm', hint ? 'text-warning' : 'sr-only')}>
            {hint ?? 'Ctrl+Enter sends.'}
          </p>
        </div>
      )}

      <NotesField value={draft.notes} onChange={(notes) => update({ notes })} readOnly={busy} />

      {state.outcomeUnknown && (state.phase === 'idle' || state.phase === 'failed') ? (
        <p role="status" className="rounded-md bg-warning-bg p-3 text-sm text-warning">
          The last send may have reached the kitchen. Check the active list before sending again — a
          retry is always safe, it never creates a duplicate.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-4">
        <SegmentedControl<OrderSource>
          label="Source"
          value={draft.source}
          options={SOURCES}
          onChange={(source) => update({ source })}
          disabled={busy}
        />
        <SegmentedControl<PrepMinutes>
          label="Target"
          value={draft.prepMinutes}
          options={TARGETS}
          onChange={(prepMinutes) => update({ prepMinutes })}
          disabled={busy}
        />
      </div>

      <div id="composer-status" aria-live="polite">
        {state.phase === 'checking' ? (
          <p className="text-sm text-warning">Connection slow — confirming with the kitchen…</p>
        ) : null}
        {state.phase === 'failed' && state.error ? (
          <div
            role="alert"
            className="flex flex-col gap-1 rounded-md bg-danger-bg p-3 text-sm text-danger"
          >
            <span>{state.error.message}</span>
            {state.error.requestId ? (
              <span className="text-xs text-muted">Ref {state.error.requestId.slice(0, 8)}</span>
            ) : null}
          </div>
        ) : null}
        {state.phase === 'confirmReuse' ? (
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-md bg-warning-bg p-3 text-sm text-warning"
          >
            <span>
              An earlier version of this order was already sent
              {state.existingDisplayNumber ? ` as #${state.existingDisplayNumber}` : ''}. Send this
              order as a new, separate order?
            </span>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={discard}>
                Keep the earlier one
              </Button>
              <Button onClick={() => void sendAsNew()}>Send as new order</Button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="safe-bottom sticky bottom-0 -mx-4 flex gap-3 bg-bg/95 px-4 pt-2 backdrop-blur lg:static lg:mx-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        {isMenu ? null : (
          <Button
            variant="secondary"
            size="lg"
            icon={<ClipboardPaste aria-hidden="true" className="size-5" />}
            onClick={() => void paste()}
            disabled={busy}
          >
            Paste
          </Button>
        )}
        <Button
          size="lg"
          className="flex-1 justify-center text-lg"
          icon={<Send aria-hidden="true" className="size-5" />}
          onClick={() => void submit()}
          disabled={empty || offline || notesOver}
          loading={busy}
          loadingLabel={state.phase === 'checking' ? 'Checking…' : 'Sending…'}
        >
          {state.phase === 'failed' ? 'Retry' : 'Send to Kitchen'}
        </Button>
      </div>
      {offline ? (
        <p className="text-sm text-danger">
          Offline — orders can&apos;t be sent until the connection returns. Your order is kept.
        </p>
      ) : null}
    </section>
  );
}
