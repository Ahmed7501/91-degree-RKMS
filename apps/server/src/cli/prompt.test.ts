import { describe, expect, it } from 'vitest';
import { applyHiddenKeys } from './prompt';

describe('applyHiddenKeys', () => {
  it('collects characters until Enter', () => {
    expect(applyHiddenKeys('', 'secret')).toEqual({ state: 'typing', value: 'secret' });
    expect(applyHiddenKeys('secret', '-pass\r')).toEqual({ state: 'enter', value: 'secret-pass' });
  });

  it('ignores a stray newline left over from the previous Enter (Windows \\r\\n)', () => {
    const first = applyHiddenKeys('', '\n');
    expect(first).toEqual({ state: 'typing', value: '' });
    expect(applyHiddenKeys('', '\ncorrect horse battery\r')).toEqual({
      state: 'enter',
      value: 'correct horse battery',
    });
  });

  it('treats \\r\\n in one chunk as a single Enter', () => {
    expect(applyHiddenKeys('', 'abc\r\n')).toEqual({ state: 'enter', value: 'abc' });
  });

  it('handles both backspace codes', () => {
    expect(applyHiddenKeys('', 'abcd\u007f\bx\r')).toEqual({ state: 'enter', value: 'abx' });
    expect(applyHiddenKeys('', '\b\u007f')).toEqual({ state: 'typing', value: '' });
  });

  it('cancels on Ctrl+C', () => {
    expect(applyHiddenKeys('typed', '\u0003')).toEqual({ state: 'cancel' });
  });

  it('keeps pasted text with spaces and symbols intact', () => {
    expect(applyHiddenKeys('', 'Tikka & Karahi 91°!\r')).toEqual({
      state: 'enter',
      value: 'Tikka & Karahi 91°!',
    });
  });
});
