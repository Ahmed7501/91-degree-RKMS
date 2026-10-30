import type { CreateOrderResponse, Menu, MenuResponse, OrderDto } from '@rkds/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/ui/Toast';
import { OrderComposer } from './OrderComposer';
import type { Draft } from './use-submit-order';

const saved = { id: 'o1', displayNumber: '012', orderNumber: 12 } as OrderDto;

const MENU: Menu = {
  menuVersion: 't',
  source: 't',
  currency: 'PKR',
  categories: [
    {
      id: 'burgers',
      name: 'Burgers',
      items: [
        {
          id: 'zinger-burger',
          name: 'Zinger Burger',
          active: true,
          variants: [{ id: 'regular', label: null, price: 460 }],
        },
      ],
    },
    {
      id: 'fries',
      name: 'Fries & Fast-Food',
      items: [
        {
          id: 'masala-fries',
          name: 'Masala Fries',
          active: true,
          note: 'Crunchy',
          variants: [
            { id: 'medium', label: 'Medium', price: 150 },
            { id: 'large', label: 'Large', price: 200 },
          ],
        },
      ],
    },
  ],
};

function setup(
  options: {
    send?: (draft: Draft) => Promise<CreateOrderResponse>;
    fetchMenu?: () => Promise<MenuResponse>;
  } = {},
) {
  const send = vi.fn(
    options.send ??
      ((): Promise<CreateOrderResponse> =>
        Promise.resolve({ order: saved, serverTime: '2026-10-29T13:00:00.000Z' })),
  );
  const onSaved = vi.fn();
  render(
    <ToastProvider>
      <OrderComposer
        onSaved={onSaved}
        deps={{ send, newKey: () => crypto.randomUUID(), sleep: () => Promise.resolve() }}
        readClipboard={() => Promise.resolve({ ok: true, text: '' })}
        fetchMenu={options.fetchMenu ?? (() => Promise.resolve({ menu: MENU }))}
      />
    </ToastProvider>,
  );
  return { send, onSaved, user: userEvent.setup() };
}

const tab = (name: RegExp) => screen.getByRole('tab', { name });
const sendButton = () => screen.getByRole('button', { name: /send to kitchen/i });
const textarea = () => screen.getByLabelText('Order text');
const notes = () => screen.getByLabelText(/kitchen notes/i);
const summary = () => screen.getByRole('region', { name: /order summary/i });

