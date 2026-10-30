import type { CreateOrderResponse, OrderDto } from '@rkds/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/ui/Toast';
import type { readClipboardText } from '../../lib/clipboard';
import { OrderComposer, PASTE_HINT } from './OrderComposer';

const saved = { id: 'o1', displayNumber: '012', orderNumber: 12 } as OrderDto;

function setup(clipboard: Awaited<ReturnType<typeof readClipboardText>>) {
  const send = vi.fn((): Promise<CreateOrderResponse> =>
    Promise.resolve({ order: saved, serverTime: '2026-10-29T13:00:00.000Z' }),
  );
  const onSaved = vi.fn();
  render(
    <ToastProvider>
      <OrderComposer
        onSaved={onSaved}
        deps={{ send, newKey: () => crypto.randomUUID(), sleep: () => Promise.resolve() }}
        readClipboard={() => Promise.resolve(clipboard)}
        fetchMenu={() => new Promise(() => undefined)}
      />
    </ToastProvider>,
  );
  return { send, onSaved, user: userEvent.setup() };
}

const textarea = () => screen.getByLabelText('Order text');
const sendButton = () => screen.getByRole('button', { name: /send to kitchen/i });

describe('OrderComposer (Q-02 paste → review → send)', () => {
  it('Send is disabled while the textarea is empty', () => {
    setup({ ok: true, text: '' });
    expect(sendButton()).toBeDisabled();
  });

  it('Paste fills the textarea and never sends', async () => {
    const { send, user } = setup({ ok: true, text: '2x Tikka\n1x Naan' });
    await user.click(screen.getByRole('button', { name: /paste/i }));
    expect(textarea()).toHaveValue('2x Tikka\n1x Naan');
    expect(send).not.toHaveBeenCalled();
    expect(sendButton()).toBeEnabled();
  });

  it('the owner reviews, edits and then sends the edited text', async () => {
    const { send, onSaved, user } = setup({ ok: true, text: '2x Tikka' });
    await user.click(screen.getByRole('button', { name: /paste/i }));
    await user.type(textarea(), ' (no onion)');
    await user.click(sendButton());
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    expect(send.mock.calls[0]).toBeDefined();
    expect(await screen.findByText('#012 sent')).toBeInTheDocument();
    expect(textarea()).toHaveValue('');
  });

  it('Paste over existing text replaces it and Undo restores it', async () => {
    const { user } = setup({ ok: true, text: 'from clipboard' });
    await user.type(textarea(), 'typed first');
    await user.click(screen.getByRole('button', { name: /paste/i }));
    expect(textarea()).toHaveValue('from clipboard');
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(textarea()).toHaveValue('typed first');
  });

  it('denied clipboard → focus the textarea and show the paste hint; nothing sent', async () => {
    const { send, user } = setup({ ok: false, reason: 'denied' });
    await user.click(screen.getByRole('button', { name: /paste/i }));
    expect(screen.getByText(PASTE_HINT)).toBeInTheDocument();
    expect(textarea()).toHaveFocus();
    expect(send).not.toHaveBeenCalled();
  });

  it('an empty clipboard leaves the textarea unchanged and Send disabled', async () => {
    const { user } = setup({ ok: true, text: '   ' });
    await user.click(screen.getByRole('button', { name: /paste/i }));
    expect(textarea()).toHaveValue('');
    expect(sendButton()).toBeDisabled();
  });

  it('Ctrl+Enter sends', async () => {
    const { send, user } = setup({ ok: true, text: '' });
    await user.type(textarea(), '1x Zinger');
    await user.keyboard('{Control>}{Enter}{/Control}');
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  });

  it('shows the character counter only above 4,000 characters', async () => {
    const { user } = setup({ ok: true, text: 'a'.repeat(4500) });
    expect(screen.queryByText(/\/ 5,000/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /paste/i }));
    expect(screen.getByText('4,500 / 5,000')).toBeInTheDocument();
  });
});
