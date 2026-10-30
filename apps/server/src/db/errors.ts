import { AppError } from '../errors/app-error';

/**
 * Maps database failures to AppErrors (ERROR_HANDLING §3). Prisma 7 with the pg driver adapter can
 * surface a failure as a Prisma code (P1001, P2002, P2010…), a SQLSTATE (23505, 57P01…) or a Node
 * socket error (ECONNREFUSED). All of them are collected, then matched.
 */

const UNAVAILABLE = new Set([
  'P1001',
  'P1002',
  'P1017',
  'P2024',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  '57P01', // admin_shutdown
  '57P03', // cannot_connect_now
  '08000',
  '08001',
  '08003',
  '08006',
  'DatabaseNotReachable',
  'DatabaseDoesNotExist',
  'SocketTimeout',
]);
const TRANSACTION_TIMEOUT = new Set(['P2028']);

export interface DbErrorInfo {
  codes: Set<string>;
  constraint: string | undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Walks the error, its `cause` chain and Prisma's `meta` to collect codes and a constraint name. */
export function dbErrorInfo(error: unknown): DbErrorInfo {
  const codes = new Set<string>();
  let constraint: string | undefined;
  const seen = new Set<unknown>();
  const queue: unknown[] = [error];

  while (queue.length > 0) {
    const current = asRecord(queue.shift());
    if (!current || seen.has(current)) continue;
    seen.add(current);
    for (const key of ['code', 'errorCode', 'originalCode', 'kind'] as const) {
      const value = current[key];
      if (typeof value === 'string') codes.add(value);
    }
    if (typeof current.constraint === 'string') constraint ??= current.constraint;
    const nested = asRecord(current.constraint);
    if (nested && typeof nested.index === 'string') constraint ??= nested.index;
    if (nested && typeof nested.name === 'string') constraint ??= nested.name;
    if (typeof current.message === 'string' && !constraint) {
      const match = /constraint "([^"]+)"/.exec(current.message);
      if (match) constraint = match[1];
    }
    queue.push(current.cause, current.meta, current.driverAdapterError);
  }
  if (codes.has('UniqueConstraintViolation')) codes.add('23505');
  return { codes, constraint };
}

export function isUniqueViolation(error: unknown, constraintName?: string): boolean {
  const info = dbErrorInfo(error);
  const unique = info.codes.has('23505') || info.codes.has('P2002');
  return unique && (constraintName === undefined || info.constraint === constraintName);
}

/**
 * Converts known database failures; anything unrecognized (including CHECK violations, which
 * validation should have prevented) becomes INTERNAL_ERROR. The error handler logs the constraint
 * name from `dbErrorInfo`, never the row.
 */
export function mapDbError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const { codes } = dbErrorInfo(error);
  if ([...codes].some((c) => UNAVAILABLE.has(c))) {
    return new AppError('DATABASE_UNAVAILABLE', { cause: error });
  }
  if ([...codes].some((c) => TRANSACTION_TIMEOUT.has(c))) {
    return new AppError('SERVICE_UNAVAILABLE', { cause: error });
  }
  return new AppError('INTERNAL_ERROR', { cause: error });
}

/** True for errors that mean the database cannot be reached at all. */
export function isDatabaseUnavailable(error: unknown): boolean {
  return [...dbErrorInfo(error).codes].some((c) => UNAVAILABLE.has(c));
}
