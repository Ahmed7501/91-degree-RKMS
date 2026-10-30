import { z } from 'zod';

export const IsoDateTime = z.iso.datetime();
/** Business date `YYYY-MM-DD` (Asia/Karachi business day, ADR-005). */
export const BusinessDate = z.iso.date();
export const Uuid = z.uuid();

export const ErrorEnvelope = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>;

export const ValidationIssue = z.object({ path: z.string(), message: z.string() });
export type ValidationIssue = z.infer<typeof ValidationIssue>;

export const OkResponse = z.object({ ok: z.literal(true) });
