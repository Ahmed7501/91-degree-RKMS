import {
  CreateOrderResponse,
  DEFAULT_PREP_MINUTES,
  MENU_ORDER_EMPTY_MESSAGE,
  normalizeOrderText,
  ORDER_NOTES_MAX_CHARS,
  ORDER_NOTES_TOO_LONG_MESSAGE,
  ORDER_TEXT_MAX_CHARS,
  type CreateOrderInput,
  type OrderDto,
  type OrderSource,
  PrepMinutes,
} from '@rkds/shared';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { apiFetch } from '../../lib/api-client';
import { ApiError, isApiError } from '../../lib/api-error';
import { readJson, removeKey, STORAGE_KEYS, writeJson } from '../../lib/storage';
import { sanitizeCart, type CartLine } from './menu/cart';

/**
 * Owner submission state machine (ERROR_HANDLING §6, FR-OWN-07/08/09/16, ADR-027).
 * The draft is cleared only after the server confirmed the save. Every draft carries one
 * idempotency key, reused for every retry, so a retry can never create a second order.
 * Two modes share the pipeline: pasted/typed text, or menu lines chosen with + / −.
 */
export type SubmitPhase = 'idle' | 'sending' | 'checking' | 'saved' | 'failed' | 'confirmReuse';
export type ComposerMode = 'text' | 'menu';

export interface Draft {
  mode: ComposerMode;
  text: string;
  cart: CartLine[];
  notes: string;
  source: OrderSource;
  prepMinutes: PrepMinutes;
  key: string;
}

export interface SubmitState {
  phase: SubmitPhase;
  error: ApiError | null;
  saved: OrderDto | null;
  /** A send may have reached the server (timeout/network). Editing now shows a warning. */
  outcomeUnknown: boolean;
  /** IDEMPOTENCY_KEY_REUSED: display number of the version already sent. */
  existingDisplayNumber: string | null;
}

export const AUTO_RETRIES = 3;
const RETRY_BASE_MS = 1_000;

export interface SubmitDeps {
  send?: (draft: Draft) => Promise<CreateOrderResponse>;
  newKey?: () => string;
  sleep?: (ms: number) => Promise<void>;
}

/** The POST body for a draft. Blank notes are left out, so the request matches pre-notes ones. */
export function requestBody(draft: Draft): CreateOrderInput {
  const notes = draft.notes.trim().length > 0 ? { notes: draft.notes } : {};
  const common = { source: draft.source, prepMinutes: draft.prepMinutes, ...notes };
  return draft.mode === 'menu'
    ? { kind: 'MENU', items: draft.cart, ...common }
    : { text: draft.text, ...common };
}

const defaultSend = (draft: Draft) =>
  apiFetch('/api/orders', {
    method: 'POST',
    body: requestBody(draft),
    idempotencyKey: draft.key,
    schema: CreateOrderResponse,
  });

const defaultNewKey = () => crypto.randomUUID();
const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function initialDraft(newKey: () => string): Draft {
  const stored = readJson<Partial<Draft> | null>(STORAGE_KEYS.draft, null);
  const lastSource = readJson<OrderSource>(STORAGE_KEYS.lastSource, 'WHATSAPP');
  const lastMode = readJson<ComposerMode>(STORAGE_KEYS.composerMode, 'text');
  const mode = stored?.mode ?? lastMode;
  return {
    mode: mode === 'menu' ? 'menu' : 'text',
    text: typeof stored?.text === 'string' ? stored.text : '',
    cart: sanitizeCart(stored?.cart),
    notes: typeof stored?.notes === 'string' ? stored.notes : '',
    source: stored?.source ?? lastSource,
    prepMinutes: PrepMinutes.safeParse(stored?.prepMinutes).data ?? DEFAULT_PREP_MINUTES,
    key: typeof stored?.key === 'string' ? stored.key : newKey(),
  };
}

/** Client-side check of order text, mirroring the server (FR-OWN-07). A message or null. */
export function draftProblem(text: string): string | null {
  const normalized = normalizeOrderText(text);
  if (normalized.length === 0) return 'Order text cannot be empty.';
  if (normalized.length > ORDER_TEXT_MAX_CHARS) return 'Order is too long (max 5,000 characters).';
  return null;
}

/** Kitchen notes are optional; only their length can be wrong. Never truncated. */
export function notesProblem(notes: string): string | null {
  return normalizeOrderText(notes).length > ORDER_NOTES_MAX_CHARS
    ? ORDER_NOTES_TOO_LONG_MESSAGE
    : null;
}

/** Everything that blocks sending this draft, for the mode it is in. */
export function sendProblem(draft: Draft): string | null {
  const content =
    draft.mode === 'menu'
      ? draft.cart.length === 0
        ? MENU_ORDER_EMPTY_MESSAGE
        : null
      : draftProblem(draft.text);
  return content ?? notesProblem(draft.notes);
}

const hasContent = (d: Draft) => d.text.length > 0 || d.cart.length > 0 || d.notes.length > 0;

