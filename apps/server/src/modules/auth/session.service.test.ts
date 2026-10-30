import { describe, expect, it } from 'vitest';
import { LoginLock } from './auth.service';
import { needsTouch, sessionState, toSessionDto, type SessionRow } from './session.service';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ttls = {
  ownerAbsoluteMs: 7 * DAY,
  ownerIdleMs: DAY,
  kitchenAbsoluteMs: 90 * DAY,
  kitchenIdleMs: 14 * DAY,
};
const NOW = new Date('2026-10-29T13:00:00.000Z');
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs);

function row(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    role: 'OWNER',
    revokedAt: null,
    expiresAt: at(DAY),
    lastSeenAt: NOW,
    userDisabledAt: null,
    ...overrides,
  };
}

describe('sessionState', () => {
  it('a fresh session is valid', () => {
    expect(sessionState(row(), NOW, ttls)).toBe('valid');
  });

  it('revoked sessions are rejected', () => {
    expect(sessionState(row({ revokedAt: at(-1) }), NOW, ttls)).toBe('revoked');
  });

  it('absolute expiry is exclusive of the instant itself', () => {
    expect(sessionState(row({ expiresAt: at(1) }), NOW, ttls)).toBe('valid');
    expect(sessionState(row({ expiresAt: NOW }), NOW, ttls)).toBe('expired');
  });

  it('idle expiry depends on the role', () => {
    const idleOwner = row({ lastSeenAt: at(-DAY) });
    expect(sessionState(idleOwner, NOW, ttls)).toBe('idle');
    const recentKitchen = row({ role: 'KITCHEN', lastSeenAt: at(-13 * DAY) });
    expect(sessionState(recentKitchen, NOW, ttls)).toBe('valid');
    const idleKitchen = row({ role: 'KITCHEN', lastSeenAt: at(-14 * DAY) });
    expect(sessionState(idleKitchen, NOW, ttls)).toBe('idle');
  });

  it('a disabled owner has no valid session', () => {
    expect(sessionState(row({ userDisabledAt: at(-HOUR) }), NOW, ttls)).toBe('disabled');
  });
});

describe('needsTouch', () => {
  it('writes last_seen_at at most every 5 minutes', () => {
    expect(needsTouch(at(-4 * 60_000 - 59_999), NOW)).toBe(false);
    expect(needsTouch(at(-5 * 60_000), NOW)).toBe(true);
  });
});

describe('toSessionDto', () => {
  it('maps owner and kitchen sessions', () => {
    const base = { id: 's', expiresAt: at(DAY) };
    expect(
      toSessionDto({ ...base, role: 'OWNER', userId: 'u1', username: 'owner', deviceLabel: null }),
    ).toEqual({
      role: 'OWNER',
      user: { id: 'u1', username: 'owner' },
      deviceLabel: null,
      expiresAt: '2026-10-30T13:00:00.000Z',
    });
    expect(
      toSessionDto({ ...base, role: 'KITCHEN', userId: null, username: null, deviceLabel: 'TV' }),
    ).toMatchObject({ role: 'KITCHEN', user: null, deviceLabel: 'TV' });
  });
});

describe('LoginLock', () => {
  const clock = {
    current: NOW.getTime(),
    now() {
      return new Date(this.current);
    },
  };
  const lock = () => new LoginLock({ windowMs: 15 * 60_000, limit: 5 }, clock);

  it('locks a (username, IP) pair after 5 consecutive failures for 15 minutes', () => {
    clock.current = NOW.getTime();
    const l = lock();
    for (let i = 0; i < 4; i += 1) l.recordFailure('owner', '1.1.1.1');
    expect(l.retryAfterSeconds('owner', '1.1.1.1')).toBe(0);
    l.recordFailure('owner', '1.1.1.1');
    expect(l.retryAfterSeconds('owner', '1.1.1.1')).toBe(900);
    expect(l.retryAfterSeconds('owner', '2.2.2.2')).toBe(0);
    expect(l.retryAfterSeconds('other', '1.1.1.1')).toBe(0);
    clock.current += 15 * 60_000;
    expect(l.retryAfterSeconds('owner', '1.1.1.1')).toBe(0);
  });

  it('a success resets the count', () => {
    clock.current = NOW.getTime();
    const l = lock();
    for (let i = 0; i < 4; i += 1) l.recordFailure('owner', '1.1.1.1');
    l.recordSuccess('owner', '1.1.1.1');
    l.recordFailure('owner', '1.1.1.1');
    expect(l.retryAfterSeconds('owner', '1.1.1.1')).toBe(0);
  });

  it('failures spread beyond the window do not accumulate', () => {
    clock.current = NOW.getTime();
    const l = lock();
    for (let i = 0; i < 4; i += 1) l.recordFailure('owner', '1.1.1.1');
    clock.current += 16 * 60_000;
    l.recordFailure('owner', '1.1.1.1');
    expect(l.retryAfterSeconds('owner', '1.1.1.1')).toBe(0);
  });
});
