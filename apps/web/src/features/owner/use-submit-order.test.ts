import type { CreateOrderResponse, OrderDto } from '@rkds/shared';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api-error';
import { STORAGE_KEYS } from '../../lib/storage';
import { changeQuantity } from './menu/cart';
import {
  AUTO_RETRIES,
  draftProblem,
  notesProblem,
  requestBody,
  sendProblem,
  useSubmitOrder,
  type Draft,
} from './use-submit-order';

const order = { id: 'o1', displayNumber: '012', orderNumber: 12 } as OrderDto;
const ok = (): Promise<CreateOrderResponse> =>
  Promise.resolve({ order, serverTime: '2026-10-29T13:00:00.000Z' });

function setup(send: (draft: Draft) => Promise<CreateOrderResponse>) {
  let keys = 0;
  const onSaved = vi.fn();
  const sendSpy = vi.fn(send);
  const hook = renderHook(() =>
    useSubmitOrder(onSaved, {
      send: sendSpy,
      newKey: () => `key-${++keys}`,
      sleep: () => Promise.resolve(),
    }),
  );
  return { hook, onSaved, send: sendSpy };
}

describe('useSubmitOrder (ERROR_HANDLING §6)', () => {
  it('idle → sending → saved: text cleared only after the server confirmed, new key', async () => {
    const { hook, onSaved, send } = setup(ok);
    act(() => hook.result.current.update({ text: '2x Tikka', source: 'PHONE', prepMinutes: 25 }));
    await act(() => hook.result.current.submit());
    expect(send.mock.calls[0]![0]).toMatchObject({
      text: '2x Tikka',
      source: 'PHONE',
      prepMinutes: 25,
      key: 'key-1',
    });
    expect(onSaved).toHaveBeenCalledWith(order);
    expect(hook.result.current.state.phase).toBe('saved');
    expect(hook.result.current.draft).toMatchObject({
      text: '',
      source: 'PHONE',
      prepMinutes: 25,
      key: 'key-2',
    });
  });

  it('a 400 keeps the text and the key', async () => {
    const { hook } = setup(() =>
      Promise.reject(new ApiError('VALIDATION_FAILED', 'Order text cannot be empty.', 400)),
    );
    act(() => hook.result.current.update({ text: 'x' }));
    await act(() => hook.result.current.submit());
    expect(hook.result.current.state.phase).toBe('failed');
    expect(hook.result.current.draft).toMatchObject({ text: 'x', key: 'key-1' });
    expect(hook.result.current.state.outcomeUnknown).toBe(false);
  });

  it('a timeout retries automatically with the SAME key, then succeeds', async () => {
    let calls = 0;
    const { hook, send } = setup(() =>
      ++calls < 3 ? Promise.reject(new ApiError('CLIENT_TIMEOUT', 'slow')) : ok(),
    );
    act(() => hook.result.current.update({ text: 'x' }));
    await act(() => hook.result.current.submit());
    expect(send).toHaveBeenCalledTimes(3);
    expect(new Set(send.mock.calls.map(([d]) => d.key))).toEqual(new Set(['key-1']));
    expect(hook.result.current.state.phase).toBe('saved');
  });

  it(`gives up after ${AUTO_RETRIES} retries, keeps the text and marks the outcome unknown`, async () => {
    const { hook, send } = setup(() => Promise.reject(new ApiError('NETWORK_ERROR', 'offline')));
    act(() => hook.result.current.update({ text: 'x' }));
    await act(() => hook.result.current.submit());
    expect(send).toHaveBeenCalledTimes(AUTO_RETRIES + 1);
    expect(hook.result.current.state).toMatchObject({ phase: 'failed', outcomeUnknown: true });
    expect(hook.result.current.draft.text).toBe('x');
    // A manual retry still uses the same key: the server answers with the original order if it saved.
    await act(() => hook.result.current.submit());
    expect(send.mock.calls.at(-1)![0].key).toBe('key-1');
  });

  it('a 422 asks before sending the edited text as a new order (new key)', async () => {
    let calls = 0;
    const { hook, send } = setup(() =>
      ++calls === 1
        ? Promise.reject(
            new ApiError('IDEMPOTENCY_KEY_REUSED', 'reused', 422, 'r', { existingOrderNumber: 7 }),
          )
        : ok(),
    );
    act(() => hook.result.current.update({ text: 'edited' }));
    await act(() => hook.result.current.submit());
    expect(hook.result.current.state).toMatchObject({
      phase: 'confirmReuse',
      existingDisplayNumber: '007',
    });
    await act(() => hook.result.current.sendAsNew());
    expect(send.mock.calls[1]![0].key).toBe('key-2');
    expect(hook.result.current.state.phase).toBe('saved');
  });

  it('discard after a 422 clears the draft', async () => {
    const { hook } = setup(() =>
      Promise.reject(new ApiError('IDEMPOTENCY_KEY_REUSED', 'reused', 422)),
    );
    act(() => hook.result.current.update({ text: 'edited' }));
    await act(() => hook.result.current.submit());
    act(() => hook.result.current.discard());
    expect(hook.result.current.draft.text).toBe('');
    expect(hook.result.current.state.phase).toBe('idle');
  });

  it('refuses empty text locally without calling the server', async () => {
    const { hook, send } = setup(ok);
    act(() => hook.result.current.update({ text: '  \n ' }));
    await act(() => hook.result.current.submit());
    expect(send).not.toHaveBeenCalled();
    expect(hook.result.current.state.error?.message).toBe('Order text cannot be empty.');
  });

  it('a second submit while sending is ignored (no double submission)', async () => {
    let resolve: () => void = () => undefined;
    const { hook, send } = setup(
      () =>
        new Promise((r) => {
          resolve = () => void ok().then(r);
        }),
    );
    act(() => hook.result.current.update({ text: 'x' }));
    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = hook.result.current.submit();
    });
    await act(() => hook.result.current.submit());
    resolve();
    await act(() => first);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('restores an unsent draft (text, source, target, key) after a refresh', () => {
    localStorage.setItem(
      STORAGE_KEYS.draft,
      JSON.stringify({ text: 'kept', source: 'FOODPANDA', prepMinutes: 25, key: 'stored-key' }),
    );
    const { hook } = setup(ok);
    expect(hook.result.current.draft).toEqual({
      mode: 'text',
      text: 'kept',
      cart: [],
      notes: '',
      source: 'FOODPANDA',
      prepMinutes: 25,
      key: 'stored-key',
    });
  });

  it('restores a 15- or 30-minute target; an unknown stored value falls back to 20', () => {
    localStorage.setItem(STORAGE_KEYS.draft, JSON.stringify({ text: 'a', prepMinutes: 30 }));
    expect(setup(ok).hook.result.current.draft.prepMinutes).toBe(30);
    localStorage.setItem(STORAGE_KEYS.draft, JSON.stringify({ text: 'a', prepMinutes: 15 }));
    expect(setup(ok).hook.result.current.draft.prepMinutes).toBe(15);
    localStorage.setItem(STORAGE_KEYS.draft, JSON.stringify({ text: 'a', prepMinutes: 22 }));
    expect(setup(ok).hook.result.current.draft.prepMinutes).toBe(20);
  });

  it('remembers the last source on the device', () => {
    const { hook } = setup(ok);
    act(() => hook.result.current.update({ source: 'PHONE' }));
    expect(localStorage.getItem(STORAGE_KEYS.lastSource)).toBe('"PHONE"');
  });
});

