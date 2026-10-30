/**
 * ADR-020: the only normalization applied to order text.
 * CRLF/CR → LF, NUL removed (PostgreSQL text cannot store it), outer whitespace trimmed.
 * Internal whitespace, blank lines, Urdu and emoji are preserved exactly.
 */
export function normalizeOrderText(raw: string): string {
  return raw.replace(/\r\n?/g, '\n').replaceAll('\u0000', '').trim();
}
