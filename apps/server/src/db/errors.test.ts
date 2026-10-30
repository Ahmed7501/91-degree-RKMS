import { describe, expect, it } from 'vitest';
import { AppError } from '../errors/app-error';
import { dbErrorInfo, isDatabaseUnavailable, isUniqueViolation, mapDbError } from './errors';

const prismaError = (code: string, meta?: unknown) =>
  Object.assign(new Error('prisma failure'), { code, meta });

describe('mapDbError', () => {
  it.each(['P1001', 'P1002', 'P1017', 'P2024'])('%s → DATABASE_UNAVAILABLE', (code) => {
    expect(mapDbError(prismaError(code)).code).toBe('DATABASE_UNAVAILABLE');
  });

  it('a socket error deep in the cause chain → DATABASE_UNAVAILABLE', () => {
    const error = new Error('outer', {
      cause: Object.assign(new Error('connect'), { code: 'ECONNREFUSED' }),
    });
    expect(mapDbError(error).code).toBe('DATABASE_UNAVAILABLE');
    expect(isDatabaseUnavailable(error)).toBe(true);
  });

  it('P2028 transaction timeout → SERVICE_UNAVAILABLE', () => {
    expect(mapDbError(prismaError('P2028')).code).toBe('SERVICE_UNAVAILABLE');
  });

  it('unknown errors and CHECK violations → INTERNAL_ERROR, keeping the cause', () => {
    const unknown = new Error('boom');
    const mapped = mapDbError(unknown);
    expect(mapped.code).toBe('INTERNAL_ERROR');
    expect(mapped.cause).toBe(unknown);
    expect(mapDbError(prismaError('P2010', { code: '23514' })).code).toBe('INTERNAL_ERROR');
  });

  it('passes AppErrors through unchanged', () => {
    const error = new AppError('ORDER_NOT_FOUND');
    expect(mapDbError(error)).toBe(error);
  });
});

describe('unique violations (SQLSTATE 23505 + constraint name)', () => {
  it('recognizes a raw-query P2010 with meta.code 23505', () => {
    const error = prismaError('P2010', {
      code: '23505',
      message: 'duplicate key value violates unique constraint "orders_idempotency_key_key"',
    });
    expect(isUniqueViolation(error, 'orders_idempotency_key_key')).toBe(true);
    expect(isUniqueViolation(error, 'orders_business_date_daily_number_key')).toBe(false);
  });

  it('recognizes a driver-adapter error shape', () => {
    const error = prismaError('P2002', {
      driverAdapterError: {
        cause: { kind: 'UniqueConstraintViolation', constraint: { index: 'users_username_key' } },
      },
    });
    expect(isUniqueViolation(error, 'users_username_key')).toBe(true);
    expect(dbErrorInfo(error).constraint).toBe('users_username_key');
  });

  it('recognizes a pg error with code and constraint fields', () => {
    const error = Object.assign(new Error('dup'), { code: '23505', constraint: 'x_key' });
    expect(isUniqueViolation(error)).toBe(true);
    expect(isUniqueViolation(error, 'x_key')).toBe(true);
  });

  it('is false for other errors and survives cycles', () => {
    const cyclic: Record<string, unknown> = { code: '23514' };
    cyclic.cause = cyclic;
    expect(isUniqueViolation(cyclic)).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});
