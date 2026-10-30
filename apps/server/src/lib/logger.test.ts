import { describe, expect, it } from 'vitest';
import { createLogger } from './logger';

function capture() {
  const lines: string[] = [];
  const logger = createLogger({
    level: 'trace',
    destination: { write: (s: string) => lines.push(s) },
  });
  return { logger, output: () => lines.join('') };
}

describe('logger redaction (second line of defence)', () => {
  it('redacts passwords, cookies, tokens, pairing codes and order text', () => {
    const { logger, output } = capture();
    logger.info(
      {
        password: 'hunter2-very-secret',
        passwordHash: '$argon2id$abc',
        token: 'session-token-xyz',
        code: 'ABCD-EF23',
        pairingCode: 'ZXCV-BN45',
        text: '2x Chicken Tikka, call 0321-1234567',
        order: {
          text: 'Address: R-321 Malir',
          notes: 'Gate 4, ring twice',
          items: [{ name: 'Item X' }],
        },
        notes: 'Call 0300-7654321 first',
        items: [{ name: 'Item Y' }],
        body: { anything: 'secret body' },
        req: { headers: { cookie: 'rkds_sid=abc', authorization: 'Bearer x' }, body: 'raw' },
      },
      'probe',
    );
    const out = output();
    for (const secret of [
      'hunter2-very-secret',
      '$argon2id$abc',
      'session-token-xyz',
      'ABCD-EF23',
      'ZXCV-BN45',
      'Chicken Tikka',
      'R-321 Malir',
      'Gate 4, ring twice',
      'Item X',
      'Call 0300-7654321 first',
      'Item Y',
      'secret body',
      'rkds_sid=abc',
      'Bearer x',
    ]) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain('[REDACTED]');
  });

  it('keeps explicit scalar fields such as orderId and orderNumber', () => {
    const { logger, output } = capture();
    logger.info({ orderId: 'id-1', orderNumber: 7 }, 'order created');
    expect(JSON.parse(output())).toMatchObject({
      orderId: 'id-1',
      orderNumber: 7,
      msg: 'order created',
      level: 'info',
    });
  });
});