describe('draftProblem', () => {
  it('mirrors the server rules', () => {
    expect(draftProblem(' x ')).toBeNull();
    expect(draftProblem('a'.repeat(5001))).toContain('max 5,000');
  });
});

const ZINGER = { itemId: 'zinger-burger', variantId: 'regular', quantity: 2 };

describe('menu mode and kitchen notes (ADR-027)', () => {
  it('sends the menu lines and notes; on success clears only the cart and notes', async () => {
    const { hook, send } = setup(ok);
    act(() => hook.result.current.update({ text: 'typed in the other mode' }));
    act(() => hook.result.current.update({ mode: 'menu', cart: [ZINGER], notes: 'No onions' }));
    await act(() => hook.result.current.submit());
    expect(requestBody(send.mock.calls[0]![0])).toEqual({
      kind: 'MENU',
      items: [ZINGER],
      source: 'WHATSAPP',
      prepMinutes: 20,
      notes: 'No onions',
    });
    expect(hook.result.current.draft).toMatchObject({
      mode: 'menu',
      cart: [],
      notes: '',
      text: 'typed in the other mode',
      key: 'key-2',
    });
  });

  it('keeps the cart, notes and key when sending fails', async () => {
    const { hook } = setup(() => Promise.reject(new ApiError('VALIDATION_FAILED', 'bad')));
    act(() =>
      hook.result.current.update({ mode: 'menu', cart: [ZINGER], notes: 'Sauce separate' }),
    );
    await act(() => hook.result.current.submit());
    expect(hook.result.current.state.phase).toBe('failed');
    expect(hook.result.current.draft).toMatchObject({
      cart: [ZINGER],
      notes: 'Sauce separate',
      key: 'key-1',
    });
  });

  it('an empty cart is not sent', async () => {
    const { hook, send } = setup(ok);
    act(() => hook.result.current.update({ mode: 'menu' }));
    await act(() => hook.result.current.submit());
    expect(send).not.toHaveBeenCalled();
    expect(hook.result.current.state.error?.message).toBe('Choose at least one item.');
  });

  it('rapid + clicks through updateCart all count', () => {
    const { hook } = setup(ok);
    act(() => {
      for (let i = 0; i < 5; i += 1) {
        hook.result.current.updateCart((cart) =>
          changeQuantity(cart, 'zinger-burger', 'regular', 1),
        );
      }
    });
    expect(hook.result.current.draft.cart).toEqual([{ ...ZINGER, quantity: 5 }]);
  });

  it('text orders carry notes too; blank notes are left out of the request', async () => {
    const { hook, send } = setup(ok);
    act(() => hook.result.current.update({ text: '2x Tikka', notes: 'Extra spicy' }));
    await act(() => hook.result.current.submit());
    expect(requestBody(send.mock.calls[0]![0])).toEqual({
      text: '2x Tikka',
      source: 'WHATSAPP',
      prepMinutes: 20,
      notes: 'Extra spicy',
    });
    const blank = { ...send.mock.calls[0]![0], notes: '  ' };
    expect(requestBody(blank)).not.toHaveProperty('notes');
  });

  it('restores a menu draft and the last mode after a refresh', () => {
    localStorage.setItem(
      STORAGE_KEYS.draft,
      JSON.stringify({ mode: 'menu', cart: [ZINGER, { bad: true }], notes: 'kept', key: 'k' }),
    );
    const { hook } = setup(ok);
    expect(hook.result.current.draft).toMatchObject({
      mode: 'menu',
      cart: [ZINGER],
      notes: 'kept',
      key: 'k',
    });
  });

  it('remembers the chosen mode even with nothing typed', () => {
    const { hook } = setup(ok);
    act(() => hook.result.current.update({ mode: 'menu' }));
    expect(localStorage.getItem(STORAGE_KEYS.composerMode)).toBe('"menu"');
  });
});

describe('notesProblem / sendProblem', () => {
  it('notes: 500 characters ok, 501 rejected, counted after normalization', () => {
    expect(notesProblem('a'.repeat(500))).toBeNull();
    expect(notesProblem(`  ${'a'.repeat(500)}\r\n`)).toBeNull();
    expect(notesProblem('a'.repeat(501))).toContain('max 500');
  });

  it('checks the content of the current mode, then the notes', () => {
    const base: Draft = {
      mode: 'text',
      text: 'x',
      cart: [],
      notes: '',
      source: 'PHONE',
      prepMinutes: 20,
      key: 'k',
    };
    expect(sendProblem(base)).toBeNull();
    expect(sendProblem({ ...base, mode: 'menu' })).toBe('Choose at least one item.');
    expect(sendProblem({ ...base, mode: 'menu', cart: [ZINGER] })).toBeNull();
    expect(sendProblem({ ...base, notes: 'a'.repeat(501) })).toContain('max 500');
  });
});
