import type { Ref, TextareaHTMLAttributes } from 'react';
import { cx } from '../../lib/cx';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  ref?: Ref<HTMLTextAreaElement>;
}

/** 16 px text (no iOS zoom), `dir="auto"` for Urdu, no spellcheck or autocomplete. */
export function Textarea({ className, ...rest }: TextareaProps) {
  return (
    <textarea
      dir="auto"
      spellCheck={false}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      className={cx(
        'order-text w-full resize-y rounded-lg border border-border bg-surface p-4 text-base leading-6 text-white',
        'placeholder:text-muted/70 focus:border-gold focus:outline-none',
        'read-only:opacity-80',
        className,
      )}
      {...rest}
    />
  );
}