export function useSubmitOrder(onSaved: (order: OrderDto) => void, deps: SubmitDeps = {}) {
  const [draft, setDraft] = useState<Draft>(() => initialDraft(deps.newKey ?? defaultNewKey));
  const [state, setState] = useState<SubmitState>({
    phase: 'idle',
    error: null,
    saved: null,
    outcomeUnknown: false,
    existingDisplayNumber: null,
  });
  const inFlight = useRef(false);
  // Latest callback and dependencies for async work; refs are written after render.
  const onSavedRef = useRef(onSaved);
  const depsRef = useRef(deps);
  useLayoutEffect(() => {
    onSavedRef.current = onSaved;
    depsRef.current = deps;
  });
  const newKey = useCallback(() => (depsRef.current.newKey ?? defaultNewKey)(), []);

  // The unsent draft survives a refresh on this device (FR-OWN-16).
  useEffect(() => {
    if (hasContent(draft)) writeJson(STORAGE_KEYS.draft, draft);
    else removeKey(STORAGE_KEYS.draft);
  }, [draft]);

  const touched = useCallback(() => {
    setState((s) =>
      s.phase === 'saved' || s.phase === 'failed' ? { ...s, phase: 'idle', saved: null } : s,
    );
  }, []);

  const update = useCallback(
    (patch: Partial<Omit<Draft, 'key'>>) => {
      setDraft((d) => ({ ...d, ...patch }));
      if (patch.source) writeJson(STORAGE_KEYS.lastSource, patch.source);
      if (patch.mode) writeJson(STORAGE_KEYS.composerMode, patch.mode);
      touched();
    },
    [touched],
  );

  /** Functional cart update: rapid + / − clicks always apply to the latest cart. */
  const updateCart = useCallback(
    (change: (cart: CartLine[]) => CartLine[]) => {
      setDraft((d) => ({ ...d, cart: change(d.cart) }));
      touched();
    },
    [touched],
  );

  const submit = useCallback(
    async (override?: Draft) => {
      const current = override ?? draft;
      if (inFlight.current) return; // double submission is impossible (FR-OWN-09)
      const problem = sendProblem(current);
      if (problem) {
        setState((s) => ({
          ...s,
          phase: 'failed',
          error: new ApiError('VALIDATION_FAILED', problem),
        }));
        return;
      }
      inFlight.current = true;
      const send = depsRef.current.send ?? defaultSend;
      const sleep = depsRef.current.sleep ?? defaultSleep;
      setState((s) => ({ ...s, phase: 'sending', error: null, existingDisplayNumber: null }));
      try {
        for (let attempt = 0; ; attempt += 1) {
          try {
            const res = await send(current);
            // A replay (same key, already saved) answers with the same order: also a success.
            onSavedRef.current(res.order);
            // Only what was sent is cleared; the other mode's unsent input stays.
            setDraft({
              ...current,
              ...(current.mode === 'menu' ? { cart: [] } : { text: '' }),
              notes: '',
              key: newKey(),
            });
            setState({
              phase: 'saved',
              error: null,
              saved: res.order,
              outcomeUnknown: false,
              existingDisplayNumber: null,
            });
            return;
          } catch (e) {
            const error = isApiError(e) ? e : new ApiError('NETWORK_ERROR', 'No connection.');
            if (error.code === 'IDEMPOTENCY_KEY_REUSED') {
              const existing = (error.details as { existingOrderNumber?: number } | undefined)
                ?.existingOrderNumber;
              setState((s) => ({
                ...s,
                phase: 'confirmReuse',
                error,
                existingDisplayNumber: existing ? String(existing).padStart(3, '0') : null,
              }));
              return;
            }
            const unknownOutcome = error.retryable && error.code !== 'RATE_LIMITED';
            if (unknownOutcome && attempt < AUTO_RETRIES) {
              setState((s) => ({ ...s, phase: 'checking', error, outcomeUnknown: true }));
              await sleep(RETRY_BASE_MS * 2 ** attempt);
              continue;
            }
            setState((s) => ({
              ...s,
              phase: 'failed',
              error,
              outcomeUnknown: s.outcomeUnknown || unknownOutcome,
            }));
            return;
          }
        }
      } finally {
        inFlight.current = false;
      }
    },
    [draft, newKey],
  );

  /** After a 422: send the edited draft as a brand-new order (a new key). */
  const sendAsNew = useCallback(() => {
    const fresh = { ...draft, key: newKey() };
    setDraft(fresh);
    setState((s) => ({ ...s, outcomeUnknown: false }));
    return submit(fresh);
  }, [draft, newKey, submit]);

  /** After a 422: the earlier version is enough; drop this draft's content and notes. */
  const discard = useCallback(() => {
    setDraft((d) => ({
      ...d,
      ...(d.mode === 'menu' ? { cart: [] } : { text: '' }),
      notes: '',
      key: newKey(),
    }));
    setState({
      phase: 'idle',
      error: null,
      saved: null,
      outcomeUnknown: false,
      existingDisplayNumber: null,
    });
  }, [newKey]);

  return { draft, state, update, updateCart, submit: () => submit(), sendAsNew, discard };
}
