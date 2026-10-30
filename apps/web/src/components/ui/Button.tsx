import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { cx } from '../../lib/cx';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'danger-ghost' | 'ghost' | 'success';
type Size = 'md' | 'lg' | 'icon';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-red text-white hover:bg-red-deep',
  secondary: 'bg-surface-2 text-white border border-border hover:border-border-strong',
  'danger-ghost': 'bg-transparent text-danger border border-transparent hover:border-danger',
  ghost: 'bg-transparent text-white hover:bg-surface-2',
  success: 'bg-success-bg text-success border border-success/40 hover:border-success',
};

const SIZES: Record<Size, string> = {
  md: 'h-11 px-4 text-sm',
  lg: 'h-14 px-6 text-base',
  icon: 'size-11 justify-center',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  loadingLabel?: string;
  icon?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

/** DESIGN_SYSTEM §5. 44 px minimum target; disabled at 50% opacity; loading shows a spinner. */
export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  loadingLabel,
  icon,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex select-none items-center gap-2 rounded-md font-semibold transition',
        'active:scale-[.98] motion-reduce:active:scale-100',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner label={loadingLabel} /> : icon}
      {loading && loadingLabel ? null : children}
    </button>
  );
}
