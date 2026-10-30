import { cx } from '../../lib/cx';

const HEIGHTS = { sm: 'h-9', md: 'h-11', lg: 'h-20' } as const;

/**
 * The 91 Degree logo, cropped from the owner's menu (Q-06) and never redrawn.
 * `alt` carries the name and tagline for screen readers.
 */
export function BrandMark({
  size = 'md',
  className,
}: {
  size?: keyof typeof HEIGHTS;
  className?: string;
}) {
  return (
    <img
      src="/brand/logo.png"
      alt="91 Degree — BBQ, Fast Food, Chinese"
      className={cx(HEIGHTS[size], 'w-auto select-none', className)}
      draggable={false}
    />
  );
}
