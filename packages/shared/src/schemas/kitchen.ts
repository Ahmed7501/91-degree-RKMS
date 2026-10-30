import { z } from 'zod';
import { DEVICE_LABEL_MAX_CHARS, PAIRING_CODE_ALPHABET, PAIRING_CODE_LENGTH } from '../constants';
import { IsoDateTime, Uuid } from './common';

export const DeviceLabel = z.string().trim().min(1).max(DEVICE_LABEL_MAX_CHARS);

export const CreatePairingCodeBody = z.strictObject({ deviceLabel: DeviceLabel });
export type CreatePairingCodeBody = z.infer<typeof CreatePairingCodeBody>;

export const PairingCodeResponse = z.object({
  code: z.string(),
  deviceLabel: z.string(),
  expiresAt: IsoDateTime,
});
export type PairingCodeResponse = z.infer<typeof PairingCodeResponse>;

/** Only the length is checked here. The server answers PAIRING_CODE_INVALID for any bad code. */
export const PairBody = z.strictObject({ code: z.string().min(1).max(20) });
export type PairBody = z.infer<typeof PairBody>;

/** Uppercase and drop spaces/dashes: "abcd-ef23" → "ABCDEF23". */
export function normalizePairingCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '');
}

const WELL_FORMED = new RegExp(`^[${PAIRING_CODE_ALPHABET}]{${PAIRING_CODE_LENGTH}}$`);

export function isWellFormedPairingCode(normalized: string): boolean {
  return WELL_FORMED.test(normalized);
}

/** "ABCDEF23" → "ABCD-EF23" for display. */
export function formatPairingCode(normalized: string): string {
  return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
}

export const KitchenDeviceDto = z.strictObject({
  id: Uuid,
  deviceLabel: z.string(),
  createdAt: IsoDateTime,
  lastSeenAt: IsoDateTime,
  expiresAt: IsoDateTime,
});
export type KitchenDeviceDto = z.infer<typeof KitchenDeviceDto>;

export const DevicesResponse = z.object({ devices: z.array(KitchenDeviceDto) });
export type DevicesResponse = z.infer<typeof DevicesResponse>;
