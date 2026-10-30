import { z } from 'zod';
import { SESSION_ROLES } from '../constants';
import { IsoDateTime, Uuid } from './common';

export const SessionRole = z.enum(SESSION_ROLES);
export type SessionRole = z.infer<typeof SessionRole>;

export const LoginBody = z.strictObject({
  username: z.string().trim().toLowerCase().min(3).max(32),
  password: z.string().min(1).max(200),
});
export type LoginBody = z.infer<typeof LoginBody>;

export const SessionDto = z.strictObject({
  role: SessionRole,
  user: z.strictObject({ id: Uuid, username: z.string() }).nullable(),
  deviceLabel: z.string().nullable(),
  expiresAt: IsoDateTime,
});
export type SessionDto = z.infer<typeof SessionDto>;

export const SessionResponse = z.object({
  session: SessionDto.nullable(),
  serverTime: IsoDateTime,
});
export type SessionResponse = z.infer<typeof SessionResponse>;

export const LoginResponse = z.object({ session: SessionDto, serverTime: IsoDateTime });
export type LoginResponse = z.infer<typeof LoginResponse>;