describe('OrderComposer menu mode (ADR-027)', () => {
  it('+ / − set quantities; the summary and total follow; category switches keep them', async () => {
    const { user } = setup();
    await user.click(tab(/^menu/i));
    const add = await screen.findByRole('button', { name: 'Add one Zinger Burger' });
    await user.click(add);
    await user.click(add);
    await user.click(add);
    const burgers = screen.getByRole('list', { name: 'Burgers' });
    await user.click(within(burgers).getByRole('button', { name: 'Remove one Zinger Burger' }));
    await user.click(tab(/fries/i));
    await user.click(screen.getByRole('button', { name: 'Add one Masala Fries, Large' }));
    await user.click(tab(/burgers/i));
    expect(
      within(screen.getByRole('list', { name: 'Burgers' })).getByLabelText('2 × Zinger Burger'),
    ).toHaveTextContent('2');
    expect(summary()).toHaveTextContent('(3 items)');
    expect(within(summary()).getByText('Rs 1,120')).toBeInTheDocument();
  });

  it('− is disabled at zero, so a quantity can never be negative', async () => {
    const { user } = setup();
    await user.click(tab(/^menu/i));
    expect(await screen.findByRole('button', { name: 'Remove one Zinger Burger' })).toBeDisabled();
  });

  it('sends the selected lines with notes, then clears the cart and notes', async () => {
    const { send, onSaved, user } = setup();
    await user.click(tab(/^menu/i));
    expect(sendButton()).toBeDisabled();
    await user.click(await screen.findByRole('button', { name: 'Add one Zinger Burger' }));
    await user.type(notes(), 'No mayo');
    await user.click(sendButton());
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    expect(send.mock.calls[0]![0]).toMatchObject({
      mode: 'menu',
      cart: [{ itemId: 'zinger-burger', variantId: 'regular', quantity: 1 }],
      notes: 'No mayo',
    });
    expect(summary()).toHaveTextContent('(0 items)');
    expect(notes()).toHaveValue('');
  });

  it('the bin removes a line from the summary', async () => {
    const { user } = setup();
    await user.click(tab(/^menu/i));
    await user.click(await screen.findByRole('button', { name: 'Add one Zinger Burger' }));
    await user.click(screen.getByRole('button', { name: 'Remove Zinger Burger from the order' }));
    expect(summary()).toHaveTextContent('(0 items)');
  });

  it('switching modes keeps unsent input in both', async () => {
    const { user } = setup();
    await user.click(tab(/paste/i));
    await user.type(textarea(), '1x Karahi');
    await user.click(tab(/^menu/i));
    await user.click(await screen.findByRole('button', { name: 'Add one Zinger Burger' }));
    await user.click(tab(/paste/i));
    expect(textarea()).toHaveValue('1x Karahi');
    await user.click(tab(/^menu/i));
    expect(summary()).toHaveTextContent('(1 item)');
  });

  it('search finds items across categories', async () => {
    const { user } = setup();
    await user.click(tab(/^menu/i));
    await user.type(await screen.findByLabelText('Search the menu'), 'masala');
    expect(screen.getByText('Masala Fries')).toBeInTheDocument();
    expect(screen.queryByText('Zinger Burger')).not.toBeInTheDocument();
  });

  it('a menu that fails to load shows Retry and points to Paste / Type', async () => {
    const fetchMenu = vi
      .fn<() => Promise<MenuResponse>>()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue({ menu: MENU });
    const { user } = setup({ fetchMenu });
    await user.click(tab(/^menu/i));
    expect(await screen.findByText(/you can still use paste \/ type/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(
      await screen.findByRole('button', { name: 'Add one Zinger Burger' }),
    ).toBeInTheDocument();
  });
});

describe('OrderComposer preparation target (Q-08)', () => {
  it('offers 15, 20, 25 and 30 minutes; 20 is preselected; the choice is sent', async () => {
    const { send, user } = setup();
    const target = screen.getByRole('radiogroup', { name: 'Target' });
    const options = within(target).getAllByRole('radio');
    expect(options.map((o) => o.textContent)).toEqual(['15 min', '20 min', '25 min', '30 min']);
    expect(within(target).getByRole('radio', { name: '20 min' })).toBeChecked();
    await user.click(tab(/paste/i));
    await user.type(textarea(), '1x Karahi');
    await user.click(within(target).getByRole('radio', { name: '30 min' }));
    await user.click(sendButton());
    await waitFor(() => expect(send).toHaveBeenCalled());
    expect(send.mock.calls[0]![0]).toMatchObject({ prepMinutes: 30 });
  });
});

describe('OrderComposer kitchen notes (ADR-027)', () => {
  it('go with a pasted/typed order and are cleared after the save', async () => {
    const { send, onSaved, user } = setup();
    await user.click(tab(/paste/i));
    await user.type(textarea(), '2x Tikka');
    await user.type(notes(), 'Extra spicy{Enter}Sauce separate');
    await user.click(sendButton());
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(send.mock.calls[0]![0]).toMatchObject({
      mode: 'text',
      text: '2x Tikka',
      notes: 'Extra spicy\nSauce separate',
    });
    expect(notes()).toHaveValue('');
  });

  it('over 500 characters: red counter, a message, Send blocked, text never cut', async () => {
    const { send, user } = setup();
    await user.click(tab(/paste/i));
    await user.type(textarea(), 'x');
    await user.click(notes());
    await user.paste('a'.repeat(501));
    expect(notes()).toHaveValue('a'.repeat(501));
    expect(screen.getByText('501 / 500')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/too long/i);
    expect(sendButton()).toBeDisabled();
    expect(send).not.toHaveBeenCalled();
  });

  it('are kept with the order when sending fails', async () => {
    const { user } = setup({ send: () => Promise.reject(new Error('offline')) });
    await user.click(tab(/paste/i));
    await user.type(textarea(), '2x Tikka');
    await user.type(notes(), 'No onions');
    await user.click(sendButton());
    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(notes()).toHaveValue('No onions');
    expect(textarea()).toHaveValue('2x Tikka');
  });
});
