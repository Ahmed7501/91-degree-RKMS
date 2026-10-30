import pino, { type DestinationStream, type Logger } from 'pino';

export type { Logger };

/**
 * Second line of defence (ERROR_HANDLING §3). The primary rule is to never pass request bodies,
 * order rows, DTOs, passwords or pairing codes to the logger. Paths are explicit because `*.x`
 * wildcards only match one level deep.
 */
export const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  'password',
  'passwordHash',
  'token',
  'code',
  'pairingCode',
  'text',
  'order.text',
  'notes',
  'order.notes',
  'items',
  'order.items',
  'body',
  'req.body',
];

export function createLogger(
  options: { level?: string; destination?: DestinationStream } = {},
): Logger {
  return pino(
    {
      level: options.level ?? 'info',
      base: { service: 'rkds-server' },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
      formatters: { level: (label) => ({ level: label }) },
    },
    options.destination,
  );
}
