import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from '../../lib/cx';

export interface Segment<T extends string | number> {
  value: T;
  label: ReactNode;
}

interface Props<T extends string | number> {
  label: string;
  value: T;
  options: readonly Segment<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
}

/** Radio-group semantics with arrow-key navigation (DESIGN_SYSTEM §5). */
export function SegmentedControl<T extends string | number>({
  label,
  value,
  options,
  onChange,
  disabled,
}: Props<T>) {
  const labelId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  const onKeyDown = (event: KeyboardEvent) => {
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = (index + step + options.length) % options.length;
    onChange(options[next]!.value);
    refs.current[next]?.focus();
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className="text-sm font-medium text-muted">
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        onKeyDown={onKeyDown}
        className="inline-flex flex-wrap gap-1 rounded-md bg-surface-2 p-1"
      >
        {options.map((option, i) => {
          const selected = option.value === value;
          return (
            <button
              key={String(option.value)}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={cx(
                'inline-flex h-10 min-w-11 items-center justify-center gap-1.5 rounded-sm px-3 text-sm font-semibold transition-colors',
                selected ? 'bg-red text-white' : 'text-muted hover:text-white',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
