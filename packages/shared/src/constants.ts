/** Restaurant-wide constants shared by server and web (docs/REQUIREMENTS.md). */

export const RESTAURANT_TZ = 'Asia/Karachi';
export const DEFAULT_BUSINESS_DAY_CUTOFF_HOUR = 6;
export const DEFAULT_ORDER_RETENTION_DAYS = 7;

export const ORDER_TEXT_MAX_CHARS = 5000;
/** Kitchen notes / special instructions on any order (ADR-027). */
export const ORDER_NOTES_MAX_CHARS = 500;

/** Menu orders (ADR-027): distinct lines per order and quantity per line. */
export const ORDER_KINDS = ['TEXT', 'MENU'] as const;
export const MENU_ORDER_MAX_LINES = 50;
export const MENU_LINE_MAX_QUANTITY = 99;

/** Preparation targets the owner can pick (owner decision Q-08 added 15 and 30). */
export const PREP_MINUTES = [15, 20, 25, 30] as const;
export const DEFAULT_PREP_MINUTES = 20;

/** Timer turns to the warning phase at or below 5:00 remaining (FR-ORD-08). */
export const WARNING_THRESHOLD_MS = 300_000;

export const ORDER_SOURCES = ['WHATSAPP', 'FOODPANDA', 'PHONE', 'OTHER'] as const;
export const ORDER_STATUSES = ['ACTIVE', 'COMPLETED', 'CANCELLED'] as const;
export const SESSION_ROLES = ['OWNER', 'KITCHEN'] as const;

export const DEVICE_LABEL_MAX_CHARS = 40;

/** 31 unambiguous characters (no I, L, O, 0, 1). 8 characters ≈ 8.5×10¹¹ codes (SECURITY.md §1). */
export const PAIRING_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const PAIRING_CODE_LENGTH = 8;

export const HISTORY_PAGE_DEFAULT = 50;
export const HISTORY_PAGE_MAX = 100;
