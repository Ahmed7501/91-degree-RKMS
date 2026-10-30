import { describe, expect, it } from 'vitest';
import { normalizeOrderText } from './normalize-order-text';

describe('normalizeOrderText (ADR-020)', () => {
  it('converts CRLF and lone CR to LF', () => {
    expect(normalizeOrderText('a\r\nb\rc\nd')).toBe('a\nb\nc\nd');
  });

  it('strips NUL characters', () => {
    expect(normalizeOrderText('2x\u0000 Zinger')).toBe('2x Zinger');
  });

  it('trims only the outer whitespace and keeps internal blank lines and spacing', () => {
    expect(normalizeOrderText('  \n 2x Tikka\n\n   1x Naan  \n\t')).toBe('2x Tikka\n\n   1x Naan');
  });

  it('preserves Urdu, Roman Urdu and emoji exactly', () => {
    const text = 'چکن کڑاہی 1\nmirchi kam 🌶️\nAddress: R-321, Malir';
    expect(normalizeOrderText(text)).toBe(text);
  });

  it('returns an empty string for whitespace-only input', () => {
    expect(normalizeOrderText(' \r\n\t \n')).toBe('');
  });

  it('leaves HTML-looking text unchanged (it is data, not markup)', () => {
    const text = '<script>alert(1)</script> <b>x</b>';
    expect(normalizeOrderText(text)).toBe(text);
  });
});
